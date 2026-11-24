import type { Market } from '../api/client';

export const marketOf = (ticker: string): Market =>
  /\.(NS|BO)$/.test(ticker) || ['^NSEI', '^BSESN', '^NSEBANK', '^INDIAVIX'].includes(ticker) ? 'india' : 'us';

const LOCALE = { india: 'en-IN', us: 'en-US' } as const;

/** Rupees for Indian tickers, dollars for US ones, decided by the ticker and nothing else. */
export function money(v: number | null | undefined, ticker: string, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '–';
  const m = marketOf(ticker);
  const symbol = ticker.startsWith('^') ? '' : m === 'india' ? '₹' : '$';
  return symbol + v.toLocaleString(LOCALE[m], { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function pct(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '–';
  const s = Math.abs(v).toFixed(digits);
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${s}%`;
}

export function rText(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '–';
  if (Math.abs(v) < 0.005) return '0.00R';
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}R`;
}

export function big(v: number | null | undefined, ticker: string): string {
  if (v == null) return '–';
  if (marketOf(ticker) === 'india') {
    return v >= 1e12 ? `₹${(v / 1e12).toFixed(2)} lakh cr` : `₹${Math.round(v / 1e7).toLocaleString('en-IN')} cr`;
  }
  return v >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : `$${(v / 1e9).toFixed(1)}B`;
}

export const symbol = (ticker: string) => ticker.replace(/\.(NS|BO)$/, '');

export const tone = (v: number | null | undefined) => (v == null || Math.abs(v) < 0.005 ? 'flat' : v > 0 ? 'up' : 'down');

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

export function until(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((Date.parse(iso) - now) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

/** "today" only when it is: on a holiday the last price is from another day. */
export function priceDay(asOf: number | undefined, ticker: string, now = Date.now()): string {
  if (!asOf) return '';
  const timeZone = marketOf(ticker) === 'india' ? 'Asia/Kolkata' : 'America/New_York';
  const day = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone });
  return day(asOf * 1000) === day(now) ? 'today' : `on ${new Date(asOf * 1000).toLocaleDateString('en-IN', { timeZone, day: 'numeric', month: 'short' })}`;
}

export const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export const CATEGORY: Record<string, string> = { intraday: 'Intraday', short_term: 'Swing', long_term: 'Position' };
export const STATUS: Record<string, string> = {
  target: 'Target', stop: 'Stopped', expired: 'Time ran out', reversed: 'Reversed', active: 'Open', void: 'Never filled', ended: 'Ended',
};
