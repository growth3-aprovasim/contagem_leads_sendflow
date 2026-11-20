import { getSupabaseClient } from '../supabase.js';
import { config } from '../config.js';
import { toBrasiliaIsoNoTz } from '../utils/dateTime.js';

// Controla em memória se a coluna `event_id` existe e se aceita ON CONFLICT (event_id) direto.
let eventIdColumnSupported = true;
let eventIdOnConflictSupported = true;

/**
 * Converte a data do evento para o horário de Brasília (UTC-3)
 * para que no painel do Supabase o horário coincida visualmente com o horário do Brasil.
 */
function getBrasiliaTimestamp(data) {
  if (data.createdAt_with_timezone_br) {
    return String(data.createdAt_with_timezone_br).replace(/[-+]\d{2}:\d{2}$/, '');
  }

  const baseDate = data.createdAt ? new Date(data.createdAt) : new Date();
  return toBrasiliaIsoNoTz(baseDate);
}

/**
 * Normaliza um item do payload do Sendhook para o formato interno de gravação.
 */
export function normalizePayload(payload) {
  const data = payload?.data || {};
  const event = String(payload?.event || '');

  const entSai = (event.includes('added') || event === 'group.updated.members.added')
    ? 'Entrou'
    : 'Saiu';

  let cleanNumber = data.number ? String(data.number).replace(/\D/g, '') : null;
  if (!cleanNumber && data.number) {
    cleanNumber = String(data.number);
  }

  const eventId = payload?.id ? String(payload.id).trim() : null;

  return {
    event_id: eventId || null,
    nome_campanha: data.campaignName || null,
    id_campanha: data.campaignId || null,
    nome_grupo: data.groupName || null,
    ent_sai: entSai,
    numero_lead: cleanNumber,
    timestamp: getBrasiliaTimestamp(data)
  };
}

/**
 * Deduplica os registros da tabela mestre (`leads_grupos`) por `numero_lead`
 * mantendo sempre o evento mais recente do lote para evitar erro 21000 (ON CONFLICT).
 */
function buildMasterLeadsMap(records) {
  const map = new Map();
  for (const r of records) {
    if (!r.numero_lead) continue;
    const prev = map.get(r.numero_lead);
    if (!prev || String(r.timestamp) >= String(prev.timestamp)) {
      map.set(r.numero_lead, r);
    }
  }
  return map;
}

/**
 * Faz upsert na tabela mestre `leads_grupos` preservando `primeiro_registro_em`
 * dos leads que já existem no banco e retorna um Map(numero_lead -> lead_id).
 */
async function upsertMasterLeads(supabase, masterMap) {
  const leadMap = new Map();
  if (masterMap.size === 0) return leadMap;

  const numbers = [...masterMap.keys()];

  // Consulta quais números já existem para não sobrescrever `primeiro_registro_em`
  const { data: existingRows, error: selectErr } = await supabase
    .from(config.supabaseTableLeads)
    .select('id, numero_lead')
    .in('numero_lead', numbers);

  if (selectErr) {
    throw selectErr;
  }

  const existingSet = new Set();
  for (const row of existingRows || []) {
    existingSet.add(row.numero_lead);
    leadMap.set(row.numero_lead, row.id);
  }

  const nowBr = toBrasiliaIsoNoTz();
  const newLeads = [];
  const existingLeads = [];

  for (const [num, r] of masterMap.entries()) {
    const base = {
      numero_lead: num,
      ultimo_registro_em: r.timestamp,
      ultimo_status: r.ent_sai,
      ultimo_grupo: r.nome_grupo,
      ultima_campanha: r.nome_campanha,
      updated_at: nowBr
    };

    if (existingSet.has(num)) {
      existingLeads.push(base);
    } else {
      newLeads.push({
        ...base,
        primeiro_registro_em: r.timestamp
      });
    }
  }

  if (newLeads.length > 0) {
    const { data: insertedLeads, error: newErr } = await supabase
      .from(config.supabaseTableLeads)
      .upsert(newLeads, { onConflict: 'numero_lead' })
      .select('id, numero_lead');

    if (newErr) throw newErr;
    for (const lead of insertedLeads || []) {
      leadMap.set(lead.numero_lead, lead.id);
    }
  }

  if (existingLeads.length > 0) {
    const { error: updErr } = await supabase
      .from(config.supabaseTableLeads)
      .upsert(existingLeads, { onConflict: 'numero_lead' });

    if (updErr) throw updErr;
  }

  return leadMap;
}

/**
 * Insere o lote de eventos na tabela `leads_grupos_eventos` com suporte a idempotência
 * via `event_id` (caso a coluna exista no banco) e fallback seguro caso não exista.
 */
async function insertEventsBatch(supabase, records, leadMap) {
  const baseEvents = records.map(r => ({
    lead_id: r.numero_lead ? (leadMap.get(r.numero_lead) || null) : null,
    nome_campanha: r.nome_campanha,
    id_campanha: r.id_campanha,
    nome_grupo: r.nome_grupo,
    ent_sai: r.ent_sai,
    numero_lead: r.numero_lead,
    timestamp: r.timestamp
  }));

  if (eventIdColumnSupported) {
    const eventsWithId = records.map((r, idx) => ({
      ...baseEvents[idx],
      event_id: r.event_id
    }));

    // Eventos com event_id preenchido usam upsert com ignoreDuplicates para barrar reenvios
    const withId = eventsWithId.filter(e => e.event_id);
    const withoutId = baseEvents.filter((_, idx) => !records[idx].event_id);

    if (withId.length > 0 && eventIdOnConflictSupported) {
      const { error } = await supabase
        .from(config.supabaseTableEvents)
        .upsert(withId, { onConflict: 'event_id', ignoreDuplicates: true });

      if (error) {
        const msg = String(error.message || '');
        if (error.code === '42P10') {
          console.warn('[DATABASE] ⚠️ Índice único de event_id é parcial (42P10); usando deduplicação por SELECT + INSERT.');
          eventIdOnConflictSupported = false;
        } else if (error.code === 'PGRST204' || error.code === '42703' || msg.includes('event_id')) {
          console.warn('[DATABASE] ⚠️ Coluna event_id ainda não existe em leads_grupos_eventos; usando insert padrão.');
          eventIdColumnSupported = false;
        } else {
          throw error;
        }
      } else if (withoutId.length > 0) {
        const { error: errNoId } = await supabase
          .from(config.supabaseTableEvents)
          .insert(withoutId);
        if (errNoId) throw errNoId;
        return;
      } else {
        return;
      }
    }

    if (eventIdColumnSupported && !eventIdOnConflictSupported) {
      const ids = withId.map(e => e.event_id);
      let toInsert = [...withoutId];

      if (ids.length > 0) {
        const { data: existingIds, error: selErr } = await supabase
          .from(config.supabaseTableEvents)
          .select('event_id')
          .in('event_id', ids);

        if (selErr) throw selErr;
        const existingSet = new Set((existingIds || []).map(r => r.event_id));
        toInsert = toInsert.concat(withId.filter(e => !existingSet.has(e.event_id)));
      }

      if (toInsert.length > 0) {
        const { error: insErr } = await supabase
          .from(config.supabaseTableEvents)
          .insert(toInsert);
        if (insErr) throw insErr;
      }
      return;
    }
  }

  const { error: insertErr } = await supabase
    .from(config.supabaseTableEvents)
    .insert(baseEvents);

  if (insertErr) {
    throw insertErr;
  }
}

/**
 * Processa um lote já normalizado de eventos no Supabase.
 */
export async function saveNormalizedEventsBatch(records) {
  if (!records || records.length === 0) {
    return { insertedCount: 0 };
  }

  const supabase = getSupabaseClient();
  const masterMap = buildMasterLeadsMap(records);
  const leadMap = await upsertMasterLeads(supabase, masterMap);
  await insertEventsBatch(supabase, records, leadMap);

  return {
    insertedCount: records.length
  };
}

/**
 * Mantida para compatibilidade direta (ex: chamadas síncronas pontuais).
 */
export async function saveSendflowEvent(rawBody) {
  const rawList = Array.isArray(rawBody) ? rawBody : [rawBody];
  const records = rawList.map(item => normalizePayload(item));
  return saveNormalizedEventsBatch(records);
}

/**
 * Consulta rápida de estatísticas na tabela de eventos
 */
export async function getLeadStats() {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from(config.supabaseTableEvents)
    .select('nome_campanha, nome_grupo, ent_sai, numero_lead, timestamp')
    .order('timestamp', { ascending: false })
    .limit(100);

  if (error) {
    throw error;
  }

  return data;
}
