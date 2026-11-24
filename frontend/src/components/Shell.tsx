import { BookOpen, LayoutDashboard, Scale, Search, Star, Sunrise } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useSearchList, useStatus } from '../api/client';
import { symbol, until } from '../lib/format';
import { useApp, useNow } from '../state';
import { Segmented } from './bits';
import ChatDock from './ChatDock';

const NAV = [
  ['/desk', 'Desk', 'Desk', LayoutDashboard],
  ['/brief', 'Morning brief', 'Brief', Sunrise],
  ['/journal', 'Journal', 'Journal', BookOpen],
  ['/watchlist', 'Watchlist', 'Watch', Star],
  ['/record', 'Record', 'Record', Scale],
] as const;

export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M4 25l8-4V11l-8 4z" fill="#8f9bff" /><path d="M12 11l5 2.5V23l-5-2z" fill="#5f6bd6" />
      <path d="M17 25l11-5.5V5L17 10.5z" fill="#f2b63c" /><path d="M11.5 8L22.5 2.6 28 5l-11 5.5z" fill="#ffd479" />
    </svg>
  );
}

function Clock() {
  const { market } = useApp();
  const { data } = useStatus(market);
  const now = useNow();
  if (!data) return <span className="skeleton inline-block h-5 w-40" />;
  return (
    <span className="flex items-center gap-2 text-[14px] text-ink2">
      <span className={`size-2 rounded-full ${data.open ? 'pulse-dot bg-up' : 'bg-ink3'}`} aria-hidden />
      <span className="font-semibold text-ink">{data.open ? 'Market open' : data.reason}</span>
      <span className="num hidden text-[13px] sm:inline">
        {data.open && data.closes_at ? `closes in ${until(data.closes_at, now)}` : `opens in ${until(data.opens_at, now)}`}
      </span>
      {!data.calendar_ok && <span className="text-gold" title="The exchange calendar does not cover the coming weeks. Update exchange_calendars.">calendar outdated</span>}
    </span>
  );
}

/** No animation on purpose: it is opened by keyboard many times a day. */
function Palette({ onClose }: { onClose: () => void }) {
  const { data } = useSearchList();
  const { market } = useApp();
  const go = useNavigate();
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const hits = useMemo(() => {
    const k = q.trim().toUpperCase();
    const all = [...(data ?? [])].sort((a, b) => Number(b.market === market) - Number(a.market === market));
    if (!k) return all.filter((s) => s.market === market).slice(0, 8);
    return all
      .filter((s) => s.ticker.includes(k) || s.name.toUpperCase().includes(k) || s.sector.toUpperCase().includes(k))
      .sort((a, b) => Number(b.ticker.startsWith(k)) - Number(a.ticker.startsWith(k)))
      .slice(0, 9);
  }, [q, data, market]);
  useEffect(() => setI(0), [q]);
  useEffect(() => { list.current?.children[i]?.scrollIntoView({ block: "nearest" }); }, [i]);
  const pick = (k?: string) => {
    if (!k) return;
    onClose();
    go(`/stock/${encodeURIComponent(k)}`);
  };
  return (
    <div className="fixed inset-0 z-[90] flex justify-center bg-deep/80 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Find a stock" className="panel h-fit w-full max-w-xl overflow-hidden shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-5">
          <Search size={18} className="text-ink3" aria-hidden />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company, symbol or sector" role="combobox" aria-expanded aria-controls="hits"
            aria-activedescendant={hits[i] ? `hit-${i}` : undefined} autoComplete="off" spellCheck={false}
            className="title h-16 w-full bg-transparent text-xl outline-none placeholder:text-ink3"
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              else if (e.key === 'Enter') pick(hits[i]?.ticker);
              else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (hits.length) setI((v) => (v + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length);
              }
            }} />
        </div>
        <ul id="hits" ref={list} role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
          {hits.map((s, n) => (
            <li key={s.ticker} id={`hit-${n}`} role="option" aria-selected={n === i} onMouseMove={() => setI(n)} onClick={() => pick(s.ticker)}
              className={`flex cursor-pointer items-center gap-4 rounded-xl px-4 py-2.5 ${n === i ? 'bg-raised' : ''}`}>
              <span className="title w-28 shrink-0">{symbol(s.ticker)}</span>
              <span className="min-w-0 flex-1 truncate text-ink2">{s.name}</span>
              <span className="hidden text-[13px] text-ink3 sm:block">{s.sector}</span>
            </li>
          ))}
          {!hits.length && <li className="px-4 py-6 text-ink2">Nothing matches “{q}”. The desk follows the Nifty 50 and 30 large US stocks.</li>}
        </ul>
      </div>
    </div>
  );
}

export default function Shell() {
  const { market, setMarket } = useApp();
  const [find, setFind] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
        e.preventDefault();
        setFind((v) => !v);
      }
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, []);
  const item = (active: boolean) => `press flex items-center gap-3 rounded-xl px-3 font-medium ${active ? 'bg-raised text-ink' : 'text-ink2 hover-ink'}`;
  return (
    <div className="min-h-dvh lg:pl-[200px]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-gold focus:px-4 focus:py-2 focus:text-black">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[200px] flex-col border-r border-line bg-deep/70 p-4 lg:flex">
        <Link to="/" className="mb-8 flex items-center gap-2.5 px-1 pt-1"><Mark /><span className="display text-[19px]">StockSage</span></Link>
        <nav className="flex flex-col gap-1" aria-label="Main">
          {NAV.map(([to, text, , Icon]) => (
            <NavLink key={to} to={to} className={({ isActive }) => `${item(isActive)} h-11`}>
              {({ isActive }) => (<><Icon size={18} className={isActive ? 'text-gold' : ''} aria-hidden />{text}</>)}
            </NavLink>
          ))}
        </nav>
        <p className="mt-auto px-1 text-[13px] leading-snug text-ink3">Delayed data from Yahoo Finance. For your own research, not advice. <Link to="/about" className="underline hover-ink">About and limits</Link></p>
      </aside>

      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur-xl sm:px-7">
        <Link to="/" className="lg:hidden" aria-label="StockSage home"><Mark size={28} /></Link>
        <Clock />
        <div className="ml-auto flex items-center gap-2.5">
          <button type="button" onClick={() => setFind(true)} className="btn btn-line press !px-3" aria-label="Find a stock">
            <Search size={16} aria-hidden /><span className="hidden text-[14px] font-medium text-ink2 md:inline">Find a stock</span>
            <kbd className="num hidden rounded bg-raised px-1.5 py-0.5 text-[11px] text-ink3 md:inline">/</kbd>
          </button>
          <Segmented label="Market" value={market} onChange={setMarket} options={[['india', 'India'], ['us', 'US']]} />
        </div>
      </header>

      <main id="main" className="mx-auto max-w-[1480px] px-4 pt-6 pb-28 sm:px-7 lg:pb-16">
        <Outlet />
        <p className="mt-14 text-[13px] text-ink3 lg:hidden">Delayed data, for your own research, not advice. <Link to="/about" className="underline">About and limits</Link></p>
      </main>
      <ChatDock />

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-line bg-deep/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" aria-label="Main">
        {NAV.map(([to, , short, Icon]) => (
          <NavLink key={to} to={to} className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${isActive ? 'text-gold' : 'text-ink2'}`}>
            <Icon size={20} aria-hidden />{short}
          </NavLink>
        ))}
        <button type="button" onClick={() => setFind(true)} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-ink2"><Search size={20} aria-hidden />Find</button>
      </nav>
      {find && <Palette onClose={() => setFind(false)} />}
    </div>
  );
}
