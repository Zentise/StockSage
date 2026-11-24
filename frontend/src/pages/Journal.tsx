import { Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useClosePosition, useDeletePosition, useOpenPosition, usePortfolio, useSearchList, type Portfolio, type Position } from '../api/client';
import { Empty, Heading, Problem, Rail, Segmented } from '../components/bits';
import OwnerGate from '../components/OwnerGate';
import { dayMonth, marketOf, money, rText, symbol, tone } from '../lib/format';
import { useApp } from '../state';

type Kind = 'all' | 'paper' | 'real';

function Stat({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="panel p-4" title={hint}>
      <div className="label">{label}</div>
      <div className="num mt-1 text-[24px] leading-none">{children}</div>
    </div>
  );
}

const money0 = (v: number | null | undefined, t: string) => money(v, t, 0);

function Form({ initial, onDone }: { initial: Record<string, string>; onDone: () => void }) {
  const { data: list } = useSearchList();
  const open = useOpenPosition();
  const [f, setF] = useState({ ticker: initial.ticker ?? '', qty: initial.qty ?? '', entry: initial.entry ?? '', stop: initial.stop ?? '', target: initial.target ?? '', why: initial.why ?? '', paper: initial.paper !== '0' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const num = (v: string) => (v.trim() === '' || !Number.isFinite(+v) ? null : +v);
  const entry = num(f.entry), stop = num(f.stop), target = num(f.target), qty = num(f.qty);
  const ticker = f.ticker.trim().toUpperCase();
  const risk = entry != null && stop != null && qty != null && stop < entry ? (entry - stop) * qty : null;
  const rr = entry != null && stop != null && target != null && stop < entry && target > entry ? (target - entry) / (entry - stop) : null;
  const known = !!list?.some((s) => s.ticker === ticker);
  const problem = !ticker ? 'Pick a stock.' : qty == null || qty <= 0 ? 'Enter how many shares.' : entry == null || entry <= 0 ? 'Enter the entry price.'
    : stop != null && stop >= (entry ?? 0) ? 'The stop must be below the entry.' : target != null && target <= (entry ?? 0) ? 'The target must be above the entry.' : null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (problem) return;
    open.mutate({ ticker, qty: qty!, entry: entry!, stop, target, paper: f.paper, why: f.why, setup: initial.setup ?? null }, { onSuccess: onDone });
  };
  return (
    <form onSubmit={submit} className="panel space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h3 className="title text-lg">Log a trade</h3>
        <button type="button" onClick={onDone} aria-label="Close the form" className="press grid size-9 place-items-center rounded-lg text-ink3 hover-ink"><X size={16} aria-hidden /></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <label className="sm:col-span-2"><span className="label mb-1 block">Stock</span>
          <input className="field" list="stocks" value={f.ticker} onChange={set('ticker')} placeholder="TCS.NS" autoCapitalize="characters" spellCheck={false} />
          <datalist id="stocks">{list?.map((s) => <option key={s.ticker} value={s.ticker}>{s.name}</option>)}</datalist>
        </label>
        {([['qty', 'Shares'], ['entry', 'Entry'], ['stop', 'Stop'], ['target', 'Target']] as const).map(([k, l]) => (
          <label key={k}><span className="label mb-1 block">{l}</span><input className="field" inputMode="decimal" value={f[k]} onChange={set(k)} /></label>
        ))}
      </div>
      <label className="block"><span className="label mb-1 block">Why this trade, in a sentence</span>
        <input className="field !font-sans" maxLength={600} value={f.why} onChange={set('why')} placeholder="Written before the trade, read after it." />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[14px] text-ink2">
          <Segmented label="Kind" value={f.paper ? 'paper' : 'real'} onChange={(v) => setF((x) => ({ ...x, paper: v === 'paper' }))} options={[['paper', 'Paper'], ['real', 'Real money']]} />
          {risk != null && <span>You risk <b className="num text-ink">{money0(risk, ticker || 'X.NS')}</b></span>}
          {rr != null && <span>Reward is <b className="num text-ink">{rr.toFixed(1)}x</b> the risk</span>}
          {ticker && !known && <span className="text-gold">Not in the tracked lists; prices still work for any valid symbol.</span>}
        </div>
        <button type="submit" className="btn btn-gold press" disabled={!!problem || open.isPending}>{open.isPending ? 'Saving…' : 'Save trade'}</button>
      </div>
      {problem && f.ticker !== '' && <p className="text-[14px] text-ink3">{problem}</p>}
      {f.paper && <p className="text-[13px] text-ink3">Paper trades close themselves when the real price path reaches the stop or target, so you can test a plan without money.</p>}
      {open.error && <Problem error={open.error} />}
    </form>
  );
}

function CloseForm({ p, price, mistakes, onDone }: { p: Position; price: number | null; mistakes: string[]; onDone: () => void }) {
  const close = useClosePosition();
  const [px, setPx] = useState(price ? String(price) : '');
  const [mistake, setMistake] = useState('none');
  const [lesson, setLesson] = useState('');
  const n = +px;
  const reason = p.stop != null && n <= p.stop ? 'stop' : p.target != null && n >= p.target ? 'target' : 'manual';
  return (
    <form className="grid gap-3 border-t border-line bg-deep/60 p-4 sm:grid-cols-[130px_170px_1fr_auto]" onSubmit={(e) => {
      e.preventDefault();
      close.mutate({ id: p.id, body: { price: n, reason, lesson, mistake } }, { onSuccess: onDone });
    }}>
      <label><span className="label mb-1 block">Exit price</span><input className="field" inputMode="decimal" value={px} onChange={(e) => setPx(e.target.value)} /></label>
      <label><span className="label mb-1 block">Did you slip?</span>
        <select className="field !font-sans" value={mistake} onChange={(e) => setMistake(e.target.value)}>{mistakes.map((m) => <option key={m} value={m}>{m}</option>)}</select>
      </label>
      <label><span className="label mb-1 block">What did you learn?</span><input className="field !font-sans" maxLength={600} value={lesson} onChange={(e) => setLesson(e.target.value)} /></label>
      <div className="flex items-end gap-2">
        <button type="submit" className="btn btn-gold press" disabled={!(n > 0) || close.isPending}>Close trade</button>
        <button type="button" className="btn btn-line press" onClick={onDone}>Cancel</button>
      </div>
      {close.error && <div className="sm:col-span-4"><Problem error={close.error} /></div>}
    </form>
  );
}

function OpenTrades({ d }: { d: Portfolio }) {
  const { live } = useApp();
  const [closing, setClosing] = useState<number | null>(null);
  const del = useDeletePosition();
  if (!d.open.length) return <Empty title="No open trades">Log a trade above. Paper trades manage themselves; real ones get a Telegram message when price reaches your stop or target.</Empty>;
  return (
    <ul className="panel divide-y divide-line overflow-hidden">
      {d.open.map((p) => {
        const price = live[p.ticker]?.price ?? p.price ?? null;
        const pnl = price == null ? null : (price - p.entry) * p.qty;
        const r = price != null && p.stop != null ? (price - p.entry) / (p.entry - p.stop) : null;
        return (
          <li key={p.id}>
            <div className="grid items-center gap-x-5 gap-y-3 p-4 md:grid-cols-[170px_1fr_150px_auto]">
              <div>
                <Link to={`/stock/${encodeURIComponent(p.ticker)}`} className="display text-[20px] leading-none hover-ink">{symbol(p.ticker)}</Link>
                <div className="mt-1 text-[13px] text-ink3">{p.qty} shares at {money(p.entry, p.ticker)}, {dayMonth(p.opened_at)}{p.paper ? ' (paper)' : ''}</div>
              </div>
              {p.stop != null && p.target != null ? (
                <div><Rail stop={p.stop} entry={p.entry} target={p.target} price={price} />
                  <div className="num flex justify-between text-[12px] text-ink3"><span>{money(p.stop, p.ticker)}</span><span>{money(p.target, p.ticker)}</span></div></div>
              ) : <p className="text-[14px] text-ink3">No stop set. Without one the trade has no risk to measure.</p>}
              <div className="text-right">
                <div className={`num text-[18px] ${tone(pnl)}`}>{pnl == null ? '–' : `${pnl >= 0 ? '+' : '−'}${money0(Math.abs(pnl), p.ticker)}`}</div>
                <div className={`num text-[13px] ${tone(r)}`}>{rText(r)}</div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-line press" onClick={() => setClosing(closing === p.id ? null : p.id)}>Close</button>
                <button type="button" aria-label={`Delete ${symbol(p.ticker)}`} className="press grid size-10 place-items-center rounded-lg text-ink3 hover-ink" disabled={del.isPending}
                  onClick={() => confirm(`Delete this ${symbol(p.ticker)} trade from the journal? It will not count in your stats.`) && del.mutate(p.id)}><Trash2 size={16} aria-hidden /></button>
              </div>
            </div>
            {p.why && <p className="px-4 pb-3 text-[14px] text-ink2">“{p.why}”</p>}
            {closing === p.id && <CloseForm p={p} price={price} mistakes={d.mistakes} onDone={() => setClosing(null)} />}
          </li>
        );
      })}
    </ul>
  );
}

function RCurve({ d }: { d: Portfolio }) {
  const pts = d.curve;
  if (pts.length < 2) return null;
  const W = 1000, H = 220, all = pts.map((p) => p.total).concat(0);
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const px = (n: number) => (n / (pts.length - 1)) * W, py = (v: number) => H - 12 - ((v - lo) / span) * (H - 24);
  const path = pts.map((p, n) => `${n ? 'L' : 'M'}${px(n).toFixed(1)},${py(p.total).toFixed(1)}`).join('');
  return (
    <div className="panel p-5">
      <h3 className="title mb-3 text-lg">Your running total in R</h3>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[190px] w-full" role="img" aria-label={`Running total ends at ${rText(pts.at(-1)!.total)} after ${pts.length} trades`}>
        <line x1="0" x2={W} y1={py(0)} y2={py(0)} stroke="var(--color-line2)" vectorEffect="non-scaling-stroke" />
        <path d={path} fill="none" stroke="var(--color-gold)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function Lessons({ d }: { d: Portfolio }) {
  const rows = Object.entries(d.by_mistake).filter(([, v]) => v.n > 0);
  if (rows.length < 2) return null;
  return (
    <div className="panel p-5">
      <h3 className="title mb-1 text-lg">What your slips cost</h3>
      <p className="mb-3 text-[14px] text-ink2">Average result of closed trades by the tag you gave them. If one tag is steadily negative, that is the habit to fix.</p>
      <table className="w-full text-[14px]">
        <thead><tr className="text-left text-[13px] text-ink3"><th className="py-2 font-normal">Tag</th><th className="py-2 text-right font-normal">Trades</th><th className="py-2 text-right font-normal">Average</th><th className="py-2 text-right font-normal">Total</th></tr></thead>
        <tbody className="divide-y divide-line border-t border-line">
          {rows.map(([k, v]) => (
            <tr key={k}><td className="py-2">{k}</td><td className="num py-2 text-right">{v.n}</td><td className={`num py-2 text-right ${tone(v.avg_r)}`}>{rText(v.avg_r)}</td><td className={`num py-2 text-right ${tone(v.total_r)}`}>{rText(v.total_r)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Body() {
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState<Kind>('all');
  const [form, setForm] = useState(false);
  const { data: d, error, refetch } = usePortfolio(kind === 'all' ? undefined : kind === 'paper');
  const prefill = useMemo(() => Object.fromEntries(params.entries()), [params]);
  useEffect(() => { if (params.get('ticker')) setForm(true); }, [params]);
  const cur = d?.open[0]?.ticker ?? params.get('ticker') ?? 'X.NS';
  const done = () => { setForm(false); if (params.size) setParams({}, { replace: true }); };
  if (error && !d) return <Problem error={error} retry={() => refetch()} />;
  if (!d) return <div className="space-y-5"><div className="skeleton h-24" /><div className="skeleton h-64" /></div>;
  const s = d.stats;
  return (
    <div className="space-y-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Show" value={kind} onChange={setKind} options={[['all', 'Everything'], ['paper', 'Paper'], ['real', 'Real money']]} />
        {!form && <button type="button" className="btn btn-gold press" onClick={() => setForm(true)}><Plus size={16} aria-hidden />Log a trade</button>}
      </div>
      {form && <Form initial={prefill} onDone={done} />}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Open risk" hint="What you lose if every open trade hits its stop">{money0(d.open_risk, cur)}</Stat>
        <Stat label="Open profit or loss"><span className={tone(d.open_pnl)}>{d.open_pnl >= 0 ? '+' : '−'}{money0(Math.abs(d.open_pnl), cur)}</span></Stat>
        <Stat label="Win rate" hint="Closed trades with a stop">{s.win_rate == null ? '–' : `${Math.round(s.win_rate * 100)}%`}</Stat>
        <Stat label="Average trade"><span className={tone(s.avg_r)}>{rText(s.avg_r)}</span></Stat>
        <Stat label="Total" hint={`${s.with_r} closed trades with a stop`}><span className={tone(s.total_r)}>{rText(s.total_r)}</span></Stat>
      </div>
      <section><Heading>Open trades</Heading><OpenTrades d={d} /></section>
      <div className="grid items-start gap-6 lg:grid-cols-2"><RCurve d={d} /><Lessons d={d} /></div>
      <section>
        <Heading>Closed trades</Heading>
        {d.closed.length ? (
          <div className="panel max-h-[520px] overflow-auto">
            <table className="w-full min-w-[720px] text-[14px]">
              <thead className="sticky top-0 bg-panel"><tr className="text-left text-[13px] text-ink3">{['Stock', 'Closed', 'How', 'Slip', 'Lesson', 'Result'].map((h, i) => <th key={h} className={`px-5 py-3 font-normal ${i === 5 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line border-t border-line">
                {d.closed.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-2.5"><Link to={`/stock/${encodeURIComponent(p.ticker)}`} className="font-semibold hover-ink">{symbol(p.ticker)}</Link>{p.paper && <span className="text-ink3"> paper</span>}</td>
                    <td className="px-5 py-2.5">{p.closed_at ? dayMonth(p.closed_at) : ''}</td>
                    <td className="px-5 py-2.5">{p.close_reason === 'manual' ? 'You closed it' : p.close_reason === 'stop' ? 'Stop' : 'Target'}</td>
                    <td className="px-5 py-2.5 text-ink2">{p.mistake && p.mistake !== 'none' ? p.mistake : ''}</td>
                    <td className="max-w-[260px] truncate px-5 py-2.5 text-ink2" title={p.lesson}>{p.lesson}</td>
                    <td className={`num px-5 py-2.5 text-right ${tone(p.r)}`}>{p.r == null ? money0(p.pnl, p.ticker) : rText(p.r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="Nothing closed yet">Every closed trade is scored in R, the amount you risked, so good decisions and good luck can be told apart.</Empty>}
      </section>
      {marketOf(cur) === 'india' && <p className="text-[13px] text-ink3">Amounts are before brokerage, taxes and charges.</p>}
    </div>
  );
}

export default function Journal() {
  return (
    <div>
      <h1 className="display text-[clamp(32px,4.4vw,50px)]">Journal</h1>
      <p className="mt-2 mb-6 max-w-[62ch] text-ink2">Your own trades, paper or real, scored the way the engine is scored: in R, against what you chose to risk. Only you can see this.</p>
      <OwnerGate what="The journal"><Body /></OwnerGate>
    </div>
  );
}
