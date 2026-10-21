import { getSupabaseClient } from '../supabase.js';
import { config } from '../config.js';

/**
 * Normaliza o payload do Sendhook para os campos exatos da tabela leads_grupos
 * Campos da tabela:
 * - nome_campanha (text)
 * - id_campanha (text)
 * - nome_grupo (text)
 * - ent_sai (text: "Entrou" ou "Saiu")
 * - numero_lead (text)
 * - timestamp (timestamptz)
 */
function normalizePayload(payload) {
  const data = payload.data || {};
  const event = String(payload.event || '');

  // Define "Entrou" para membros adicionados e "Saiu" para membros removidos
  const entSai = (event.includes('added') || event === 'group.updated.members.added') 
    ? 'Entrou' 
    : 'Saiu';

  // Limpa o número de telefone (mantém apenas dígitos)
  let cleanNumber = data.number ? String(data.number).replace(/\D/g, '') : null;
  if (!cleanNumber && data.number) {
    cleanNumber = String(data.number);
  }

  const record = {
    nome_campanha: data.campaignName || null,
    id_campanha: data.campaignId || null,
    nome_grupo: data.groupName || null,
    ent_sai: entSai,
    numero_lead: cleanNumber,
    timestamp: data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString()
  };

  return record;
}

/**
 * Salva os dados na tabela leads_grupos do Supabase
 */
export async function saveSendflowEvent(rawBody) {
  const supabase = getSupabaseClient();
  
  // Suporta tanto objeto único quanto lista de eventos em lote
  const rawList = Array.isArray(rawBody) ? rawBody : [rawBody];
  
  const recordsToInsert = rawList.map(item => normalizePayload(item));

  const { data, error } = await supabase
    .from(config.supabaseTable)
    .insert(recordsToInsert)
    .select();

  if (error) {
    console.error('[DATABASE] ❌ Erro ao inserir no Supabase:', error);
    throw error;
  }

  return {
    insertedCount: recordsToInsert.length,
    records: data
  };
}

/**
 * Consulta rápida de estatísticas na tabela leads_grupos
 */
export async function getLeadStats() {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from(config.supabaseTable)
    .select('nome_campanha, nome_grupo, ent_sai, numero_lead, timestamp')
    .order('timestamp', { ascending: false })
    .limit(100);

  if (error) {
    throw error;
  }

  return data;
}
