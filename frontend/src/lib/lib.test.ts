import { describe, expect, it } from 'vitest';
import { ago, big, money, pct, priceDay, rText, until } from './format';
import { size } from './sizing';
import { squarify } from './treemap';

describe('money', () => {
  it('uses rupees and Indian grouping for NSE tickers', () => expect(money(123456.5, 'RELIANCE.NS')).toBe('₹1,23,456.50'));
  it('uses dollars for US tickers', () => expect(money(123456.5, 'AAPL')).toBe('$123,456.50'));
  it('has no symbol for an index', () => expect(money(25349.65, '^NSEI')).toBe('25,349.65'));
  it('shows a dash for missing values', () => expect(money(null, 'AAPL')).toBe('–'));
  it('reads large rupee values in crore', () => expect(big(18282369253376, 'RELIANCE.NS')).toBe('₹18.28 lakh cr'));
});

describe('signs and time', () => {
  it('signs percentages', () => expect([pct(1.5), pct(-1.5), pct(0)]).toEqual(['+1.50%', '−1.50%', '0.00%']));
  it('signs R', () => expect(rText(-1)).toBe('−1.00R'));
  it('counts down', () => expect(until('2026-11-25T03:45:00Z', Date.parse('2026-11-25T02:40:00Z'))).toBe('1h 05m'));
  it('never calls an older price "today"', () => {
    const friday = Date.parse('2026-11-23T10:00:00Z');
    expect(priceDay(friday / 1000, 'TCS.NS', friday)).toBe('today');
    expect(priceDay(friday / 1000, 'TCS.NS', Date.parse('2026-11-24T10:00:00Z'))).toBe('on 23 Nov');
  });
  it('ages', () => expect(ago('2026-11-24T00:00:00Z', Date.parse('2026-11-24T03:00:00Z'))).toBe('3h ago'));
});

describe('position size', () => {
  const base = { capital: 100_000, riskPct: 1, entry: 1000, stop: 950, target: 1100 };
  it('risks no more than the limit', () => expect(size(base)).toMatchObject({ ok: true, shares: 20, loss: 1000, gain: 2000, ratio: 2, limitedBy: 'risk' }));
  it('never spends more than you have', () => expect(size({ ...base, stop: 999 })).toMatchObject({ shares: 100, cost: 100_000, limitedBy: 'cash' }));
  it('refuses a stop above entry', () => expect(size({ ...base, stop: 1000 }).ok).toBe(false));
  it('refuses when a single share breaks the limit', () => expect(size({ ...base, capital: 4000 }).ok).toBe(false));
  it('refuses nonsense', () => expect(size({ ...base, capital: NaN }).ok).toBe(false));
});

describe('treemap', () => {
  const box = { x: 0, y: 0, w: 20, h: 12 };
  const w = [9, 7, 5, 3, 2, 1, 1, 0.5];
  const cells = squarify(w, box);
  it('gives each weight its share of the area', () => {
    const total = w.reduce((a, b) => a + b, 0);
    cells.forEach((c, i) => expect(c.w * c.h).toBeCloseTo((w[i]! / total) * 240, 6));
  });
  it('stays inside and never overlaps', () => {
    for (const [i, a] of cells.entries()) {
      expect(a.x >= -1e-9 && a.y >= -1e-9 && a.x + a.w <= 20 + 1e-9 && a.y + a.h <= 12 + 1e-9).toBe(true);
      for (const b of cells.slice(i + 1)) {
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        expect(ox < 1e-6 || oy < 1e-6).toBe(true);
      }
    }
  });
});
