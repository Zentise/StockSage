import React, { useState, useEffect, useRef, useMemo } from 'react';
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

export default function SearchBar({ market }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [stocks, setStocks] = useState({ india: [], us: [] });
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadStocks().then(setStocks);
  }, []);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const results = useMemo(() => {
    if (!query || query.length < 1) return [];
    const list = stocks[market] || [];
    const q = query.toUpperCase();
    return list
      .filter(s => {
        const ticker = typeof s === 'string' ? s : s.ticker || s.symbol || '';
        const name = typeof s === 'string' ? '' : s.name || '';
        return ticker.toUpperCase().includes(q) || name.toUpperCase().includes(q);
      })
      .slice(0, 12);
  }, [query, market, stocks]);

  const handleSelect = (item) => {
    const ticker = typeof item === 'string' ? item : item.ticker || item.symbol || item;
    setOpen(false);
    setQuery('');
    navigate(`/stock/${encodeURIComponent(ticker)}`);
  };

  return (
    <>
      {/* Search pill trigger */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors"
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
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
          style={{ background: 'rgba(0,0,0,0.9)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setOpen(false);
              setQuery('');
            }
          }}
        >
          <div className="w-full max-w-lg mx-4">
            <div className="relative">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ENTER TICKER"
                className="w-full px-6 py-4 text-2xl tracking-wider outline-none"
                style={{
                  fontFamily: 'var(--font-display)',
                  background: 'var(--surface)',
                  border: '1px solid var(--border2)',
                  borderRadius: '8px',
                  color: 'var(--white)',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && results.length > 0) {
                    handleSelect(results[0]);
                  }
                }}
              />
              <button
                onClick={() => { setOpen(false); setQuery(''); }}
                className="absolute right-4 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            {results.length > 0 && (
              <div
                className="mt-2 rounded-lg overflow-hidden max-h-[50vh] overflow-y-auto"
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                }}
              >
                {results.map((item, i) => {
                  const ticker = typeof item === 'string' ? item : item.ticker || item.symbol || '';
                  const name = typeof item === 'string' ? '' : item.name || '';
                  return (
                    <button
                      key={ticker + i}
                      onClick={() => handleSelect(item)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#1a1a1a]"
                      style={{ borderBottom: '1px solid var(--border)' }}
                    >
                      <span
                        className="text-sm font-medium"
                        style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}
                      >
                        {ticker}
                      </span>
                      {name && (
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>
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
