import React, { useEffect, useRef, useState } from 'react';
import { connectWebSocket } from '../api';

// The flash is on the instant the tick lands and decays over --dur-tick.
// This only has to hold the attribute long enough for the browser to paint
// the "on" frame; the fade back to 0 is the CSS transition.
const FLASH_HOLD_MS = 90;

export default function TickerStrip() {
  const [prices, setPrices] = useState({});
  const [flashes, setFlashes] = useState({});
  const wsRef = useRef(null);
  const pricesRef = useRef({});
  const flashTimers = useRef(new Map());

  useEffect(() => {
    wsRef.current = connectWebSocket((data) => {
      if (!data || typeof data !== 'object') return;

      // data could be { ticker: { price, change_pct } } or an array
      const updates = Array.isArray(data) ? data : data.prices || [data];
      const flatUpdates = Array.isArray(updates) ? updates : [updates];

      // Diff against a ref rather than inside a setState updater: updaters
      // have to stay pure, and StrictMode runs them twice.
      const previous = pricesRef.current;
      const next = { ...previous };
      const newFlashes = {};

      flatUpdates.forEach((item) => {
        const ticker = item.ticker || item.symbol;
        if (!ticker) return;
        const oldPrice = previous[ticker]?.price;
        const newPrice = item.price || item.ltp;
        if (oldPrice && newPrice && newPrice !== oldPrice) {
          newFlashes[ticker] = newPrice > oldPrice ? 'up' : 'down';
        }
        next[ticker] = {
          price: newPrice,
          change_pct: item.change_pct ?? item.changePct ?? item.pct_change ?? 0,
          name: item.name || item.ticker || item.symbol,
        };
      });

      pricesRef.current = next;
      setPrices(next);

      const flashed = Object.keys(newFlashes);
      if (flashed.length > 0) {
        setFlashes((current) => ({ ...current, ...newFlashes }));
        flashed.forEach((ticker) => {
          clearTimeout(flashTimers.current.get(ticker));
          flashTimers.current.set(
            ticker,
            setTimeout(() => {
              flashTimers.current.delete(ticker);
              setFlashes((current) => {
                const { [ticker]: _dropped, ...rest } = current;
                return rest;
              });
            }, FLASH_HOLD_MS)
          );
        });
      }
    });

    const timers = flashTimers.current;
    return () => {
      wsRef.current?.close();
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  const displayItems = Object.entries(prices).slice(0, 10);

  return (
    <div
      className="w-full flex items-center overflow-x-auto px-4 sm:px-8 py-2"
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
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
            <div className="mx-4 h-4 shrink-0" style={{ width: '1px', background: 'var(--border2)' }} />
          )}
          <div
            className="tick flex items-center gap-2 px-2 py-1 rounded shrink-0"
            data-flash={flashes[ticker]}
            style={{ whiteSpace: 'nowrap' }}
          >
            <span
              className="type-label"
              style={{ color: 'var(--muted)' }}
            >
              {data.name || ticker}
            </span>
            <span
              className="tnum text-xs font-medium"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--white)' }}
            >
              {typeof data.price === 'number' ? data.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : data.price}
            </span>
            <span
              className="tnum text-[11px]"
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
