-- ========================================================================
-- MIGRATION: Idempotência + Índices de Performance + View vw_leads_ativos_grupos
-- Execute no SQL Editor do Supabase (em horário de baixo tráfego, se possível)
-- ========================================================================

-- 1. Coluna e índice único de idempotência para evitar webhooks duplicados do Sendflow
ALTER TABLE public.leads_grupos_eventos
  ADD COLUMN IF NOT EXISTS event_id TEXT;

DROP INDEX IF EXISTS public.idx_leads_grupos_eventos_event_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_grupos_eventos_event_id_unique
  ON public.leads_grupos_eventos (event_id);

-- 2. Índice composto para acelerar a consulta do último status por (campanha, lead, grupo)
CREATE INDEX IF NOT EXISTS idx_leads_grupos_eventos_camp_lead_grp_ts
  ON public.leads_grupos_eventos (nome_campanha, numero_lead, nome_grupo, timestamp DESC, id DESC);

-- 3. Recria a view vw_leads_ativos_grupos usando DISTINCT ON indexado
CREATE OR REPLACE VIEW public.vw_leads_ativos_grupos AS
WITH ultimo_evento AS (
  SELECT DISTINCT ON (nome_campanha, numero_lead, nome_grupo)
    nome_campanha,
    numero_lead,
    ent_sai
  FROM public.leads_grupos_eventos
  WHERE nome_campanha IS NOT NULL
    AND numero_lead IS NOT NULL
  ORDER BY nome_campanha, numero_lead, nome_grupo, timestamp DESC, id DESC
)
SELECT
  nome_campanha,
  COUNT(DISTINCT numero_lead) AS quantidade_de_leads
FROM ultimo_evento
WHERE ent_sai = 'Entrou'
GROUP BY nome_campanha;
