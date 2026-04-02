import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
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

      <div className="max-w-[1200px] mx-auto px-6 py-6">
        <div className="mb-6">
          <div className="gold-divider" />
          <div className="flex items-center gap-4 mb-1">
            <h1
              className="text-[32px] leading-none"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--white)' }}
            >
              ACCURACY DASHBOARD
            </h1>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-1.5 rounded text-xs"
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
        <div className="grid grid-cols-3 gap-4 mb-6">
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
              <div className="text-[10px] uppercase mb-1" style={{ color: 'var(--muted)', letterSpacing: '0.5px' }}>
                {item.label}
              </div>
              <div className="text-2xl" style={{ fontFamily: 'var(--font-mono)', color: item.color }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {/* Accuracy bar */}
        {summary.total > 0 && (
          <div className="mb-6">
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${summary.accuracy_pct}%`,
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
          <div className="space-y-2">
            {/* Header */}
            <div
              className="grid gap-3 px-4 py-2 text-[10px] uppercase tracking-wider"
              style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 1.2fr', color: 'var(--muted)' }}
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
                <motion.div
                  key={sig.ticker}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="grid gap-3 px-4 py-3 rounded-md items-center"
                  style={{
                    gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 1.2fr',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div>
                    <span className="text-sm" style={{ fontFamily: 'var(--font-display)', color: 'var(--white)' }}>
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
                  <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--white)' }}>
                    {formatPrice(sig.entry)}
                  </span>
                  <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--white)' }}>
                    {formatPrice(sig.current_price)}
                  </span>
                  <span
                    className="text-xs"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: sig.change_from_entry >= 0 ? 'var(--green)' : 'var(--red)',
                    }}
                  >
                    {sig.change_from_entry >= 0 ? '+' : ''}{sig.change_from_entry}%
                  </span>
                  <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                    {formatPrice(sig.target)}
                  </span>
                  <span
                    className="text-[10px] uppercase font-medium px-2 py-1 rounded inline-block w-fit"
                    style={{ background: st.bg, color: st.color }}
                  >
                    {st.label}
                  </span>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
