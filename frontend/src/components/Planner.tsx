import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useOdds, type StockOut } from '../api/client';
import { money, rText, tone } from '../lib/format';
import { size } from '../lib/sizing';
import { useStored } from '../state';
import { Boundary, hasWebGL } from '../three/stage';
import { Heading, Problem } from './bits';

const OddsSurface = lazy(() => import('../three/OddsSurface'));

export interface Levels {
  entry: number;
  stop: number;
  target: number;
}

export function startingLevels(s: StockOut): Levels | null {
  const sig = s.signal;
  if (sig && sig.stop != null && sig.target != null && sig.direction === 'BUY') return { entry: sig.fill_price ?? sig.entry, stop: sig.stop, target: sig.target };
  const price = s.quote?.price ?? s.technicals.price;
  if (!price || s.suggested_stop == null || s.suggested_target == null) return null;
  // The suggestion was computed from the last daily close; carry its distances to the live price.
  const base = s.technicals.price ?? price;
  const round = (v: number) => Math.round(v * 100) / 100;
  return { entry: round(price), stop: round(price - (base - s.suggested_stop)), target: round(price + (s.suggested_target - base)) };
}

function NumberField({ label, value, onChange, step = 'any' }: { label: string; value: number; onChange: (v: number) => void; step?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText((t) => (Number(t) === value ? t : Number.isFinite(value) ? String(value) : t)); }, [value]);
  return (
    <label className="block">
      <span className="label mb-1 block">{label}</span>
      <input className="field" inputMode="decimal" type="number" min="0" step={step} value={text}
        onChange={(e) => { setText(e.target.value); onChange(e.target.value === '' ? NaN : Number(e.target.value)); }} />
    </label>
  );
}

function Slider({ label, value, min, max, step, onChange, show }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; show: string }) {
  return (
    <label className="block">
      <span className="flex justify-between"><span className="label">{label}</span><span className="num text-[14px]">{show}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--fill': `${((value - min) / (max - min)) * 100}%` } as CSSProperties} />
    </label>
  );
}

function Odd({ p, text, color }: { p: number; text: string; color: string }) {
  return (
    <div className="min-w-0">
      <div className="display text-[34px] leading-none tabular-nums">{Math.round(p * 100)}%</div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[14px] text-ink2"><i className="size-2.5 shrink-0 rounded-sm" style={{ background: color }} />{text}</div>
    </div>
  );
}

export default function Planner({ stock, levels, setLevels }: { stock: StockOut; levels: Levels; setLevels: (l: Levels) => void }) {
  const india = stock.market === 'india';
  const [capital, setCapital] = useStored(`ss.capital.${stock.market}`, india ? 100_000 : 5_000);
  const [risk, setRisk] = useStored('ss.risk', 1);
  const [days, setDays] = useState(stock.signal?.category === 'long_term' ? 30 : 10);
  const s = useMemo(() => size({ capital, riskPct: risk, ...levels }), [capital, risk, levels]);
  const request = useMemo(() => (levels.stop < levels.entry && levels.entry < levels.target ? { ...levels, days } : null), [levels, days]);
  const odds = useOdds(stock.ticker, useDeferredValue(request));
  const set = (k: keyof Levels) => (v: number) => setLevels({ ...levels, [k]: v });
  const o = odds.data;

  return (
    <section>
      <Heading>Plan the trade</Heading>
      <div className="panel grid overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4 border-line p-5 lg:border-r">
          <div className="grid grid-cols-3 gap-2.5 lg:grid-cols-1">
            <NumberField label="Entry" value={levels.entry} onChange={set('entry')} />
            <NumberField label="Stop" value={levels.stop} onChange={set('stop')} />
            <NumberField label="Target" value={levels.target} onChange={set('target')} />
          </div>
          <NumberField label={`Capital (${india ? '₹' : '$'})`} value={capital} onChange={setCapital} />
          <Slider label="Willing to lose" value={risk} min={0.25} max={3} step={0.25} onChange={setRisk} show={`${risk}%`} />
          <Slider label="Give it up to" value={days} min={3} max={60} step={1} onChange={setDays} show={`${days} sessions`} />

          {s.ok ? (
            <div className="inset p-4">
              <div className="label">Buy</div>
              <div className="display text-[38px] leading-tight tabular-nums">{s.shares.toLocaleString(india ? 'en-IN' : 'en-US')} <span className="title text-lg text-ink2">shares</span></div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[14px]">
                <div><dt className="text-ink3">Costs</dt><dd className="num">{money(s.cost, stock.ticker, 0)}</dd></div>
                <div><dt className="text-ink3">Reward to risk</dt><dd className="num">{s.ratio.toFixed(1)} : 1</dd></div>
                <div><dt className="text-ink3">If stopped</dt><dd className="num down">−{money(s.loss, stock.ticker, 0)}</dd></div>
                <div><dt className="text-ink3">If target</dt><dd className="num up">+{money(s.gain, stock.ticker, 0)}</dd></div>
              </dl>
              <p className="mt-2.5 text-[13px] text-ink3">{s.limitedBy === 'risk' ? 'Sized by what you are willing to lose.' : 'Sized by the cash you have.'} Charges and gaps not included.</p>
            </div>
          ) : <p role="status" className="inset p-4 text-[14px] text-gold">{s.problem}</p>}
        </div>

        <div className="flex min-w-0 flex-col">
          {odds.error && !o ? <Problem error={odds.error} className="m-5" /> : !o ? <div className="skeleton m-5 h-[420px]" /> : (
            <>
              <div className="grid grid-cols-3 gap-4 p-5 pb-0">
                <Odd p={o.p_target} text="reach the target first" color="var(--color-up)" />
                <Odd p={o.p_stop} text="hit the stop first" color="var(--color-down)" />
                <Odd p={o.p_neither} text="do neither in time" color="var(--color-peri)" />
              </div>
              {hasWebGL() && (
                <Boundary fallback={null}>
                  <Suspense fallback={<div className="skeleton m-5 h-[360px]" />}>
                    <OddsSurface odds={o} levels={request ?? levels} ticker={stock.ticker} className="h-[340px] min-h-[340px] flex-1 sm:min-h-[430px]" />
                  </Suspense>
                </Boundary>
              )}
              <p className="mt-auto border-t border-line p-5 text-[14px] text-ink2">
                {o.paths.toLocaleString()} futures built from this stock's last {o.history_bars} sessions with its average drift removed.
                On average they end at <b className={`num font-semibold ${tone(o.avg_r)}`}>{rText(o.avg_r)}</b> (1R is what you risk). Close to zero is normal: the levels alone give no edge, only your reason for the trade can.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
