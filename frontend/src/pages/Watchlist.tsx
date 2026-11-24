import { X } from 'lucide-react';
import { Link } from 'react-router';
import { useMarketData, useSignals, type Market } from '../api/client';
import { Change, Direction, Empty, Problem, Spark } from '../components/bits';
import { marketOf, money, symbol } from '../lib/format';
import { useApp } from '../state';

function Group({ market, tickers }: { market: Market; tickers: string[] }) {
  const { live, toggleWatch } = useApp();
  const { data, error, refetch } = useMarketData(market);
  const sig = useSignals(market);
  if (error && !data) return <Problem error={error} retry={() => refetch()} />;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {tickers.map((t) => {
        const s = data?.stocks.find((x) => x.ticker === t) ?? data?.indices.find((x) => x.ticker === t);
        const setup = sig.data?.active.find((x) => x.ticker === t);
        return (
          <li key={t} className="panel relative overflow-hidden">
            <Link to={`/stock/${encodeURIComponent(t)}`} className="block pt-4">
              <div className="flex items-start justify-between gap-3 px-4 pr-12">
                <div><div className="display text-[20px] leading-none">{symbol(t).replace('^', '')}</div><div className="mt-1 text-[13px] text-ink3">{s?.name}</div></div>
                {setup && <Direction d={setup.direction} />}
              </div>
              <div className="mt-3 flex items-baseline gap-3 px-4"><span className="num text-[22px]">{money(live[t]?.price ?? s?.price, t)}</span><Change v={live[t]?.change_pct ?? s?.change_pct} /></div>
              <Spark data={s?.spark ?? []} className="mt-2" />
            </Link>
            <button type="button" onClick={() => toggleWatch(t)} aria-label={`Remove ${symbol(t)}`} className="press absolute top-2.5 right-2.5 grid size-9 place-items-center rounded-lg text-ink3 hover-ink"><X size={16} aria-hidden /></button>
          </li>
        );
      })}
    </ul>
  );
}

export default function Watchlist() {
  const { watch } = useApp();
  const by = (m: Market) => watch.filter((t) => marketOf(t) === m);
  return (
    <div>
      <h1 className="display mb-6 text-[clamp(32px,4.4vw,50px)]">Watchlist</h1>
      {watch.length === 0 ? <Empty title="Nothing here yet">Open a stock and tap the star to keep it here. The list is stored on this device.</Empty> : (
        <div className="space-y-8">
          {by('india').length > 0 && <Group market="india" tickers={by('india')} />}
          {by('us').length > 0 && <Group market="us" tickers={by('us')} />}
        </div>
      )}
    </div>
  );
}
