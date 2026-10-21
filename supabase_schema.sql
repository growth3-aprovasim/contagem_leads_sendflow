-- ========================================================================
-- ESTRUTURA DA TABELA `leads_grupos` E VIEWS DE CONTAGEM
-- ========================================================================

-- Tabela existente no seu Supabase:
CREATE TABLE IF NOT EXISTS public.leads_grupos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome_campanha TEXT,
    id_campanha TEXT,
    nome_grupo TEXT,
    ent_sai TEXT,                                     -- 'Entrou' ou 'Saiu'
    numero_lead TEXT,                                 -- Número de telefone do lead
    timestamp TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índices recomendados para contagem rápida e filtros de campanhas
CREATE INDEX IF NOT EXISTS idx_leads_grupos_id_campanha ON public.leads_grupos(id_campanha);
CREATE INDEX IF NOT EXISTS idx_leads_grupos_nome_grupo ON public.leads_grupos(nome_grupo);
CREATE INDEX IF NOT EXISTS idx_leads_grupos_ent_sai ON public.leads_grupos(ent_sai);
CREATE INDEX IF NOT EXISTS idx_leads_grupos_numero_lead ON public.leads_grupos(numero_lead);
CREATE INDEX IF NOT EXISTS idx_leads_grupos_timestamp ON public.leads_grupos(timestamp DESC);

-- View opcional para Contagem Consolidada por Campanha:
CREATE OR REPLACE VIEW public.view_contagem_campanhas AS
SELECT 
    id_campanha,
    nome_campanha,
    COUNT(*) FILTER (WHERE ent_sai = 'Entrou') AS total_entraram,
    COUNT(*) FILTER (WHERE ent_sai = 'Saiu') AS total_sairam,
    (COUNT(*) FILTER (WHERE ent_sai = 'Entrou') - COUNT(*) FILTER (WHERE ent_sai = 'Saiu')) AS saldo_atual_leads,
    COUNT(DISTINCT numero_lead) AS total_leads_unicos,
    MAX(timestamp) AS ultimo_registro
FROM public.leads_grupos
GROUP BY id_campanha, nome_campanha;

-- View opcional para Contagem Consolidada por Grupo:
CREATE OR REPLACE VIEW public.view_contagem_grupos AS
SELECT 
    nome_campanha,
    nome_grupo,
    COUNT(*) FILTER (WHERE ent_sai = 'Entrou') AS total_entraram,
    COUNT(*) FILTER (WHERE ent_sai = 'Saiu') AS total_sairam,
    (COUNT(*) FILTER (WHERE ent_sai = 'Entrou') - COUNT(*) FILTER (WHERE ent_sai = 'Saiu')) AS saldo_atual_leads,
    COUNT(DISTINCT numero_lead) AS total_leads_unicos,
    MAX(timestamp) AS ultimo_registro
FROM public.leads_grupos
GROUP BY nome_campanha, nome_grupo;
