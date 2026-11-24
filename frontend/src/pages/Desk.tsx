import { RotateCw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useMarketData, useMarketNews, useRecord, useReplay, useScan, useSignals, useStatus, type MarketOut, type NewsItem, type Quote } from '../api/client';
import { Change, Empty, Heading, Problem, Segmented, Spark } from '../components/bits';
import MarketView from '../components/MarketView';
import SignalCard from '../components/SignalCard';
import { ago, pct, rText, STATUS, symbol, tone } from '../lib/format';
import { useApp } from '../state';

function IndexTile({ q }: { q: Quote }) {
  const { live } = useApp();
  const price = live[q.ticker]?.price ?? q.price, ch = live[q.ticker]?.change_pct ?? q.change_pct;
  const fear = q.ticker.includes('VIX');   // up is not good news here, so no green or red
  return (
    <Link to={`/stock/${encodeURIComponent(q.ticker)}`} className="panel press block min-w-0 overflow-hidden pt-3.5">
      <div className="px-4">
        <div className="label">{q.name}</div>
        <div className="mt-0.5 flex items-baseline justify-between gap-3">
          <span className="num text-[20px]">{price.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}</span>
          {fear ? <span className="num text-[14px] text-ink2">{pct(ch)}</span> : <Change v={ch} className="text-[14px]" />}
        </div>
      </div>
      <Spark data={q.spark} base={q.prev_close} className="mt-2" height={38} neutral={fear} />
    </Link>
  );
}

function Breadth({ m }: { m: MarketOut }) {
  const n = m.stocks.length, flat = n - m.advancing - m.declining;
  const R = 46, C = 2 * Math.PI * R, gap = 3;
  const up = (m.advancing / n) * C, dn = (m.declining / n) * C;
  return (
    <div className="panel flex items-center gap-5 p-5">
      <svg viewBox="0 0 110 110" className="size-[104px] shrink-0 -rotate-90" role="img" aria-label={`${m.advancing} rising, ${m.declining} falling`}>
        <circle cx="55" cy="55" r={R} fill="none" stroke="var(--color-line)" strokeWidth="11" />
        {up > 0 && <circle cx="55" cy="55" r={R} fill="none" stroke="var(--color-up)" strokeWidth="11" strokeDasharray={`${Math.max(0, up - gap)} ${C}`} />}
        {dn > 0 && <circle cx="55" cy="55" r={R} fill="none" stroke="var(--color-down)" strokeWidth="11" strokeDasharray={`${Math.max(0, dn - gap)} ${C}`} strokeDashoffset={-(C - dn)} />}
      </svg>
      <div>
        <div className="title text-lg">{m.advancing > m.declining * 1.5 ? 'Broad strength' : m.declining > m.advancing * 1.5 ? 'Broad weakness' : 'Mixed market'}</div>
        <p className="mt-1 text-ink2"><b className="num up font-semibold">{m.advancing}</b> rising, <b className="num down font-semibold">{m.declining}</b> falling{flat > 0 ? `, ${flat} flat` : ''}</p>
      </div>
    </div>
  );
}

function Sectors({ m }: { m: MarketOut }) {
  const max = Math.max(0.5, ...m.sectors.map((s) => Math.abs(s.change_pct)));
  return (
    <div className="panel p-5">
      <h3 className="title mb-3 text-lg">Sectors</h3>
      <ul className="space-y-2">
        {m.sectors.map((s) => (
          <li key={s.name} className="grid grid-cols-[92px_1fr_66px] items-center gap-3 text-[14px]" title={`${s.advancing} of ${s.total} rising`}>
            <span className="truncate text-ink2">{s.name}</span>
            <span className="relative h-2.5" aria-hidden>
              <span className="absolute inset-y-[-3px] left-1/2 w-px bg-line2" />
              <span className={`absolute inset-y-0 ${s.change_pct >= 0 ? 'left-1/2 rounded-r-[4px] bg-up' : 'right-1/2 rounded-l-[4px] bg-down'}`} style={{ width: `${(Math.abs(s.change_pct) / max) * 50}%` }} />
            </span>
            <Change v={s.change_pct} className="text-right" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NewsList({ items, limit = 7 }: { items: NewsItem[]; limit?: number }) {
  if (!items.length) return <p className="text-ink2">No recent headlines found.</p>;
  return (
    <ul className="-mx-2">
      {items.slice(0, limit).map((n) => (
        <li key={n.url}>
          <a href={n.url} target="_blank" rel="noopener noreferrer" className="hover-raise block rounded-xl px-2 py-2.5">
            <span className="block leading-snug">{n.title}</span>
            <span className="mt-1 block text-[13px] text-ink3">{[n.source, ago(n.published)].filter(Boolean).join(', ')}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function ScoreLine() {
  const { market } = useApp();
  const { data } = useRecord(market, 'v2');
  const { data: past } = useReplay(market);
  const beats = past?.overall.edge_low != null && past.overall.edge_low > 0;
  return (
    <Link to="/record" className="panel press block p-5">
      <h3 className="title text-lg">How these setups have done</h3>
      {data && data.overall.n > 0 ? (
        <p className="mt-1.5 text-ink2">
          <b className={`num font-semibold ${tone(data.overall.avg_r)}`}>{rText(data.overall.avg_r)}</b> average over {data.overall.n} finished trades
          {data.overall.control_r != null && <>, against <b className="num font-semibold text-ink">{rText(data.overall.control_r)}</b> for random stocks</>}.
        </p>
      ) : (
        <p className="mt-1.5 text-ink2">No setup from the new engine has finished yet.{past && (beats ? ' In the replay of past years it beat random stocks.' : ' In the replay of past years it did no better than random stocks, so treat each card as a starting point.')}</p>
      )}
      <span className="mt-2 inline-block font-semibold text-gold">See the record</span>
    </Link>
  );
}

type Filter = 'all' | 'BUY' | 'intraday' | 'AVOID';

export default function Desk() {
  const { market } = useApp();
  const m = useMarketData(market), sig = useSignals(market), st = useStatus(market), news = useMarketNews(market), scan = useScan(market);
  const [f, setF] = useState<Filter>('all');
  const all = sig.data?.active ?? [];
  const shown = all.filter((s) => f === 'all' || (f === 'intraday' ? s.category === 'intraday' : s.direction === f));
  const count = (k: Filter) => all.filter((s) => k === 'all' || (k === 'intraday' ? s.category === 'intraday' : s.direction === k)).length;
  const busy = scan.isPending || st.data?.scanning;

  return (
    <div className="grid gap-x-7 gap-y-9 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-9">
        <h1 className="sr-only">Trading desk</h1>
        {m.data ? (
          <div className="-mx-4 grid auto-cols-[minmax(194px,1fr)] grid-flow-col gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">{m.data.indices.map((q) => <IndexTile key={q.ticker} q={q} />)}</div>
        ) : m.error ? <Problem error={m.error} retry={() => m.refetch()} /> : <div className="skeleton h-[112px]" />}
        {m.data ? <MarketView data={m.data} /> : !m.error && <div className="skeleton h-[540px]" />}

        <section>
          <Heading side={
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[13px] text-ink3">{busy ? 'Scanning now…' : st.data?.last_scan ? `Scanned ${ago(st.data.last_scan)}` : ''}</span>
              <button type="button" className="btn btn-line press" onClick={() => scan.mutate()} disabled={busy}>
                <RotateCw size={15} className={busy ? 'animate-spin' : ''} aria-hidden />Scan now
              </button>
            </div>
          }>{st.data && !st.data.open ? 'Setups for the next session' : 'Setups right now'}</Heading>
          {scan.error && <Problem error={scan.error} className="mb-4" />}
          <div className="mb-5">
            <Segmented label="Show" value={f} onChange={setF} options={([['all', 'All'], ['BUY', 'Buy'], ['intraday', 'Intraday'], ['AVOID', 'Stay out']] as const).map(([k, t]) => [k, <>{t} <span className="num text-ink3">{count(k)}</span></>] as const)} />
          </div>
          {sig.error ? <Problem error={sig.error} retry={() => sig.refetch()} /> : !sig.data ? (
            <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-[330px]" />)}</div>
          ) : shown.length ? (
            <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">{shown.map((s, i) => <SignalCard key={s.id} s={s} index={i} />)}</div>
          ) : busy ? <Empty title="Scanning the market">New setups appear here in under a minute.</Empty> : (
            <Empty title={all.length ? 'Nothing in this filter' : 'No setup qualifies'}>{all.length ? 'Try another filter above.' : 'Most days most stocks do not qualify. Not trading is a position too.'}</Empty>
          )}
        </section>

        {!!sig.data?.recent.length && (
          <section>
            <Heading>Finished this week</Heading>
            <ul className="panel divide-y divide-line px-5">
              {sig.data.recent.map((s) => (
                <li key={s.id} className="flex items-center gap-4 py-3">
                  <Link to={`/stock/${encodeURIComponent(s.ticker)}`} className="w-32 truncate font-semibold hover-ink">{symbol(s.ticker)}</Link>
                  <span className="flex-1 text-ink2">{STATUS[s.status] ?? s.status}</span>
                  <span className={`num ${tone(s.r)}`}>{rText(s.r)}</span>
                  <span className="hidden w-24 text-right text-[13px] text-ink3 sm:block">{ago(s.exit_at)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="grid content-start gap-5 md:grid-cols-2 xl:grid-cols-1">
        {m.data && <><Breadth m={m.data} /><Sectors m={m.data} /></>}
        <ScoreLine />
        <div className="panel p-5">
          <h3 className="title mb-2 text-lg">Market news</h3>
          {news.data ? <NewsList items={news.data.items} /> : news.error ? <p className="text-ink2">{news.error.message}</p> : <div className="skeleton h-48" />}
        </div>
      </aside>
    </div>
  );
}
