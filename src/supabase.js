import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

// Polyfill para evitar erro de inicialização do RealtimeClient do Supabase em ambientes Node < 22
// Como usamos apenas chamadas REST/PostgREST para salvar leads, o WebSocket não é utilizado
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class WebSocketPolyfill {};
}

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
