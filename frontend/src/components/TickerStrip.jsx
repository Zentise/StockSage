import React, { useEffect, useState, useRef } from 'react';
import { connectWebSocket } from '../api';

export default function TickerStrip({ market }) {
  const [prices, setPrices] = useState({});
  const [flashes, setFlashes] = useState({});
  const prevPrices = useRef({});
  const wsRef = useRef(null);

  useEffect(() => {
    wsRef.current = connectWebSocket((data) => {
      if (data && typeof data === 'object') {
        // data could be { ticker: { price, change_pct } } or an array
        const updates = Array.isArray(data) ? data : data.prices || [data];
        setPrices((prev) => {
          const next = { ...prev };
          const newFlashes = {};
          const flatUpdates = Array.isArray(updates) ? updates : [updates];

          flatUpdates.forEach((item) => {
            const ticker = item.ticker || item.symbol;
            if (!ticker) return;
            const oldPrice = prev[ticker]?.price;
            const newPrice = item.price || item.ltp;
            if (oldPrice && newPrice && newPrice !== oldPrice) {
              newFlashes[ticker] = newPrice > oldPrice ? 'flash-up' : 'flash-down';
            }
            next[ticker] = {
              price: newPrice,
              change_pct: item.change_pct ?? item.changePct ?? item.pct_change ?? 0,
              name: item.name || item.ticker || item.symbol,
            };
          });

          if (Object.keys(newFlashes).length > 0) {
            setFlashes((prev) => ({ ...prev, ...newFlashes }));
            setTimeout(() => {
              setFlashes((prev) => {
                const cleaned = { ...prev };
                Object.keys(newFlashes).forEach((k) => delete cleaned[k]);
                return cleaned;
              });
            }, 500);
          }

          return next;
        });
      }
    });

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const indiaIndices = ['NIFTY 50', 'SENSEX', 'BANKNIFTY', 'NIFTY50', 'BANK NIFTY'];
  const usIndices = ['SPX', 'S&P 500', 'NASDAQ', 'IXIC', 'DJI', 'DOW'];

  const displayItems = Object.entries(prices).slice(0, 10);

  return (
    <div
      className="w-full flex items-center gap-0 overflow-x-auto"
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '8px 32px',
      }}
    >
      {displayItems.length === 0 && (
        <span className="text-[11px]" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
          Connecting to live prices...
        </span>
      )}
      {displayItems.map(([ticker, data], i) => (
        <React.Fragment key={ticker}>
          {i > 0 && (
            <div className="mx-4 h-4" style={{ width: '1px', background: 'var(--border2)' }} />
          )}
          <div
            className={`flex items-center gap-2 px-2 py-1 rounded ${flashes[ticker] || ''}`}
            style={{ whiteSpace: 'nowrap' }}
          >
            <span
              className="text-[11px] uppercase"
              style={{ color: 'var(--muted)', fontFamily: 'var(--font-body)', letterSpacing: '0.5px' }}
            >
              {data.name || ticker}
            </span>
            <span
              className="text-xs font-medium"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--white)' }}
            >
              {typeof data.price === 'number' ? data.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : data.price}
            </span>
            <span
              className="text-[11px]"
              style={{
                fontFamily: 'var(--font-mono)',
                color: data.change_pct >= 0 ? 'var(--green)' : 'var(--red)',
              }}
            >
              {data.change_pct >= 0 ? '+' : ''}{typeof data.change_pct === 'number' ? data.change_pct.toFixed(2) : data.change_pct}%
            </span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}
