import { ArrowLeft, Bell, BookOpen, Sparkles, Star } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useAddAlert, useFundamentals, useNote, useStatus, useStock, useStockNews, type Evidence, type Note, type StockOut } from '../api/client';
import { Change, Direction, Heading, Problem, Tug } from '../components/bits';
import Chart from '../components/Chart';
import Debate from '../components/Debate';
import { useIsOwner } from '../components/OwnerGate';
import Planner, { startingLevels, type Levels } from '../components/Planner';
import { ago, big, CATEGORY, dayMonth, marketOf, money, priceDay, rText, STATUS, symbol, tone } from '../lib/format';
import { useApp } from '../state';
import { NewsList } from './Desk';

function EvidenceList({ title, items, color }: { title: string; items: Evidence[]; color: string }) {
  return (
    <div>
      <h4 className="label mb-1.5">{title}</h4>
      {items.length ? (
        <ul className="space-y-1.5">
          {items.map((e) => (
            <li key={e.text} className="flex items-start gap-2.5 text-[14px]">
              <span className="mt-[7px] flex gap-[2px]" aria-label={`weight ${e.weight}`}>
                {[1, 2, 3].map((n) => <i key={n} className="h-2 w-1 rounded-full" style={{ background: n <= e.weight ? color : 'var(--color-line)' }} />)}
              </span>
              {e.text}
            </li>
          ))}
        </ul>
      ) : <p className="text-[14px] text-ink3">Nothing on this side.</p>}
    </div>
  );
}

function Picture({ s }: { s: StockOut }) {
  const t = s.technicals, k = s.ticker;
  const rows: [string, string][] = [
    ['RSI (14)', t.rsi == null ? '–' : t.rsi.toFixed(0)],
    ['Volume vs normal', t.volume_ratio == null ? '–' : `${t.volume_ratio.toFixed(1)}x`],
    ['Daily range (ATR)', t.atr == null || !t.price ? '–' : `${money(t.atr, k)} (${((t.atr / t.price) * 100).toFixed(1)}%)`],
    ['20-day low / high', t.support == null || t.resistance == null ? '–' : `${money(t.support, k, 0)} / ${money(t.resistance, k, 0)}`],
    ['200-day average', money(t.ema_200, k)],
    ['52-week range', s.quote ? `${money(s.quote.low_52w, k, 0)} / ${money(s.quote.high_52w, k, 0)}` : '–'],
  ];
  return (
    <div className="panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="title text-lg">The picture today</h3>
        {s.signal && <Direction d={s.signal.direction} />}
      </div>
      <Tug yes={s.bullish} no={s.bearish} yesLabel="bullish" noLabel="bearish" />
      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
        <EvidenceList title="Bullish" items={s.bullish} color="var(--color-up)" />
        <EvidenceList title="Bearish" items={s.bearish} color="var(--color-down)" />
      </div>
      <dl className="mt-5 grid gap-y-2 border-t border-line pt-4 text-[14px]">
        {rows.map(([a, b]) => <div key={a} className="flex justify-between gap-4"><dt className="text-ink3">{a}</dt><dd className="num text-right">{b}</dd></div>)}
      </dl>
    </div>
  );
}

const pc = (v: number | null | undefined) => (v == null ? '–' : `${(v * 100).toFixed(1)}%`);
const x = (v: number | null | undefined) => (v == null ? '–' : v.toFixed(1));

function Business({ ticker }: { ticker: string }) {
  const { data, error } = useFundamentals(ticker);
  if (ticker.startsWith('^')) return null;
  if (error) return <Problem error={error} />;
  if (!data) return <div className="skeleton h-64" />;
  const rows: [string, string][] = [
    ['Market value', big(data.market_cap, ticker)], ['P/E', x(data.pe)], ['Forward P/E', x(data.forward_pe)], ['Price to book', x(data.pb)],
    ['Return on equity', pc(data.roe)], ['Profit margin', pc(data.profit_margin)], ['Revenue growth', pc(data.revenue_growth)], ['Earnings growth', pc(data.earnings_growth)],
    ['Debt to equity', data.debt_to_equity == null ? '–' : `${data.debt_to_equity.toFixed(0)}%`], [marketOf(ticker) === 'india' ? 'Promoter holding' : 'Insider holding', pc(data.insider_holding)],
  ];
  const soon = data.earnings_date ? Math.ceil((Date.parse(data.earnings_date) - Date.now()) / 864e5) : null;
  return (
    <div className="panel p-5">
      <h3 className="title mb-3 text-lg">The business</h3>
      {soon !== null && soon >= 0 && (
        <p className={`mb-3 rounded-xl px-3.5 py-2.5 text-[14px] ${soon <= 14 ? 'bg-gold/14 text-gold' : 'bg-deep text-ink2'}`}>
          Results expected {dayMonth(data.earnings_date!)}{soon <= 14 ? `, in ${soon} days. Price can gap past a stop.` : '.'}
        </p>
      )}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-[14px] sm:grid-cols-2">
        {rows.map(([a, b]) => <div key={a}><dt className="text-ink3">{a}</dt><dd className="num">{b}</dd></div>)}
      </dl>
    </div>
  );
}

function Points({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="title mb-1.5 flex items-center gap-2"><i className="size-2.5 rounded-sm" style={{ background: color }} />{title}</h4>
      <ul className="space-y-1.5 text-ink2">{items.map((p) => <li key={p}>{p}</li>)}</ul>
    </div>
  );
}

function AiNote({ ticker }: { ticker: string }) {
  const note = useNote(ticker);
  const { data: st } = useStatus(marketOf(ticker));
  const n: Note | undefined = note.data;
  let body: ReactNode;
  if (note.isPending) body = <div className="space-y-2.5" aria-live="polite"><p className="text-ink2">Reading the facts and arguing both sides…</p><div className="skeleton h-24" /></div>;
  else if (n) {
    body = (
      <div className="space-y-5">
        {n.summary && <p className="max-w-[70ch] text-[16px]">{n.summary}</p>}
        <div className="grid gap-5 md:grid-cols-3">
          <Points title="For" items={n.bull} color="var(--color-up)" />
          <Points title="Against" items={n.bear} color="var(--color-down)" />
          <Points title="Watch" items={n.watch} color="var(--color-gold)" />
        </div>
        <p className="text-[13px] text-ink3">
          Written by {n.model} {ago(n.created_at)} from the data on this page.
          {n.missing.length > 0 && ` Not available to it: ${n.missing.join(', ').toLowerCase()}.`}
          {n.removed > 0 && ` ${n.removed} ${n.removed === 1 ? 'statement was' : 'statements were'} removed for using numbers that are not in the data.`}
        </p>
      </div>
    );
  } else body = (
    <div className="flex flex-wrap items-center gap-4">
      <button type="button" className="btn btn-gold press" onClick={() => note.mutate()} disabled={st?.ai_enabled === false}><Sparkles size={16} aria-hidden />Write the note</button>
      <p className="text-ink2">{st?.ai_enabled === false ? 'AI notes are off. Add GROQ_API_KEY to turn them on.' : 'Argues both sides from the prices, fundamentals and headlines here.'}</p>
    </div>
  );
  return (
    <section>
      <Heading>AI research note</Heading>
      <div className="panel p-5">{note.error ? <Problem error={note.error} retry={() => note.mutate()} /> : body}</div>
    </section>
  );
}

/** Ring me when it gets there: one number, one tap. */
function QuickAlert({ ticker, price }: { ticker: string; price: number | null | undefined }) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState('');
  const add = useAddAlert();
  const kind = price != null && +level < price ? 'below' : 'above';
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="btn btn-line press !px-3" aria-label="Set a price alert"><Bell size={18} aria-hidden /></button>;
  return (
    <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); add.mutate({ ticker, kind, level: +level, note: "" }, { onSuccess: () => { setOpen(false); setLevel(''); } }); }}>
      <input autoFocus className="field !w-28" inputMode="decimal" placeholder={price ? String(Math.round(price)) : 'Price'} value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Alert price" />
      <button type="submit" className="btn btn-gold press" disabled={!(+level > 0) || add.isPending}>Alert {kind === 'below' ? 'at or below' : 'at or above'}</button>
      {add.error && <span role="alert" className="text-[13px] text-downtext">{add.error.message}</span>}
    </form>
  );
}

function News({ ticker }: { ticker: string }) {
  const { data, error } = useStockNews(ticker);
  return (
    <div className="panel p-5">
      <h3 className="title mb-2 text-lg">Headlines this week</h3>
      {data ? <NewsList items={data.items} /> : error ? <p className="text-ink2">{error.message}</p> : <div className="skeleton h-40" />}
    </div>
  );
}

function StockBody({ s }: { s: StockOut }) {
  const { live, watch, toggleWatch } = useApp();
  const price = live[s.ticker]?.price ?? s.quote?.price ?? s.technicals.price;
  const change = live[s.ticker]?.change_pct ?? s.quote?.change_pct;
  const [levels, setLevels] = useState<Levels | null>(null);
  // Start from the setup once; after that the numbers belong to the user, not to refreshes.
  useEffect(() => setLevels((l) => l ?? startingLevels(s)), [s]);
  const drawn = useMemo(() => (levels && levels.stop < levels.entry && levels.entry < levels.target ? levels : null), [levels]);
  const starred = watch.includes(s.ticker);
  const owner = useIsOwner();
  return (
    <div className="space-y-9">
      <header>
        <Link to="/desk" className="mb-4 inline-flex items-center gap-1.5 text-[14px] text-ink2 hover-ink"><ArrowLeft size={15} aria-hidden />Desk</Link>
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <h1 className="display text-[clamp(34px,5vw,54px)]">{symbol(s.ticker).replace('^', '')}</h1>
            <p className="mt-1 text-ink2">{s.name}{s.sector ? `, ${s.sector}` : ''}</p>
          </div>
          <div className="flex items-end gap-5">
            <div className="text-right">
              <div className="num text-[clamp(28px,4vw,40px)] leading-none">{money(price, s.ticker)}</div>
              <div className="mt-1.5"><Change v={change} className="text-[16px]" /> <span className="text-[13px] text-ink3">{priceDay(s.quote?.as_of, s.ticker)}</span></div>
            </div>
            {owner && !s.ticker.startsWith('^') && (
              <>
                <QuickAlert ticker={s.ticker} price={price} />
                <Link className="btn btn-line press !px-3" aria-label="Log a trade in the journal"
                  to={`/journal?ticker=${encodeURIComponent(s.ticker)}&entry=${drawn?.entry ?? price ?? ''}&stop=${drawn?.stop ?? ''}&target=${drawn?.target ?? ''}${s.signal ? `&setup=${s.signal.setup}` : ''}`}><BookOpen size={18} aria-hidden /></Link>
              </>
            )}
            <button type="button" onClick={() => toggleWatch(s.ticker)} aria-pressed={starred} className="btn btn-line press !px-3" aria-label={starred ? 'Remove from watchlist' : 'Add to watchlist'}>
              <Star size={18} className={starred ? 'fill-gold text-gold' : ''} aria-hidden />
            </button>
          </div>
        </div>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
        <Chart ticker={s.ticker} levels={drawn} />
        <Picture s={s} />
      </div>
      {levels && !s.ticker.startsWith('^') && <Planner stock={s} levels={levels} setLevels={setLevels} />}
      <AiNote ticker={s.ticker} />
      {!s.ticker.startsWith('^') && <Debate ticker={s.ticker} />}
      <div className="grid items-start gap-6 lg:grid-cols-2"><Business ticker={s.ticker} /><News ticker={s.ticker} /></div>
      {s.history.length > 0 && (
        <section>
          <Heading>Past setups on this stock</Heading>
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[560px] text-[14px]">
              <thead><tr className="text-left text-[13px] text-ink3">{['Date', 'Kind', 'Entry', 'Ended', 'Result'].map((h, i) => <th key={h} className={`px-5 py-3 font-normal ${i > 3 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line border-t border-line">
                {s.history.map((h) => (
                  <tr key={h.id}>
                    <td className="px-5 py-2.5">{dayMonth(h.created_at)} {h.engine === 'v1' && <span className="text-ink3">(old engine)</span>}</td>
                    <td className="px-5 py-2.5">{CATEGORY[h.category]}</td>
                    <td className="num px-5 py-2.5">{money(h.fill_price ?? h.entry, h.ticker)}</td>
                    <td className="px-5 py-2.5">{STATUS[h.status]}</td>
                    <td className={`num px-5 py-2.5 text-right ${tone(h.r)}`}>{rText(h.r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export default function Stock() {
  const ticker = useParams().ticker ?? '';
  const { data, error, refetch } = useStock(ticker);
  if (error && !data) return <Problem error={error} retry={() => refetch()} />;
  if (!data) return <div className="space-y-6"><div className="skeleton h-24" /><div className="skeleton h-[460px]" /></div>;
  return <StockBody key={ticker} s={data} />;
}
