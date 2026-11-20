import { getLeadStats } from '../services/leadsService.js';
import { enqueueSendflowEvents, getQueueStats } from '../services/webhookQueue.js';
import { runSync, getSyncStatus } from '../services/sendflowSyncService.js';
import { getBrasiliaDateTimeParts } from '../utils/dateTime.js';

export async function handleWebhook(req, res) {
  try {
    const payload = req.body;

    if (
      !payload ||
      (Array.isArray(payload) && payload.length === 0) ||
      (!Array.isArray(payload) && (typeof payload !== 'object' || Object.keys(payload).length === 0))
    ) {
      return res.status(400).json({
        success: false,
        error: 'Payload vazio ou inválido recebido.'
      });
    }

    // Enfileira imediatamente e responde 200 OK sem bloquear no banco
    const { queued, deduped } = enqueueSendflowEvents(payload);

    // Log enxuto para acompanhamento sem saturar o stdout em picos
    const firstItem = Array.isArray(payload) ? payload[0] : payload;
    const event = String(firstItem?.event || '');
    const entSai = (event.includes('added') || event === 'group.updated.members.added') ? 'Entrou' : 'Saiu';
    const number = firstItem?.data?.number || 'N/A';
    const group = firstItem?.data?.groupName || 'N/A';
    const campaign = firstItem?.data?.campaignName || 'N/A';

    const icon = entSai === 'Entrou' ? '🟢 ➕' : '🔴 ➖';
    console.log(`[WEBHOOK] ${icon} [${entSai}] Lead: ${number} | Grupo: "${group}" | Campanha: "${campaign}" | Fila: +${queued} (dup: ${deduped})`);

    return res.status(200).json({
      success: true,
      message: 'Evento enfileirado para gravação com sucesso!',
      queued,
      deduped
    });
  } catch (error) {
    console.error('[WEBHOOK] ❌ Falha ao enfileirar evento:', error.message);

    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      error: 'Erro ao enfileirar evento do webhook.',
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
    queue: getQueueStats(),
    sync: getSyncStatus(),
    timestampBr: getBrasiliaDateTimeParts().fullStr,
    timestamp: new Date().toISOString()
  });
}

export function handleSyncStatus(req, res) {
  return res.status(200).json({
    success: true,
    ...getSyncStatus()
  });
}

export async function handleSync(req, res) {
  try {
    const releaseId = req.body?.releaseId || req.query?.releaseId || null;
    const campaignName = req.body?.campaignName || req.query?.campaignName || null;
    const dryRun = Boolean(req.body?.dryRun ?? req.query?.dryRun === 'true');
    const wait = Boolean(req.body?.wait ?? req.query?.wait === 'true');

    if (wait) {
      const result = await runSync({ releaseId, campaignName, dryRun });
      return res.status(200).json({
        success: true,
        ...result
      });
    }

    runSync({ releaseId, campaignName, dryRun }).catch((err) => {
      console.error('[SYNC] ❌ Erro na execução em segundo plano:', err.message);
    });

    return res.status(202).json({
      success: true,
      message: 'Sincronização iniciada em segundo plano. Consulte GET /sync/status para acompanhar.',
      dryRun,
      releaseId,
      campaignName
    });
  } catch (error) {
    return res.status(409).json({
      success: false,
      error: error.message
    });
  }
}
