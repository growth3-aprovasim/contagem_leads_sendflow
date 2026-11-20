import { normalizePayload, saveNormalizedEventsBatch } from './leadsService.js';

const MAX_BATCH_SIZE = 200;
const FLUSH_INTERVAL_MS = 300;
const MAX_QUEUE_SIZE = 50000;
const MAX_RETRIES = 3;
const DEDUP_CACHE_MAX = 50000;
const DEDUP_TTL_MS = 30 * 60 * 1000; // 30 minutos

const queue = [];
const recentKeys = new Map(); // key -> expiresAt

let flushTimer = null;
let isFlushing = false;
let isShuttingDown = false;
let flushPromise = null;

const stats = {
  enqueuedTotal: 0,
  processedTotal: 0,
  dedupedTotal: 0,
  failedTotal: 0,
  batchesTotal: 0
};

function buildDedupKey(record) {
  if (record.event_id) {
    return `id:${record.event_id}`;
  }
  const tsSec = String(record.timestamp || '').slice(0, 19);
  return `fb:${record.numero_lead || ''}|${record.nome_grupo || ''}|${record.ent_sai}|${tsSec}`;
}

function isDuplicateAndTrack(record) {
  const now = Date.now();
  const key = buildDedupKey(record);
  const exp = recentKeys.get(key);

  if (exp && exp > now) {
    return true;
  }

  // Limpeza simples quando o cache atinge o limite
  if (recentKeys.size >= DEDUP_CACHE_MAX) {
    for (const [k, v] of recentKeys.entries()) {
      if (v <= now || recentKeys.size >= DEDUP_CACHE_MAX) {
        recentKeys.delete(k);
        if (recentKeys.size < DEDUP_CACHE_MAX * 0.8) break;
      }
    }
  }

  recentKeys.set(key, now + DEDUP_TTL_MS);
  return false;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processBatchWithRetry(batch) {
  let attempt = 0;
  while (true) {
    try {
      await saveNormalizedEventsBatch(batch);
      stats.processedTotal += batch.length;
      stats.batchesTotal += 1;
      return;
    } catch (err) {
      attempt += 1;
      if (attempt > MAX_RETRIES) {
        stats.failedTotal += batch.length;
        console.error(`[QUEUE] ❌ Lote de ${batch.length} eventos falhou após ${MAX_RETRIES} tentativas:`, err.message);
        return;
      }
      const backoffMs = 500 * Math.pow(2, attempt - 1);
      console.warn(`[QUEUE] ⚠️ Erro ao gravar lote (tentativa ${attempt}/${MAX_RETRIES}), aguardando ${backoffMs}ms: ${err.message}`);
      await sleep(backoffMs);
    }
  }
}

async function drainQueue() {
  if (isFlushing) return flushPromise;
  isFlushing = true;

  flushPromise = (async () => {
    try {
      while (queue.length > 0) {
        const batch = queue.splice(0, MAX_BATCH_SIZE);
        await processBatchWithRetry(batch);
      }
    } finally {
      isFlushing = false;
      flushPromise = null;
      if (queue.length > 0 && !isShuttingDown) {
        scheduleFlush();
      }
    }
  })();

  return flushPromise;
}

function scheduleFlush() {
  if (flushTimer || isShuttingDown) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    drainQueue();
  }, FLUSH_INTERVAL_MS);
}

/**
 * Enfileira um ou mais eventos do Sendflow para gravação assíncrona em lote.
 * Retorna imediatamente para liberar a resposta HTTP 200 ao Sendflow.
 */
export function enqueueSendflowEvents(rawBody) {
  if (isShuttingDown) {
    throw new Error('Servidor em processo de encerramento.');
  }

  const rawList = Array.isArray(rawBody) ? rawBody : [rawBody];
  if (queue.length + rawList.length > MAX_QUEUE_SIZE) {
    const err = new Error('Fila de webhooks temporariamente cheia.');
    err.statusCode = 503;
    throw err;
  }

  let queued = 0;
  let deduped = 0;

  for (const item of rawList) {
    const record = normalizePayload(item);
    if (isDuplicateAndTrack(record)) {
      deduped += 1;
      stats.dedupedTotal += 1;
      continue;
    }
    queue.push(record);
    queued += 1;
    stats.enqueuedTotal += 1;
  }

  if (queue.length >= MAX_BATCH_SIZE) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    // Dispara processamento em background sem bloquear a requisição HTTP
    drainQueue();
  } else if (queue.length > 0) {
    scheduleFlush();
  }

  return { queued, deduped };
}

/**
 * Drena toda a fila pendente antes de encerrar o processo.
 */
export async function flushAndStop() {
  isShuttingDown = true;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await drainQueue();
}

export function getQueueStats() {
  return {
    pending: queue.length,
    isFlushing,
    ...stats
  };
}
