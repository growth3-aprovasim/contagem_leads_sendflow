import { config } from '../config.js';

export function validateSendtok(req, res, next) {
  // Se nenhuma SENDTOK foi configurada no .env, permite a requisição normalmente
  if (!config.sendtok || config.sendtok.trim() === '') {
    return next();
  }

  const configuredToken = config.sendtok.trim();

  // Verifica cabeçalhos comuns (sendtok, x-sendtok, authorization, x-token)
  const headerToken = 
    req.headers['sendtok'] ||
    req.headers['x-sendtok'] ||
    req.headers['x-token'] ||
    req.headers['authorization']?.replace(/^Bearer\s+/i, '');

  // Verifica query params (?sendtok=... ou ?token=...)
  const queryToken = req.query.sendtok || req.query.token;

  // Verifica no corpo da requisição (se vier no JSON)
  const bodyToken = req.body?.sendtok || req.body?.token;

  const providedToken = headerToken || queryToken || bodyToken;

  if (!providedToken) {
    console.warn(`[AUTH] ⚠️ Tentativa de acesso sem SENDTOK em ${req.originalUrl}`);
    return res.status(401).json({
      success: false,
      error: 'Token de autorização (SENDTOK) não fornecido.'
    });
  }

  if (providedToken !== configuredToken) {
    console.warn(`[AUTH] ❌ SENDTOK inválido recebido em ${req.originalUrl}`);
    return res.status(403).json({
      success: false,
      error: 'Token de autorização (SENDTOK) inválido.'
    });
  }

  next();
}
