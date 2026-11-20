import crypto from 'node:crypto';
import { config } from '../config.js';
import { getSupabaseClient } from '../supabase.js';
import { saveNormalizedEventsBatch } from './leadsService.js';
import { getBrasiliaDateTimeParts, toBrasiliaIsoNoTz } from '../utils/dateTime.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let syncRunning = false;
let schedulerTimer = null;
let lastScheduledRunDate = null;

// /releases tem rate limit de 5 minutos; mantemos cache em memória por 6 minutos
const RELEASES_CACHE_TTL_MS = 6 * 60 * 1000;
let releasesCache = { fetchedAt: 0, items: null };

const lastSyncState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  lastResult: null,
  lastError: null
};

export function getSyncStatus() {
  return {
    ...lastSyncState,
    running: syncRunning,
    schedulerEnabled: config.syncEnabled,
    syncTimeBr: config.syncTimeBr,
    nowBrasilia: getBrasiliaDateTimeParts().fullStr
  };
}

function getSendflowHeaders() {
  if (!config.sendflowApiKey) {
    throw new Error('SENDFLOW_API_KEY não configurada no ambiente.');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.sendflowApiKey}`
  };
}

/**
 * Busca automaticamente todas as campanhas ativas (archived === false) no SendFlow.
 * Respeita o rate limit de 5 minutos do endpoint /releases usando cache de 6 minutos.
 */
export async function fetchActiveReleases({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && releasesCache.items && (now - releasesCache.fetchedAt) < RELEASES_CACHE_TTL_MS) {
    return releasesCache.items;
  }

  const url = `${config.sendflowApiBaseUrl.replace(/\/+$/, '')}/releases`;
  const res = await fetch(url, { headers: getSendflowHeaders() });
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`SendFlow /releases retornou ${res.status}: ${text.slice(0, 300)}`);
  }

  const list = JSON.parse(text);
  if (!Array.isArray(list)) {
    throw new Error('Resposta inesperada de /releases (não é um array).');
  }

  const active = list
    .filter((r) => r && r.archived === false && r.id && r.name)
    .map((r) => ({
      id: String(r.id),
      name: String(r.name),
      accountIds: Array.isArray(r.accountIds) ? r.accountIds : []
    }));

  releasesCache = { fetchedAt: now, items: active };
  return active;
}

/**
 * Caso /actions/export-leads estoure o timeout HTTP inicial, acompanha GET /actions/{actionId}
 * conforme recomendado pela documentação do SendFlow, em vez de criar outra exportação.
 */
async function waitActionUrl(actionId, maxWaitMs = 120000) {
  const base = config.sendflowApiBaseUrl.replace(/\/+$/, '');
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    await sleep(5000);
    const res = await fetch(`${base}/actions/${actionId}`, { headers: getSendflowHeaders() });
    if (!res.ok) continue;
    const data = await res.json();
    if (data?.url) return data.url;
    if (data?.status === 'error' || data?.status === 'failed' || data?.error) {
      throw new Error(`Ação ${actionId} falhou: ${data.error || data.status}`);
    }
  }

  throw new Error(`Timeout aguardando conclusão da ação ${actionId} no SendFlow.`);
}

/**
 * Solicita o CSV de membros ativos da campanha no SendFlow (/actions/export-leads)
 * e extrai pares únicos (numero, grupo).
 */
export async function exportActiveLeadsFromSendflow(releaseId) {
  const url = `${config.sendflowApiBaseUrl.replace(/\/+$/, '')}/actions/export-leads`;
  const res = await fetch(url, {
    method: 'POST',
    headers: getSendflowHeaders(),
    body: JSON.stringify({
      releaseId,
      includeLeft: false,
      excludeAdmins: false,
      timeout: 120000
    })
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`SendFlow /actions/export-leads (${releaseId}) retornou ${res.status}: ${bodyText.slice(0, 300)}`);
  }

  const payload = JSON.parse(bodyText);
  let csvUrl = payload?.url || null;

  if (!csvUrl && payload?.actionId && !payload?.error) {
    console.log(`[SYNC] ⏳ Exportação ${payload.actionId} em andamento; consultando GET /actions/${payload.actionId}...`);
    csvUrl = await waitActionUrl(payload.actionId);
  }

  if (!csvUrl) {
    throw new Error(`Resposta sem URL de export-leads para ${releaseId}: ${bodyText.slice(0, 300)}`);
  }

  const csvRes = await fetch(csvUrl);
  if (!csvRes.ok) {
    throw new Error(`Falha ao baixar CSV exportado (${csvRes.status}) para ${releaseId}`);
  }

  const csvText = await csvRes.text();
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const pairsMap = new Map();

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(';');
    if (parts.length < 4) continue;
    const grupo = (parts[1] || '').trim();
    const numero = (parts[3] || '').trim().replace(/\D/g, '');
    if (!numero) continue;
    const key = `${numero}|${grupo}`;
    if (!pairsMap.has(key)) {
      pairsMap.set(key, { numero, grupo });
    }
  }

  return {
    totalRows: Math.max(0, lines.length - 1),
    pairsMap
  };
}

/**
 * Lê sequencialmente (1 página por vez) o estado atual dos pares (numero_lead, nome_grupo) no Supabase.
 */
async function fetchCampaignLatestPairs(campaignName) {
  const supabase = getSupabaseClient();
  const latestByPair = new Map();
  let from = 0;
  const pageSize = 1000;
  let totalEvents = 0;

  while (true) {
    const { data, error } = await supabase
      .from(config.supabaseTableEvents)
      .select('id, numero_lead, nome_grupo, ent_sai, timestamp')
      .eq('nome_campanha', campaignName)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Erro ao ler eventos de "${campaignName}" (offset ${from}): ${error.message}`);
    }

    if (!data || data.length === 0) break;
    totalEvents += data.length;

    for (const ev of data) {
      if (!ev.numero_lead) continue;
      const key = `${ev.numero_lead}|${ev.nome_grupo || ''}`;
      const prev = latestByPair.get(key);
      if (!prev) {
        latestByPair.set(key, ev);
      } else {
        const tPrev = new Date(prev.timestamp).getTime();
        const tCur = new Date(ev.timestamp).getTime();
        if (tCur > tPrev || (tCur === tPrev && ev.id > prev.id)) {
          latestByPair.set(key, ev);
        }
      }
    }

    if (data.length < pageSize) break;
    from += pageSize;
    await sleep(50);
  }

  return { totalEvents, latestByPair };
}

function buildSyncEventId(direction, releaseId, numero, grupo, dateStr) {
  const groupHash = crypto.createHash('sha1').update(String(grupo || '')).digest('hex').slice(0, 10);
  return `sync_${direction}_${releaseId}_${numero}_${groupHash}_${dateStr}`;
}

/**
 * Reconcilia uma única campanha comparando em memória o export do SendFlow com o Supabase.
 */
export async function syncSingleRelease(release, { dryRun = false } = {}) {
  const brNow = getBrasiliaDateTimeParts();
  const syncStartBr = toBrasiliaIsoNoTz(new Date());
  const syncStartMs = new Date(syncStartBr).getTime();

  console.log(`[SYNC] 🔄 Iniciando "${release.name}" (${release.id}) | dryRun=${dryRun} | ${brNow.fullStr} BRT`);

  const { totalRows, pairsMap: csvPairs } = await exportActiveLeadsFromSendflow(release.id);
  const { totalEvents, latestByPair } = await fetchCampaignLatestPairs(release.name);

  let dbActivePairsCount = 0;
  for (const ev of latestByPair.values()) {
    if (ev.ent_sai === 'Entrou') dbActivePairsCount++;
  }

  // Trava de segurança: nunca aplicar Saiu em massa se o export vier vazio quando o banco tem ativos
  if (csvPairs.size === 0 && dbActivePairsCount > 0) {
    throw new Error(`Trava de segurança acionada para "${release.name}": export vazio (0 leads) enquanto o banco tem ${dbActivePairsCount} ativos.`);
  }

  const deltaEvents = [];
  let entrouToAdd = 0;
  let saiuToAdd = 0;

  // 1. Quem está ativo no SendFlow e não está ativo no banco -> Entrou
  for (const [key, { numero, grupo }] of csvPairs.entries()) {
    const cur = latestByPair.get(key);
    if (!cur || cur.ent_sai !== 'Entrou') {
      entrouToAdd++;
      deltaEvents.push({
        event_id: buildSyncEventId('in', release.id, numero, grupo, brNow.dateStr),
        nome_campanha: release.name,
        id_campanha: release.id,
        nome_grupo: grupo || null,
        ent_sai: 'Entrou',
        numero_lead: numero,
        timestamp: syncStartBr
      });
    }
  }

  // 2. Quem está ativo no banco e não está no SendFlow -> Saiu (apenas se último evento foi antes do export)
  for (const [key, ev] of latestByPair.entries()) {
    if (ev.ent_sai === 'Entrou' && !csvPairs.has(key)) {
      const evMs = new Date(ev.timestamp).getTime();
      if (!Number.isNaN(evMs) && evMs >= syncStartMs) {
        continue;
      }
      saiuToAdd++;
      deltaEvents.push({
        event_id: buildSyncEventId('out', release.id, ev.numero_lead, ev.nome_grupo, brNow.dateStr),
        nome_campanha: release.name,
        id_campanha: release.id,
        nome_grupo: ev.nome_grupo || null,
        ent_sai: 'Saiu',
        numero_lead: ev.numero_lead,
        timestamp: syncStartBr
      });
    }
  }

  let written = 0;
  if (!dryRun && deltaEvents.length > 0) {
    const batchSize = Math.max(50, config.syncBatchSize);
    for (let i = 0; i < deltaEvents.length; i += batchSize) {
      const chunk = deltaEvents.slice(i, i + batchSize);
      const { insertedCount } = await saveNormalizedEventsBatch(chunk);
      written += insertedCount;
      if (i + batchSize < deltaEvents.length) {
        await sleep(config.syncBatchDelayMs);
      }
    }
  }

  const summary = {
    releaseId: release.id,
    campaignName: release.name,
    dryRun,
    csvTotalRows: totalRows,
    csvUniquePairs: csvPairs.size,
    dbEventsScanned: totalEvents,
    dbActivePairsBefore: dbActivePairsCount,
    entrouToAdd,
    saiuToAdd,
    totalDelta: deltaEvents.length,
    writtenToDb: written,
    finishedAtBr: getBrasiliaDateTimeParts().fullStr
  };

  console.log(`[SYNC] ✅ "${release.name}": CSV=${csvPairs.size} | BancoAntes=${dbActivePairsCount} | +Entrou=${entrouToAdd} | +Saiu=${saiuToAdd} | Gravados=${written}`);
  return summary;
}

/**
 * Executa a reconciliação para todas as campanhas ativas (ou filtradas por releaseId/campaignName).
 */
export async function runSync({ releaseId = null, campaignName = null, dryRun = false } = {}) {
  if (syncRunning) {
    throw new Error('Já existe uma sincronização em andamento.');
  }

  syncRunning = true;
  lastSyncState.running = true;
  lastSyncState.startedAt = getBrasiliaDateTimeParts().fullStr;
  lastSyncState.lastError = null;

  try {
    let releases = await fetchActiveReleases();

    if (releaseId) {
      releases = releases.filter((r) => r.id === String(releaseId));
    }
    if (campaignName) {
      const target = String(campaignName).trim().toLowerCase();
      releases = releases.filter((r) => r.name.toLowerCase().includes(target));
    }

    const results = [];
    for (let i = 0; i < releases.length; i++) {
      const rel = releases[i];
      try {
        const res = await syncSingleRelease(rel, { dryRun });
        results.push({ ok: true, ...res });
      } catch (err) {
        console.error(`[SYNC] ❌ Falha em "${rel.name}" (${rel.id}):`, err.message);
        results.push({ ok: false, releaseId: rel.id, campaignName: rel.name, error: err.message });
      }

      if (i + 1 < releases.length) {
        await sleep(config.syncCampaignDelayMs);
      }
    }

    lastSyncState.finishedAt = getBrasiliaDateTimeParts().fullStr;
    lastSyncState.lastResult = {
      dryRun,
      campaignsProcessed: results.length,
      results
    };
    return lastSyncState.lastResult;
  } catch (err) {
    lastSyncState.finishedAt = getBrasiliaDateTimeParts().fullStr;
    lastSyncState.lastError = err.message;
    throw err;
  } finally {
    syncRunning = false;
    lastSyncState.running = false;
  }
}

/**
 * Inicia o agendador diário no horário de Brasília (padrão 00:00).
 */
export function startDailySyncScheduler() {
  if (!config.syncEnabled) {
    console.log('[SYNC] ⏸️  Agendador diário desativado (defina SENDFLOW_API_KEY e SYNC_ENABLED=true para ativar).');
    return;
  }

  if (schedulerTimer) return;

  console.log(`[SYNC] ⏰ Agendador diário ativo para ${config.syncTimeBr} (Horário de Brasília).`);

  schedulerTimer = setInterval(() => {
    const nowBr = getBrasiliaDateTimeParts();
    if (nowBr.timeStr === config.syncTimeBr && lastScheduledRunDate !== nowBr.dateStr && !syncRunning) {
      lastScheduledRunDate = nowBr.dateStr;
      console.log(`[SYNC] 🌙 Disparando rotina diária (${nowBr.fullStr} BRT)...`);
      runSync({ dryRun: false }).catch((err) => {
        console.error('[SYNC] ❌ Erro na rotina diária:', err.message);
      });
    }
  }, 30 * 1000);

  if (typeof schedulerTimer.unref === 'function') {
    schedulerTimer.unref();
  }
}

