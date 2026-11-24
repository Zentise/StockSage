import { useRef, type PointerEvent } from 'react';
import { Link } from 'react-router';
import { useSetups, type LiveSignal } from '../api/client';
import { ago, CATEGORY, money, symbol } from '../lib/format';
import { useApp } from '../state';
import { Change, Direction, Rail, Spark, Tug } from './bits';

const MAX = 7;

export default function SignalCard({ s, index = 0 }: { s: LiveSignal; index?: number }) {
  const el = useRef<HTMLAnchorElement>(null);
  const { live } = useApp();
  const price = live[s.ticker]?.price ?? s.quote?.price ?? null;
  const change = live[s.ticker]?.change_pct ?? s.quote?.change_pct;
  const entry = s.fill_price ?? s.entry;
  const { data: catalog } = useSetups(s.market === 'us' ? 'us' : 'india');
  const info = catalog?.find((c) => c.key === s.setup);

  const tilt = (e: PointerEvent) => {
    const n = el.current;
    if (!n || e.pointerType !== 'mouse') return;
    const r = n.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    n.dataset.live = '';
    n.style.setProperty('--ry', `${(x - 0.5) * 2 * MAX}deg`);
    n.style.setProperty('--rx', `${(0.5 - y) * 2 * MAX}deg`);
    n.style.setProperty('--gx', `${x * 100}%`);
    n.style.setProperty('--gy', `${y * 100}%`);
  };
  const rest = () => {
    const n = el.current;
    if (!n) return;
    delete n.dataset.live;
    n.style.setProperty('--rx', '0deg');
    n.style.setProperty('--ry', '0deg');
  };

  return (
    <div className="ticket-wrap reveal" style={{ animationDelay: `${Math.min(index, 6) * 55}ms` }}>
      <Link ref={el} to={`/stock/${encodeURIComponent(s.ticker)}`} className="ticket block p-5" onPointerMove={tilt} onPointerLeave={rest}>
        <div className="layer-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="display text-[25px] leading-none">{symbol(s.ticker)}</div>
            <div className="mt-1.5 truncate text-[14px] text-ink2">{s.name}</div>
          </div>
          <Direction d={s.direction} />
        </div>

        <div className="layer-2 mt-4 flex items-end justify-between gap-4">
          <div>
            <div className="num text-[26px] leading-none">{money(price, s.ticker)}</div>
            <Change v={change} className="mt-1.5 block text-[14px]" />
          </div>
          {s.quote && <Spark data={s.quote.spark} base={s.quote.prev_close} className="max-w-[130px]" />}
        </div>

        {s.stop != null && s.target != null ? (
          <div className="layer-1 mt-4">
            <Rail stop={s.stop} entry={entry} target={s.target} price={price} />
            <dl className="mt-1.5 grid grid-cols-3 text-[13px]">
              <div><dt className="text-ink3">Stop</dt><dd className="num">{money(s.stop, s.ticker)}</dd></div>
              <div><dt className="text-ink3">Entry</dt><dd className="num">{money(entry, s.ticker)}</dd></div>
              <div className="text-right"><dt className="text-ink3">Target</dt><dd className="num">{money(s.target, s.ticker)}</dd></div>
            </dl>
          </div>
        ) : (
          <p className="layer-1 mt-4 text-[14px] text-ink2">
            Bearish picture. {s.evidence_for[0] ? `${s.evidence_for[0].text}.` : ''}
          </p>
        )}

        {s.direction !== 'AVOID' && info && (
          <div className="layer-1 mt-3 flex items-center gap-2 text-[13px]" title={info.blurb}>
            <span className="truncate text-ink2">{info.label}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 ring-1 ring-inset ${info.validated ? 'bg-up/15 text-uptext ring-up/40' : 'bg-raised text-ink3 ring-line2'}`}>{info.validated ? 'beat random' : 'unproven'}</span>
          </div>
        )}
        <div className="layer-1 mt-4"><Tug yes={s.evidence_for} no={s.evidence_against} yesLabel={s.direction === 'BUY' ? 'bullish' : 'bearish'} noLabel={s.direction === 'BUY' ? 'bearish' : 'bullish'} /></div>

        <div className="layer-1 mt-4 flex items-center justify-between gap-3 text-[13px] text-ink3">
          <span>{s.direction === 'AVOID' ? s.timeframe : `${CATEGORY[s.category]}, ${s.timeframe.toLowerCase()}`}</span>
          <span className={s.pending && s.direction !== 'AVOID' ? 'text-gold' : ''}>{s.pending && s.direction !== 'AVOID' ? 'Waits for the open' : ago(s.created_at)}</span>
        </div>
      </Link>
    </div>
  );
}
