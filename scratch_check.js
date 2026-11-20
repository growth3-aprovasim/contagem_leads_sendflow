import { getSupabaseClient } from './src/supabase.js';

async function checkNow() {
  const supabase = getSupabaseClient();
  const { data, count } = await supabase
    .from('leads_grupos_eventos')
    .select('id, numero_lead, timestamp, nome_campanha', { count: 'exact' })
    .order('timestamp', { ascending: false })
    .limit(3);

  console.log('Total eventos agora:', count);
  console.log('Últimos eventos:', data);

  const { data: mestre, count: cMestre } = await supabase
    .from('leads_grupos')
    .select('id, numero_lead, updated_at', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .limit(3);

  console.log('Total mestre agora:', cMestre);
  console.log('Últimos mestre:', mestre);
}

checkNow().catch(console.error);
