import { saveSendflowEvent, getLeadStats } from '../services/leadsService.js';

export async function handleWebhook(req, res) {
  try {
    const payload = req.body;

    if (!payload || (typeof payload === 'object' && Object.keys(payload).length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'Payload vazio ou inválido recebido.'
      });
    }

    // Log amigável no console para acompanhamento em tempo real
    const firstItem = Array.isArray(payload) ? payload[0] : payload;
    const event = String(firstItem?.event || '');
    const entSai = (event.includes('added') || event === 'group.updated.members.added') ? 'Entrou' : 'Saiu';
    const number = firstItem?.data?.number || 'N/A';
    const group = firstItem?.data?.groupName || 'N/A';
    const campaign = firstItem?.data?.campaignName || 'N/A';

    const icon = entSai === 'Entrou' ? '🟢 ➕' : '🔴 ➖';
    console.log(`[WEBHOOK] ${icon} [${entSai}] Lead: ${number} | Grupo: "${group}" | Campanha: "${campaign}"`);

    // Salva na tabela leads_grupos do Supabase
    const result = await saveSendflowEvent(payload);

    return res.status(200).json({
      success: true,
      message: 'Evento gravado na tabela leads_grupos com sucesso!',
      totalProcessado: result.insertedCount
    });

  } catch (error) {
    console.error('[WEBHOOK] ❌ Falha ao processar evento:', error.message);

    return res.status(500).json({
      success: false,
      error: 'Erro interno ao processar e salvar na tabela leads_grupos.',
      details: error.message
    });
  }
}

export async function handleStats(req, res) {
  try {
    const stats = await getLeadStats();
    return res.status(200).json({
      success: true,
      total: stats?.length || 0,
      data: stats
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export function handleHealth(req, res) {
  return res.status(200).json({
    status: 'online',
    service: 'Contagem Leads Sendflow Webhook Server',
    tabela: 'leads_grupos',
    timestamp: new Date().toISOString()
  });
}
