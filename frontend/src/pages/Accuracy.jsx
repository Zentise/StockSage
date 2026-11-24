import React, { useState, useEffect, useCallback } from 'react';
import TopBar from '../components/TopBar';
import { getAccuracy } from '../api';

const statusStyles = {
  target_hit: { bg: 'rgba(0,200,150,0.15)', color: 'var(--green)', label: 'Target Hit' },
  on_track: { bg: 'rgba(0,200,150,0.08)', color: 'var(--green)', label: 'On Track' },
  sl_hit: { bg: 'rgba(255,69,96,0.15)', color: 'var(--red)', label: 'SL Hit' },
  against: { bg: 'rgba(255,69,96,0.08)', color: 'var(--red)', label: 'Against' },
  neutral: { bg: 'rgba(201,168,76,0.1)', color: 'var(--gold)', label: 'Neutral' },
  unknown: { bg: 'rgba(100,100,100,0.1)', color: 'var(--muted)', label: 'Unknown' },
  error: { bg: 'rgba(100,100,100,0.1)', color: 'var(--muted)', label: 'Error' },
};

const COLUMNS = '2fr 1fr 1fr 1fr 1fr 1fr 1.2fr';

// 30ms between rows — a table is dense, so the cascade has to stay tight.
const STAGGER_STEP = 30;
const STAGGER_CAP = 10;

export default function Accuracy({ market, setMarket }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAccuracy(market, date);
      setData(result);
    } catch (err) {
      console.error('Failed to fetch accuracy:', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [market, date]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const summary = data?.summary || { total: 0, accurate: 0, accuracy_pct: 0 };
  const signals = data?.signals || [];

  const currencySymbol = market === 'india' ? '₹' : '$';
  const formatPrice = (p) => {
    if (!p) return '-';
    return `${currencySymbol}${Number(p).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <TopBar market={market} setMarket={setMarket} />

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <div className="gold-divider" />
          <div className="flex flex-wrap items-center gap-4 mb-1">
            <h1 className="type-display-lg text-[32px]" style={{ color: 'var(--white)' }}>
              ACCURACY DASHBOARD
            </h1>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Signal date"
              className="tnum px-3 py-1.5 rounded text-xs"
              style={{
                background: 'var(--card)',
                color: 'var(--white)',
                border: '1px solid var(--border)',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>
          <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
            How accurate were today's recommendations
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Signals', value: summary.total, color: 'var(--white)' },
            { label: 'Accurate', value: summary.accurate, color: 'var(--green)' },
            { label: 'Accuracy', value: `${summary.accuracy_pct}%`, color: 'var(--gold)' },
          ].map((item) => (
            <div
              key={item.label}
              className="p-4 rounded-md"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <div className="type-label mb-1" style={{ color: 'var(--muted)' }}>
                {item.label}
              </div>
              <div className="tnum text-2xl" style={{ fontFamily: 'var(--font-mono)', color: item.color }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {/* Accuracy bar — scaleX rather than width, so the fill never costs a
            layout pass while the page is polling. */}
        {summary.total > 0 && (
          <div className="mb-6">
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ background: 'var(--border)' }}
              role="progressbar"
              aria-valuenow={summary.accuracy_pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Signal accuracy"
            >
              <div
                className="h-full w-full rounded-full origin-left"
                style={{
                  transform: `scaleX(${Math.min(summary.accuracy_pct, 100) / 100})`,
                  transition: 'transform var(--dur-tab) var(--ease-out)',
                  background: summary.accuracy_pct >= 60 ? 'var(--green)' : summary.accuracy_pct >= 40 ? 'var(--gold)' : 'var(--red)',
                }}
              />
            </div>
          </div>
        )}

        {/* Signal table */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-md h-16 animate-pulse"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              />
            ))}
          </div>
        ) : signals.length === 0 ? (
          <div className="text-center py-16" style={{ color: 'var(--muted)' }}>
            <p className="text-sm">No signals recorded for this date.</p>
            <p className="text-xs mt-1" style={{ color: 'var(--muted2)' }}>
              Signals are recorded during market hours.
            </p>
          </div>
        ) : (
          /* The table keeps its column rhythm and scrolls inside itself —
             the page body must never scroll sideways. */
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="space-y-2 min-w-[860px]">
              {/* Header */}
              <div
                className="grid gap-3 px-4 py-2 type-label"
                style={{ gridTemplateColumns: COLUMNS, color: 'var(--muted)' }}
              >
                <span>Stock</span>
                <span>Signal</span>
                <span>Entry</span>
                <span>Current</span>
                <span>Change</span>
                <span>Target</span>
                <span>Status</span>
              </div>

              {signals.map((sig, i) => {
                const st = statusStyles[sig.status] || statusStyles.unknown;
                return (
                  <div
                    key={sig.ticker}
                    className="rise-in grid gap-3 px-4 py-3 rounded-md items-center"
                    style={{
                      gridTemplateColumns: COLUMNS,
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      animationDelay: `${Math.min(i, STAGGER_CAP) * STAGGER_STEP}ms`,
                    }}
                  >
                    <div className="min-w-0">
                      <span className="type-display-sm text-sm" style={{ color: 'var(--white)' }}>
                        {sig.ticker}
                      </span>
                      <span className="text-[10px] ml-2" style={{ color: 'var(--muted)' }}>
                        {sig.name}
                      </span>
                    </div>
                    <span
                      className="text-[10px] uppercase font-medium px-2 py-0.5 rounded inline-block w-fit"
                      style={{
                        background: sig.signal === 'BUY' ? 'rgba(0,200,150,0.12)' : sig.signal === 'SELL' ? 'rgba(255,69,96,0.12)' : 'rgba(255,140,0,0.12)',
                        color: sig.signal === 'BUY' ? 'var(--green)' : sig.signal === 'SELL' ? 'var(--red)' : 'var(--orange)',
                      }}
                    >
                      {sig.signal}
                    </span>
                    <span className="tnum text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--white)' }}>
                      {formatPrice(sig.entry)}
                    </span>
                    <span className="tnum text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--white)' }}>
                      {formatPrice(sig.current_price)}
                    </span>
                    <span
                      className="tnum text-xs"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        color: sig.change_from_entry >= 0 ? 'var(--green)' : 'var(--red)',
                      }}
                    >
                      {sig.change_from_entry >= 0 ? '+' : ''}{sig.change_from_entry}%
                    </span>
                    <span className="tnum text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                      {formatPrice(sig.target)}
                    </span>
                    <span
                      className="text-[10px] uppercase font-medium px-2 py-1 rounded inline-block w-fit"
                      style={{ background: st.bg, color: st.color }}
                    >
                      {st.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
