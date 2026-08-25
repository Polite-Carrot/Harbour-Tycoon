/** Display helpers. Pure, no dependency on the sim. */

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/**
 * 1234567 -> "1.23M". Plain number, no currency symbol — use this for counts
 * (cargo units, ships). Idle games live and die on readable big numbers.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const n = Math.abs(value);

  const body =
    n < 1000
      ? n < 10
        ? n.toFixed(2)
        : n < 100
          ? n.toFixed(1)
          : Math.floor(n).toString()
      : (() => {
          const tier = Math.min(Math.floor(Math.log10(n) / 3), SUFFIXES.length - 1);
          const scaled = n / Math.pow(1000, tier);
          const digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
          return `${scaled.toFixed(digits)}${SUFFIXES[tier]}`;
        })();

  return value < 0 ? `-${body}` : body;
}

/** 1234567 -> "$1.23M". The sign leads the symbol: -$5.00, not $-5.00. */
export function formatMoney(value: number): string {
  const n = formatNumber(value);
  return n.startsWith('-') ? `-$${n.slice(1)}` : `$${n}`;
}

export function formatRate(perSecond: number): string {
  return `${formatMoney(perSecond)}/s`;
}

/** 9012 -> "2h 30m". Used by the offline-earnings report. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return sec > 0 ? `${m}m ${sec}s` : `${m}m`;
  return `${sec}s`;
}

export function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
}
