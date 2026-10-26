import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_KEY || '',
  supabaseTable: process.env.SUPABASE_TABLE || 'leads_grupos',
  supabaseTableLeads: process.env.SUPABASE_TABLE_LEADS || 'leads_grupos',
  supabaseTableEvents: process.env.SUPABASE_TABLE_EVENTS || 'leads_grupos_eventos',
  sendtok: process.env.SENDTOK || ''
};
