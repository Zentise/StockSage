import { ArrowRight } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMarketData, useOdds, useReplay, useStatus } from '../api/client';
import { Mark } from '../components/Shell';
import { MoversList } from '../components/MarketView';
import { dayMonth, rText } from '../lib/format';
import { Boundary, hasWebGL } from '../three/stage';

const MarketCity = lazy(() => import('../three/MarketCity'));
const OddsSurface = lazy(() => import('../three/OddsSurface'));

export default function Landing() {
  const go = useNavigate();
  const { data: m } = useMarketData('india');
  const { data: st } = useStatus('india');
  const { data: replay } = useReplay('india');
  const demo = m?.stocks.find((s) => s.ticker === 'RELIANCE.NS') ?? m?.stocks[0];
  const levels = demo ? { entry: demo.price, stop: +(demo.price * 0.96).toFixed(2), target: +(demo.price * 1.08).toFixed(2) } : null;
  const odds = useOdds(demo?.ticker ?? '', levels && { ...levels, days: 20 });
  const gl = hasWebGL();

  return (
    <div className="overflow-x-clip">
      <header className="absolute inset-x-0 top-0 z-20 mx-auto flex max-w-[1480px] items-center justify-between px-5 py-5 sm:px-9">
        <span className="flex items-center gap-2.5"><Mark /><span className="display text-[20px]">StockSage</span></span>
        <Link to="/desk" className="btn btn-line press">Open the desk</Link>
      </header>

      <section className="relative flex min-h-[100svh] flex-col">
        <div className="absolute inset-x-0 top-[44%] bottom-0 lg:top-0 lg:left-[36%]">
          {m && gl && (
            <Boundary fallback={null}>
              <Suspense fallback={null}><MarketCity stocks={m.stocks} cinematic onPick={(t) => go(`/stock/${encodeURIComponent(t)}`)} className="h-full" /></Suspense>
            </Boundary>
          )}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-[36%] hidden w-[14%] bg-gradient-to-r from-bg to-transparent lg:block" />
        <div className="pointer-events-none relative z-10 mx-auto w-full max-w-[1480px] px-5 pt-28 sm:px-9 lg:pt-[21vh]">
          <h1 className="display text-[clamp(40px,5.1vw,84px)] leading-[0.98]"><span className="block">See the market.</span><span className="block">Plan the trade.</span><span className="block">Keep score.</span></h1>
          <p className="mt-5 max-w-[46ch] text-[17px] text-ink2">A trading desk for Indian stocks that shows its evidence on both sides and grades every idea against random picks.</p>
          <div className="pointer-events-auto mt-7 flex flex-wrap gap-3">
            <Link to="/desk" className="btn btn-gold press min-h-12 !px-6 text-[16px]">Open the desk<ArrowRight size={18} aria-hidden /></Link>
            <Link to="/record" className="btn btn-line press min-h-12 !px-6 text-[16px]">Check the record</Link>
          </div>
        </div>
        {m && st && (
          <p className="pointer-events-none relative z-10 mx-auto mt-auto w-full max-w-[1480px] px-5 pb-5 text-[13px] text-ink2 sm:px-9">
            Real data: the Nifty 50 on {dayMonth(st.session_date)}. Taller means a bigger move. Drag it, or tap a tower.
          </p>
        )}
      </section>

      {m && !gl && <section className="mx-auto max-w-[1480px] px-5 sm:px-9"><div className="panel"><MoversList data={m} limit={12} /></div></section>}

      <section className="mx-auto grid max-w-[1480px] items-center gap-10 px-5 py-24 sm:px-9 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 className="display text-[clamp(30px,4vw,52px)]">Walk through the odds before you risk a rupee</h2>
          <p className="mt-4 max-w-[48ch] text-ink2">Set an entry, stop and target. Four thousand futures, built from how the stock really moves, spread out as terrain. The teal is where you win, the red is where you are stopped. Then it tells you how many shares fit your risk.</p>
          {odds.data && demo && <p className="mt-5 text-ink2">{demo.name}, 4% stop and 8% target over 20 sessions: <b className="num font-semibold text-ink">{Math.round(odds.data.p_target * 100)}%</b> reach the target first, <b className="num font-semibold text-ink">{Math.round(odds.data.p_stop * 100)}%</b> are stopped.</p>}
        </div>
        <div className="panel overflow-hidden">
          {odds.data && levels && demo && gl ? (
            <Boundary fallback={null}>
              <Suspense fallback={<div className="skeleton h-[420px]" />}><OddsSurface odds={odds.data} levels={levels} ticker={demo.ticker} className="h-[360px] sm:h-[460px]" /></Suspense>
            </Boundary>
          ) : <div className="skeleton h-[360px] rounded-none" />}
        </div>
      </section>

      <section className="border-y border-line bg-deep">
        <div className="mx-auto grid max-w-[1480px] gap-10 px-5 py-24 sm:px-9 lg:grid-cols-2">
          <h2 className="display text-[clamp(30px,4vw,52px)]">It tells you when its own signals are not special</h2>
          <div className="space-y-4 text-[17px] text-ink2">
            {replay ? (
              <p>Over {replay.overall.n.toLocaleString('en-IN')} replayed trades the engine averaged <b className="num font-semibold text-ink">{rText(replay.overall.avg_r)}</b>. Random stocks bought the same day averaged <b className="num font-semibold text-ink">{rText(replay.overall.control_r)}</b>. Most tools would show you only the first number.</p>
            ) : <div className="skeleton h-20" />}
            <p>So there is no confidence score here. Each setup shows what speaks for it and what speaks against it, and the record page shows what happened next.</p>
            <Link to="/record" className="inline-flex items-center gap-2 font-semibold text-gold">Read the record<ArrowRight size={17} aria-hidden /></Link>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1480px] flex-wrap justify-between gap-4 px-5 py-10 text-[14px] text-ink3 sm:px-9">
        <span>StockSage is a personal research tool, not investment advice. Prices are delayed.</span>
        <a href="https://github.com/Zentise/StockSage" className="hover-ink">Source on GitHub</a>
      </footer>
    </div>
  );
}
