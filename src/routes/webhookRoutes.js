import { Router } from 'express';
import { handleWebhook, handleHealth, handleStats } from '../controllers/webhookController.js';
import { validateSendtok } from '../middlewares/authMiddleware.js';

const router = Router();

// Endpoint de saúde para checagem rápida
router.get('/health', handleHealth);

// Endpoint de estatísticas de contagem
router.get('/stats', handleStats);

// Endpoints principais para receber o webhook do Sendflow
// Suporta tanto /webhook quanto / para flexibilidade total
router.post('/webhook', validateSendtok, handleWebhook);
router.post('/', validateSendtok, handleWebhook);

export default router;
