import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_KEY || '',
  supabaseTable: process.env.SUPABASE_TABLE || 'leads_grupos',
  sendtok: process.env.SENDTOK || ''
};
