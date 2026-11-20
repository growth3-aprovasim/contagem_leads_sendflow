const BRASILIA_TZ = 'America/Sao_Paulo';
const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Converte uma data (ou agora) para string ISO sem sufixo Z no horário de Brasília (UTC-3),
 * mantendo consistência visual nas colunas timestamp/datetime do Supabase.
 */
export function toBrasiliaIsoNoTz(inputDate = new Date()) {
  const base = inputDate instanceof Date ? inputDate : new Date(inputDate);
  const safe = Number.isNaN(base.getTime()) ? new Date() : base;
  const brTime = new Date(safe.getTime() - BRASILIA_OFFSET_MS);
  return brTime.toISOString().replace('Z', '');
}

/**
 * Retorna partes formatadas no fuso America/Sao_Paulo independentemente do TZ do servidor.
 */
export function getBrasiliaDateTimeParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BRASILIA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = {};
  for (const p of formatter.formatToParts(date)) {
    if (p.type !== 'literal') {
      parts[p.type] = p.value;
    }
  }

  const hour = parts.hour === '24' ? '00' : parts.hour;
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  const timeStr = `${hour}:${parts.minute}`;

  return {
    dateStr,
    timeStr,
    hour,
    minute: parts.minute,
    second: parts.second,
    fullStr: `${dateStr} ${timeStr}:${parts.second}`
  };
}

