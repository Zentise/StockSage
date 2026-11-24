import { useRef, useState, type PointerEvent } from 'react';
import { Link } from 'react-router';
import { useRecord, useReplay, useSetups, type RecordOut } from '../api/client';
import { Empty, Heading, Problem, Segmented } from '../components/bits';
import SetupTable from '../components/SetupTable';
import { CATEGORY, dayMonth, rText, STATUS, symbol, tone } from '../lib/format';
import { useApp } from '../state';

interface Edge {
  n: number;
  mine: number | null | undefined;
  control: number | null | undefined;
  edge: number | null | undefined;
  low: number | null | undefined;
  high: number | null | undefined;
}

function verdict(e: Edge): string {
  if (!e.n) return 'No finished trades to judge yet.';
  if (e.edge == null) return 'Waiting for the comparison with random stocks.';
  if (e.low == null || e.high == null) return 'Too few weeks of trades to tell skill from luck.';
  if (e.low > 0) return 'Better than random stocks, beyond what luck explains.';
  if (e.high < 0) return 'Worse than random stocks, beyond what luck explains.';
  return 'Cannot be told apart from picking stocks at random.';
}

/** The difference from random with its plausible range, against a zero line. */
function EdgeBar({ e }: { e: Edge }) {
  if (e.edge == null || e.low == null || e.high == null) return null;
  const m = Math.max(0.25, Math.abs(e.low), Math.abs(e.high)) * 1.15;
  const at = (v: number) => ((v + m) / (2 * m)) * 100;
  return (
    <div className="pt-6 pb-7" role="img" aria-label={`Difference from random ${rText(e.edge)}, plausible range ${rText(e.low)} to ${rText(e.high)}`}>
      <div className="relative h-3">
        <div className="absolute inset-x-0 top-1.5 h-px bg-line2" />
        <div className="absolute top-0 h-3 rounded-full bg-peri/35" style={{ left: `${at(e.low)}%`, width: `${at(e.high) - at(e.low)}%` }} />
        <div className="absolute -top-4 h-11 w-px bg-ink2" style={{ left: '50%' }} />
        <div className="absolute -top-1 size-5 -translate-x-1/2 rounded-full border-4 border-panel bg-gold" style={{ left: `${at(e.edge)}%` }} />
        <span className="num absolute top-5 -translate-x-1/2 text-[12px] text-ink2" style={{ left: `${at(e.low)}%` }}>{rText(e.low)}</span>
        <span className="num absolute top-5 -translate-x-1/2 text-[12px] text-ink2" style={{ left: `${at(e.high)}%` }}>{rText(e.high)}</span>
        <span className="absolute -top-8 -translate-x-1/2 text-[12px] whitespace-nowrap text-ink3" style={{ left: '50%' }}>same as random</span>
      </div>
    </div>
  );
}

function Hero({ e, caption }: { e: Edge; caption: string }) {
  return (
    <div className="panel p-6 sm:p-8">
      <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="display text-[clamp(26px,3.2vw,38px)] leading-tight">{verdict(e)}</p>
          <p className="mt-3 max-w-[52ch] text-ink2">{caption}</p>
        </div>
        {e.n > 0 && (
          <div>
            <dl className="grid grid-cols-3 gap-4">
              {([['Our trades', rText(e.mine)], ['Random stocks', rText(e.control)], ['Trades compared', String(e.mine == null ? 0 : e.n)]] as const).map(([a, b]) => (
                <div key={a}><dt className="label">{a}</dt><dd className="num mt-1 text-[26px] leading-none">{b}</dd></div>
              ))}
            </dl>
            <div className="mt-8"><EdgeBar e={e} /></div>
          </div>
        )}
      </div>
    </div>
  );
}

function Curve({ r }: { r: RecordOut }) {
  const box = useRef<SVGSVGElement>(null);
  const [i, setI] = useState<number | null>(null);
  const pts = r.curve;
  if (pts.length < 3) return null;
  const W = 1000, H = 300, all = pts.flatMap((p) => [p.total, p.control]).concat(0);
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const px = (n: number) => (n / (pts.length - 1)) * W, py = (v: number) => H - 12 - ((v - lo) / span) * (H - 24);
  const path = (k: 'total' | 'control') => pts.map((p, n) => `${n ? 'L' : 'M'}${px(n).toFixed(1)},${py(p[k]).toFixed(1)}`).join('');
  const move = (e: PointerEvent) => {
    const b = box.current!.getBoundingClientRect();
    setI(Math.round(Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)) * (pts.length - 1)));
  };
  const h = i === null ? null : pts[i]!;
  return (
    <section>
      <Heading side={
        <div className="flex gap-5 text-[14px] text-ink2">
          <span className="flex items-center gap-2"><i className="h-0.5 w-5 bg-gold" />Our trades</span>
          <span className="flex items-center gap-2"><i className="h-0.5 w-5 bg-peri" />Random stocks</span>
        </div>
      }>Running total</Heading>
      <div className="panel relative p-5">
        <svg ref={box} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[260px] w-full touch-pan-y" onPointerMove={move} onPointerLeave={() => setI(null)} role="img" aria-label={`Running total ends at ${rText(pts.at(-1)!.total)} against ${rText(pts.at(-1)!.control)} for random stocks`}>
          <line x1="0" x2={W} y1={py(0)} y2={py(0)} stroke="var(--color-line2)" vectorEffect="non-scaling-stroke" />
          <path d={path('control')} fill="none" stroke="var(--color-peri)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <path d={path('total')} fill="none" stroke="var(--color-gold)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {i !== null && <line x1={px(i)} x2={px(i)} y1="0" y2={H} stroke="var(--color-ink3)" vectorEffect="non-scaling-stroke" />}
        </svg>
        <span className="num absolute right-6 text-[13px] text-gold" style={{ top: `${20 + (py(pts.at(-1)!.total) / H) * 260 - 22}px` }}>{rText(pts.at(-1)!.total)}</span>
        {h && i !== null && (
          <div className="tip absolute top-4" style={i > pts.length / 2 ? { right: `${100 - (i / (pts.length - 1)) * 92 - 2}%` } : { left: `${(i / (pts.length - 1)) * 92 + 6}%` }}>
            <div className="text-ink3">{dayMonth(h.at)}, {symbol(h.ticker)} <span className={`num ${tone(h.r)}`}>{rText(h.r)}</span></div>
            <div>Our trades <b className="num">{rText(h.total)}</b></div>
            <div>Random stocks <b className="num">{rText(h.control)}</b></div>
          </div>
        )}
      </div>
    </section>
  );
}

const edgeOf = (b: RecordOut['overall']): Edge => ({ n: b.paired_n || b.n, mine: b.paired_r, control: b.control_r, edge: b.edge_r, low: b.edge_low, high: b.edge_high });

function LiveRecord({ engine }: { engine: 'v1' | 'v2' }) {
  const { market } = useApp();
  const { data: r, error, refetch } = useRecord(market, engine);
  const { data: catalog } = useSetups(market);
  if (error) return <Problem error={error} retry={() => refetch()} />;
  if (!r) return <div className="skeleton h-72" />;
  const since = r.since ? dayMonth(r.since) : null;
  return (
    <div className="space-y-9">
      <Hero e={edgeOf(r.overall)} caption={
        engine === 'v1' ? 'Every buy and short the old site published from August to November 2026, followed on real prices to its stop, target or time limit.'
          : `${r.active} open now${since ? `, running since ${since}` : ''}. Every setup is followed on real prices to its stop, target or time limit. Nothing is removed.`
      } />
      <Curve r={r} />
      {engine === 'v2' && (catalog?.length ?? 0) > 0 && (
        <section>
          <Heading>Which kinds of setup earn their place</Heading>
          <p className="mb-4 max-w-[70ch] text-ink2">A kind of setup counts as beating random only if, in years of replay, it was better than random stocks beyond luck, in both halves of the period and after costs. Until then it is an experiment, and the card says so.</p>
          <SetupTable rows={catalog!.map((c) => ({ key: c.key, label: c.label, validated: c.validated, replay: c.replay, live: r.by_setup[c.key]?.live, active: r.by_setup[c.key]?.active }))} />
        </section>
      )}
      {r.overall.n > 0 ? (
        <section>
          <Heading>Trades</Heading>
          <div className="panel max-h-[560px] overflow-auto">
            <table className="w-full min-w-[640px] text-[14px]">
              <thead className="sticky top-0 bg-panel"><tr className="text-left text-[13px] text-ink3">{['Stock', 'Kind', 'Opened', 'How it ended', 'Best / worst', 'Random', 'Result'].map((h, n) => <th key={h} className={`px-5 py-3 font-normal ${n > 3 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line border-t border-line">
                {r.trades.map((t) => (
                  <tr key={t.id}>
                    <td className="px-5 py-2.5"><Link to={`/stock/${encodeURIComponent(t.ticker)}`} className="font-semibold hover-ink">{symbol(t.ticker)}</Link>{t.direction === 'SELL' && <span className="text-ink3"> short</span>}</td>
                    <td className="px-5 py-2.5">{CATEGORY[t.category]}</td>
                    <td className="px-5 py-2.5">{dayMonth(t.created_at)}</td>
                    <td className="px-5 py-2.5">{STATUS[t.status]}</td>
                    <td className="num px-5 py-2.5 text-right text-ink2">{rText(t.best_r)} / {rText(t.worst_r)}</td>
                    <td className="num px-5 py-2.5 text-right text-ink2">{rText(t.control_r)}</td>
                    <td className={`num px-5 py-2.5 text-right ${tone(t.r)}`}>{rText(t.r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : <Empty title="No finished trades yet">Results appear here as setups reach their stop, target or time limit.</Empty>}
    </div>
  );
}

function ReplayView() {
  const { market } = useApp();
  const { data: r, error } = useReplay(market);
  if (error) return <Problem error={error} />;
  if (!r) return <div className="skeleton h-72" />;
  const o = r.overall;
  const years = Object.entries(r.by_year).filter(([, v]) => v.n >= 50);
  return (
    <div className="space-y-9">
      <Hero e={{ n: o.n, mine: o.avg_r, control: o.control_r, edge: o.edge_r, low: o.edge_low, high: o.edge_high }}
        caption={`Today's engine run over ${r.stocks} stocks, ${r.start.slice(0, 4)} to ${r.end.slice(0, 4)}, seeing only the past at each step. After costs the average is ${rText(o.avg_r_net)}. It uses today's index members, which flatters both sides a little.`} />
      {Object.keys(r.by_setup).length > 0 && (
        <section>
          <Heading>Every kind of setup, same rules, same period</Heading>
          <SetupTable showLive={false} rows={Object.entries(r.by_setup).map(([key, v]) => ({ key, label: v.label, validated: v.validated, replay: v }))} />
        </section>
      )}
      <section>
        <Heading>Year by year and by horizon</Heading>
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[600px] text-[14px]">
            <thead><tr className="text-left text-[13px] text-ink3">{['', 'Trades', 'Reached target', 'Ours', 'Random', 'Difference', 'Plausible range'].map((h, n) => <th key={h} className={`px-5 py-3 font-normal ${n ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line border-t border-line">
              {[...Object.entries(r.by_category).map(([k, v]) => [CATEGORY[k] ?? k, v] as const), ...years].map(([k, v]) => (
                <tr key={k}>
                  <td className="px-5 py-2.5 font-semibold">{k}</td>
                  <td className="num px-5 py-2.5 text-right">{v.n}</td>
                  <td className="num px-5 py-2.5 text-right">{v.n ? Math.round(((v.target ?? 0) / v.n) * 100) : 0}%</td>
                  <td className="num px-5 py-2.5 text-right">{rText(v.avg_r)}</td>
                  <td className="num px-5 py-2.5 text-right text-ink2">{rText(v.control_r)}</td>
                  <td className="num px-5 py-2.5 text-right">{rText(v.edge_r)}</td>
                  <td className="num px-5 py-2.5 text-right text-ink2">{rText(v.edge_low)} to {rText(v.edge_high)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type Tab = 'v2' | 'v1' | 'replay';

export default function Record() {
  const [tab, setTab] = useState<Tab>('v2');
  return (
    <div>
      <h1 className="display text-[clamp(32px,4.4vw,50px)]">The record</h1>
      <p className="mt-2 mb-6 max-w-[62ch] text-ink2">A rising market makes any signal look clever. So every trade is scored against random stocks bought at the same moment with the same stop and target. 1R is the amount risked.</p>
      <div className="mb-6"><Segmented label="Record" value={tab} onChange={setTab} options={[['v2', 'Live now'], ['replay', 'Replay of past years'], ['v1', 'Old engine']]} /></div>
      {tab === 'replay' ? <ReplayView /> : <LiveRecord key={tab} engine={tab} />}
    </div>
  );
}
