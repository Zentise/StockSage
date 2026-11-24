import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';

// Stock universes — loaded lazily
let stockCache = null;
async function loadStocks() {
  if (stockCache) return stockCache;
  try {
    const [nse, nyse] = await Promise.all([
      import('../data/nse_tickers.js').then(m => m.default).catch(() => []),
      import('../data/nyse_tickers.js').then(m => m.default).catch(() => []),
    ]);
    stockCache = { india: nse, us: nyse };
  } catch {
    stockCache = { india: [], us: [] };
  }
  return stockCache;
}

const tickerOf = (item) =>
  typeof item === 'string' ? item : item.ticker || item.symbol || '';

/**
 * Command palette.
 *
 * Deliberately has no open/close animation. This is opened with ⌘K dozens of
 * times a session, and animation on a keyboard-initiated action reads as lag —
 * Raycast is instant for exactly this reason. The only motion here is the
 * press feedback on the trigger.
 */
export default function SearchBar({ market }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [stocks, setStocks] = useState({ india: [], us: [] });
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const triggerRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadStocks().then(setStocks);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
    triggerRef.current?.focus();
  }, []);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    // Don't let the terminal scroll behind the palette.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  const results = useMemo(() => {
    if (!query || query.length < 1) return [];
    const list = stocks[market] || [];
    const q = query.toUpperCase();
    return list
      .filter(s => {
        const ticker = tickerOf(s).toUpperCase();
        const name = typeof s === 'string' ? '' : (s.name || '').toUpperCase();
        return ticker.includes(q) || name.includes(q);
      })
      .slice(0, 12);
  }, [query, market, stocks]);

  // Keep the highlight in range as the result set changes under it.
  useEffect(() => { setActive(0); }, [query, market]);

  // Follow the highlight with the scroll container, without smooth scrolling —
  // this fires on every arrow press, which is not a place for animation.
  useEffect(() => {
    const el = listRef.current?.children?.[active];
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const handleSelect = (item) => {
    const ticker = tickerOf(item) || item;
    setOpen(false);
    setQuery('');
    setActive(0);
    navigate(`/stock/${encodeURIComponent(ticker)}`);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      handleSelect(results[active] || results[0]);
    }
  };

  return (
    <>
      {/* Search pill trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="press flex items-center gap-2 px-3 py-1.5 rounded-md text-xs"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border2)',
          color: 'var(--muted)',
        }}
      >
        <Search size={12} />
        <span>Search ticker</span>
        <kbd
          className="ml-2 px-1.5 py-0.5 rounded text-[10px]"
          style={{ background: 'var(--border)', color: 'var(--muted2)' }}
        >
          ⌘K
        </kbd>
      </button>

      {/* Full-screen overlay */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search ticker"
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4"
          style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div className="w-full max-w-lg" onKeyDown={onKeyDown}>
            <div className="relative">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ENTER TICKER"
                role="combobox"
                aria-expanded={results.length > 0}
                aria-controls="ticker-results"
                aria-activedescendant={results.length ? `ticker-result-${active}` : undefined}
                autoComplete="off"
                spellCheck="false"
                className="type-display-md w-full px-6 py-4 text-2xl tracking-wider outline-none"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border2)',
                  borderRadius: '8px',
                  color: 'var(--white)',
                }}
              />
              <button
                type="button"
                onClick={close}
                aria-label="Close search"
                className="press absolute right-4 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            {results.length > 0 && (
              <div
                id="ticker-results"
                role="listbox"
                ref={listRef}
                className="mt-2 rounded-lg overflow-hidden max-h-[50vh] overflow-y-auto"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                {results.map((item, i) => {
                  const ticker = tickerOf(item);
                  const name = typeof item === 'string' ? '' : item.name || '';
                  const isActive = i === active;
                  return (
                    <button
                      key={ticker + i}
                      id={`ticker-result-${i}`}
                      role="option"
                      aria-selected={isActive}
                      type="button"
                      onClick={() => handleSelect(item)}
                      onMouseMove={() => setActive(i)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left"
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: isActive ? 'var(--card-hover)' : 'transparent',
                      }}
                    >
                      <span
                        className="text-sm font-medium"
                        style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}
                      >
                        {ticker}
                      </span>
                      {name && (
                        <span className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                          {name}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
