import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

let supabase = null;

export function getSupabaseClient() {
  if (supabase) {
    return supabase;
  }

  if (!config.supabaseUrl || !config.supabaseKey) {
    throw new Error('Supabase URL ou Chave não configuradas no arquivo .env!');
  }

  supabase = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return supabase;
}
