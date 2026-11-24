import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { MarketOut } from '../api/client';
import { money, symbol } from '../lib/format';
import { Boundary, hasWebGL } from '../three/stage';
import { Change, Heading, Segmented } from './bits';

const MarketCity = lazy(() => import('../three/MarketCity'));

export function MoversList({ data, limit }: { data: MarketOut; limit?: number }) {
  const rows = [...data.stocks].sort((a, b) => b.change_pct - a.change_pct).slice(0, limit);
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.change_pct)));
  return (
    <ul className="grid max-h-[480px] gap-x-6 overflow-y-auto p-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((s) => (
        <li key={s.ticker}>
          <Link to={`/stock/${encodeURIComponent(s.ticker)}`} className="hover-raise grid grid-cols-[92px_1fr_auto] items-center gap-3 rounded-lg px-2 py-1.5">
            <span className="truncate font-semibold">{symbol(s.ticker)}</span>
            <span className="relative h-1.5 rounded-full bg-line" aria-hidden>
              <span className={`absolute inset-y-0 rounded-full ${s.change_pct >= 0 ? 'left-1/2 bg-up' : 'right-1/2 bg-down'}`} style={{ width: `${(Math.abs(s.change_pct) / max) * 50}%` }} />
            </span>
            <span className="text-right text-[13px]"><span className="num mr-2 hidden text-ink2 2xl:inline">{money(s.price, s.ticker)}</span><Change v={s.change_pct} /></span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function MarketView({ data }: { data: MarketOut }) {
  const go = useNavigate();
  const [view, setView] = useState<'city' | 'list'>(hasWebGL() ? 'city' : 'list');
  const flat = <MoversList data={data} />;
  return (
    <section>
      <Heading side={<Segmented label="View" value={view} onChange={setView} options={[['city', '3D'], ['list', 'List']]} />}>
        {data.market === 'india' ? 'The Nifty 50, from above' : 'Large US stocks, from above'}
      </Heading>
      <div className="panel relative overflow-hidden">
        {view === 'list' ? flat : (
          <Boundary fallback={flat}>
            <Suspense fallback={<div className="skeleton h-[440px] rounded-none" />}>
              <MarketCity stocks={data.stocks} onPick={(t) => go(`/stock/${encodeURIComponent(t)}`)} className="h-[400px] sm:h-[480px]" />
            </Suspense>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line px-5 py-3 text-[13px] text-ink2">
              <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-up" />rising</span>
              <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-down" />falling</span>
              <span>Height: size of move, up to 6%. Plot: value traded. Drag to look around.</span>
            </div>
          </Boundary>
        )}
      </div>
    </section>
  );
}
