export interface SizeInput {
  capital: number;
  riskPct: number;
  entry: number;
  stop: number;
  target: number;
}

export interface Size {
  ok: boolean;
  problem?: string;
  shares: number;
  cost: number;
  loss: number;
  gain: number;
  ratio: number;
  limitedBy: 'risk' | 'cash';
}

/** Whole shares that fit both the amount you are willing to lose and the cash you have. */
export function size({ capital, riskPct, entry, stop, target }: SizeInput): Size {
  const none = { shares: 0, cost: 0, loss: 0, gain: 0, ratio: 0, limitedBy: 'risk' as const };
  if (![capital, riskPct, entry, stop, target].every((v) => Number.isFinite(v) && v > 0)) return { ok: false, problem: 'Fill in every field with a number above zero.', ...none };
  if (stop >= entry) return { ok: false, problem: 'The stop has to be below your entry.', ...none };
  if (target <= entry) return { ok: false, problem: 'The target has to be above your entry.', ...none };
  const perShare = entry - stop;
  const byRisk = Math.floor((capital * riskPct) / 100 / perShare);
  const byCash = Math.floor(capital / entry);
  const shares = Math.min(byRisk, byCash);
  const ratio = (target - entry) / perShare;
  if (shares < 1) {
    return { ok: false, problem: byCash < 1 ? 'One share costs more than your capital.' : 'One share would risk more than your limit. Tighten the stop or skip it.', ...none, ratio };
  }
  return { ok: true, shares, cost: shares * entry, loss: shares * perShare, gain: shares * (target - entry), ratio, limitedBy: byRisk <= byCash ? 'risk' : 'cash' };
}
