import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_KEY || '',
  supabaseTable: process.env.SUPABASE_TABLE || 'leads_grupos',
  supabaseTableLeads: process.env.SUPABASE_TABLE_LEADS || 'leads_grupos',
  supabaseTableEvents: process.env.SUPABASE_TABLE_EVENTS || 'leads_grupos_eventos',
  sendtok: process.env.SENDTOK || '',
  sendflowApiBaseUrl: process.env.SENDFLOW_API_BASE_URL || 'https://sendapi.sendflow.pro',
  sendflowApiKey: process.env.SENDFLOW_API_KEY || '',
  syncEnabled: process.env.SYNC_ENABLED !== 'false' && Boolean(process.env.SENDFLOW_API_KEY),
  syncTimeBr: process.env.SYNC_TIME_BR || '00:00',
  syncBatchSize: Number(process.env.SYNC_BATCH_SIZE) || 200,
  syncBatchDelayMs: Number(process.env.SYNC_BATCH_DELAY_MS) || 150,
  syncCampaignDelayMs: Number(process.env.SYNC_CAMPAIGN_DELAY_MS) || 5000
};
