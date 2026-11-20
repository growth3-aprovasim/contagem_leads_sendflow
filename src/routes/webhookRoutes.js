import { Router } from 'express';
import { handleWebhook, handleHealth, handleStats, handleSync, handleSyncStatus } from '../controllers/webhookController.js';
import { validateSendtok } from '../middlewares/authMiddleware.js';

const router = Router();

// Endpoint de saúde para checagem rápida
router.get('/health', handleHealth);

// Endpoint de estatísticas de contagem
router.get('/stats', handleStats);

// Endpoints de reconciliação com o SendFlow
router.get('/sync/status', handleSyncStatus);
router.post('/sync', validateSendtok, handleSync);

// Endpoints principais para receber o webhook do Sendflow
// Suporta tanto /webhook quanto / para flexibilidade total
router.post('/webhook', validateSendtok, handleWebhook);
router.post('/', validateSendtok, handleWebhook);

export default router;
