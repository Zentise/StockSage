import { Bell, Send, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAddAlert, useAlerts, useBrief, useDeleteAlert, useSearchList, useSendBrief, useSettings } from '../api/client';
import { Change, Empty, Heading, Problem } from '../components/bits';
import OwnerGate from '../components/OwnerGate';
import { NewsList } from './Desk';
import { ago, money, rText, symbol, tone } from '../lib/format';
import { useApp } from '../state';

function Alerts() {
  const { data: list, error } = useAlerts();
  const { data: stocks } = useSearchList();
  const add = useAddAlert();
  const del = useDeleteAlert();
  const [f, setF] = useState({ ticker: '', kind: 'above' as 'above' | 'below', level: '', note: '' });
  const level = +f.level;
  const ticker = f.ticker.trim().toUpperCase();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate({ ticker, kind: f.kind, level, note: f.note }, { onSuccess: () => setF((x) => ({ ...x, level: '', note: '' })) });
  };
  return (
    <div className="panel space-y-4 p-5">
      <h3 className="title flex items-center gap-2 text-lg"><Bell size={17} className="text-gold" aria-hidden />Price alerts</h3>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_120px_110px_auto]">
        <label><span className="label mb-1 block">Stock</span>
          <input className="field" list="alert-stocks" value={f.ticker} onChange={(e) => setF({ ...f, ticker: e.target.value })} placeholder="TCS.NS" spellCheck={false} />
          <datalist id="alert-stocks">{stocks?.map((s) => <option key={s.ticker} value={s.ticker}>{s.name}</option>)}</datalist>
        </label>
        <label><span className="label mb-1 block">When price is</span>
          <select className="field !font-sans" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as 'above' | 'below' })}><option value="above">at or above</option><option value="below">at or below</option></select>
        </label>
        <label><span className="label mb-1 block">Level</span><input className="field" inputMode="decimal" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} /></label>
        <button type="submit" className="btn btn-gold press self-end" disabled={!ticker || !(level > 0) || add.isPending}>Add</button>
      </form>
      {add.error && <Problem error={add.error} />}
      {error ? <Problem error={error} /> : !list ? <div className="skeleton h-16" /> : list.length === 0 ? (
        <p className="text-ink2">No alerts yet. Each rings once, during market hours, to Telegram.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2.5 text-[14px]">
              <Link to={`/stock/${encodeURIComponent(a.ticker)}`} className="w-28 shrink-0 font-semibold hover-ink">{symbol(a.ticker)}</Link>
              <span className={`flex-1 ${a.active ? '' : 'text-ink3'}`}>
                {a.kind === 'above' ? 'at or above' : 'at or below'} <b className="num">{money(a.level, a.ticker)}</b>
                {!a.active && a.fired_at && <span className="text-ink3">, rang {ago(a.fired_at)} at {money(a.fired_price, a.ticker)}</span>}
              </span>
              <button type="button" aria-label="Delete alert" className="press grid size-9 place-items-center rounded-lg text-ink3 hover-ink" onClick={() => del.mutate(a.id)}><Trash2 size={15} aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Body() {
  const { market } = useApp();
  const { data: b, error, refetch } = useBrief(market);
  const settings = useSettings();
  const send = useSendBrief(market);
  if (error && !b) return <Problem error={error} retry={() => refetch()} />;
  if (!b) return <div className="space-y-5"><div className="skeleton h-28" /><div className="skeleton h-64" /></div>;
  const r = b.record;
  const sym = (t: string) => (t.startsWith('^') ? t.replace('^', '') : symbol(t));
  return (
    <div className="space-y-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink2">{b.date}, {b.status.toLowerCase()}. {b.advancing} stocks rising, {b.declining} falling.</p>
        <div className="flex items-center gap-3">
          {send.isSuccess && <span className="text-[14px] text-uptext">Sent to Telegram.</span>}
          <button type="button" className="btn btn-line press" disabled={!b.telegram || send.isPending} onClick={() => send.mutate()}
            title={b.telegram ? undefined : 'Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID on the server'}><Send size={15} aria-hidden />{send.isPending ? 'Sending…' : 'Send to Telegram'}</button>
        </div>
      </div>
      {send.error && <Problem error={send.error} />}
      {!b.telegram && settings.data && <p className="rounded-xl border border-line bg-deep px-4 py-3 text-[14px] text-ink2">Telegram is not connected, so alerts and the 8:45 brief stay in this page. Setup takes two minutes: see the README, section Alerts.</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {b.indices.map((i) => (
          <Link key={i.ticker} to={`/stock/${encodeURIComponent(i.ticker)}`} className="panel press block p-4">
            <div className="label">{i.name}</div>
            <div className="mt-1 flex items-baseline justify-between"><span className="num text-[20px]">{i.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span><Change v={i.change_pct} /></div>
          </Link>
        ))}
      </div>

      <section>
        <Heading>Setups waiting</Heading>
        {b.setups.length ? (
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[620px] text-[14px]">
              <thead><tr className="text-left text-[13px] text-ink3">{['Stock', 'Setup', 'Entry', 'Stop', 'Target', ''].map((h, i) => <th key={h + i} className={`px-5 py-3 font-normal ${i > 1 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line border-t border-line">
                {b.setups.map((s) => (
                  <tr key={`${s.ticker}${s.setup}`}>
                    <td className="px-5 py-2.5"><Link className="font-semibold hover-ink" to={`/stock/${encodeURIComponent(s.ticker)}`}>{s.name}</Link></td>
                    <td className="px-5 py-2.5 text-ink2">{s.setup} <span className={s.validated ? 'text-uptext' : 'text-ink3'}>{s.validated ? 'beat random' : 'unproven'}</span></td>
                    <td className="num px-5 py-2.5 text-right">{money(s.entry, s.ticker)}</td>
                    <td className="num px-5 py-2.5 text-right">{money(s.stop, s.ticker)}</td>
                    <td className="num px-5 py-2.5 text-right">{money(s.target, s.ticker)}</td>
                    <td className="px-5 py-2.5 text-right"><Link className="font-semibold text-gold" to={`/journal?ticker=${encodeURIComponent(s.ticker)}&entry=${s.entry}&stop=${s.stop ?? ''}&target=${s.target ?? ''}&setup=${s.setup}`}>Plan it</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No setups waiting">Most days most stocks do not qualify. Not trading is a position too.</Empty>}
        <p className="mt-3 max-w-[70ch] text-[14px] text-ink2">
          {r.edge_low == null ? 'The live record is still too short to judge.' : <>Over <b className="num">{r.paired_n}</b> finished setups the engine is <b className={`num ${tone(r.edge_r)}`}>{rText(r.edge_r)}</b> against random stocks (range {rText(r.edge_low)} to {rText(r.edge_high)}).</>} Setups marked unproven are experiments.
        </p>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section>
          <Heading>Your open trades</Heading>
          {b.positions.length ? (
            <ul className="panel divide-y divide-line px-5">
              {b.positions.map((p) => (
                <li key={p.ticker + p.entry} className="flex items-center gap-4 py-3 text-[14px]">
                  <Link to={`/stock/${encodeURIComponent(p.ticker)}`} className="w-28 shrink-0 font-semibold hover-ink">{sym(p.ticker)}</Link>
                  <span className="flex-1 text-ink2">{p.qty} shares{p.paper ? ' (paper)' : ''}</span>
                  <span className={`num ${tone(p.pnl)}`}>{p.pnl == null ? '–' : money(p.pnl, p.ticker, 0)}</span>
                  <span className={`num w-16 text-right ${tone(p.r)}`}>{rText(p.r)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty title="Nothing open">Trades you log in the journal show up here.</Empty>}
        </section>
        <section>
          <Heading>Biggest moves</Heading>
          <div className="panel grid gap-4 p-5 sm:grid-cols-2">
            {([['Up', b.gainers], ['Down', b.losers]] as const).map(([title, rows]) => (
              <div key={title}><h4 className="label mb-2">{title}</h4>
                <ul className="space-y-1.5">{rows.map((m) => <li key={m.ticker} className="flex justify-between gap-3 text-[14px]"><Link className="truncate hover-ink" to={`/stock/${encodeURIComponent(m.ticker)}`}>{m.name}</Link><Change v={m.change_pct} /></li>)}</ul>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Alerts />
        <div className="panel p-5">
          <h3 className="title mb-2 text-lg">Headlines</h3>
          <NewsList items={b.headlines} />
        </div>
      </div>
    </div>
  );
}

export default function Brief() {
  return (
    <div>
      <h1 className="display text-[clamp(32px,4.4vw,50px)]">Morning brief</h1>
      <p className="mt-2 mb-6 max-w-[62ch] text-ink2">What you need before the bell: the market, the setups waiting, your open trades and your alerts. Made from data only, so it arrives even when the AI quota is gone.</p>
      <OwnerGate what="The morning brief"><Body /></OwnerGate>
    </div>
  );
}
