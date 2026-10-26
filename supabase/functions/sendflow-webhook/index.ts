// Supabase Edge Function: sendflow-webhook
// Grava diretamente na tabela leads_grupos
// Deploy: supabase functions deploy sendflow-webhook --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, sendtok, x-sendtok",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};

function getBrasiliaTimestamp(data: any) {
  if (data.createdAt_with_timezone_br) {
    return String(data.createdAt_with_timezone_br).replace(/[-+]\d{2}:\d{2}$/, "");
  }
  const baseDate = data.createdAt ? new Date(data.createdAt) : new Date();
  const brTime = new Date(baseDate.getTime() - 3 * 60 * 60 * 1000);
  return brTime.toISOString().replace("Z", "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Healthcheck via GET
  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "online", tabela: "leads_grupos" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200
    });
  }

  try {
    // Validar token SENDTOK se configurado nas variáveis de ambiente do Supabase Secrets
    const configuredToken = Deno.env.get("SENDTOK");
    if (configuredToken) {
      const headerToken = req.headers.get("sendtok") || req.headers.get("x-sendtok");
      const url = new URL(req.url);
      const queryToken = url.searchParams.get("token") || url.searchParams.get("sendtok");
      const token = headerToken || queryToken;

      if (!token || token !== configuredToken) {
        return new Response(JSON.stringify({ error: "Token SENDTOK inválido ou ausente." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401
        });
      }
    }

    const payload = await req.json();
    const rawList = Array.isArray(payload) ? payload : [payload];

    const records = rawList.map((item) => {
      const data = item.data || {};
      const event = String(item.event || "");
      const entSai = (event.includes("added") || event === "group.updated.members.added")
        ? "Entrou"
        : "Saiu";

      let cleanNumber = data.number ? String(data.number).replace(/\D/g, "") : null;
      if (!cleanNumber && data.number) cleanNumber = String(data.number);

      return {
        nome_campanha: data.campaignName || null,
        id_campanha: data.campaignId || null,
        nome_grupo: data.groupName || null,
        ent_sai: entSai,
        numero_lead: cleanNumber,
        timestamp: getBrasiliaTimestamp(data)
      };
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Upsert na tabela mestre de leads únicos (leads_grupos)
    const leadsToUpsert = records
      .filter((r: any) => r.numero_lead)
      .map((r: any) => ({
        numero_lead: r.numero_lead,
        primeiro_registro_em: r.timestamp,
        ultimo_registro_em: r.timestamp,
        ultimo_status: r.ent_sai,
        ultimo_grupo: r.nome_grupo,
        ultima_campanha: r.nome_campanha,
        updated_at: new Date().toISOString()
      }));

    const leadMap = new Map();
    if (leadsToUpsert.length > 0) {
      const { data: upsertedLeads, error: upsertErr } = await supabase
        .from("leads_grupos")
        .upsert(leadsToUpsert, { onConflict: "numero_lead" })
        .select("id, numero_lead");

      if (upsertErr) {
        throw upsertErr;
      }

      for (const lead of upsertedLeads || []) {
        leadMap.set(lead.numero_lead, lead.id);
      }
    }

    // 2. Insere histórico de eventos (leads_grupos_eventos)
    const eventsToInsert = records.map((r: any) => ({
      lead_id: r.numero_lead ? (leadMap.get(r.numero_lead) || null) : null,
      nome_campanha: r.nome_campanha,
      id_campanha: r.id_campanha,
      nome_grupo: r.nome_grupo,
      ent_sai: r.ent_sai,
      numero_lead: r.numero_lead,
      timestamp: r.timestamp
    }));

    const { error: eventsErr } = await supabase
      .from("leads_grupos_eventos")
      .insert(eventsToInsert);

    if (eventsErr) {
      throw eventsErr;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Dados gravados na tabela mestre e eventos com sucesso!",
        total: eventsToInsert.length
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500
      }
    );
  }
});
