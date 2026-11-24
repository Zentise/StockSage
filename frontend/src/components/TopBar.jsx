import React from 'react';
import { useNavigate } from 'react-router-dom';
import MarketToggle from './MarketToggle';
import SearchBar from './SearchBar';

export default function TopBar({ market, setMarket }) {
  const navigate = useNavigate();

  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between gap-3 px-4 sm:px-6"
      style={{
        height: '56px',
        // Translucent chrome: the terminal scrolls underneath it rather than
        // an opaque bar eating a fixed strip of the viewport.
        background: 'var(--chrome)',
        backdropFilter: 'var(--chrome-blur)',
        WebkitBackdropFilter: 'var(--chrome-blur)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Left: Logo */}
      <button
        type="button"
        className="press flex items-center gap-2 shrink-0"
        onClick={() => navigate('/')}
        aria-label="StockSage home"
      >
        <span
          className="type-display-sm text-[26px]"
          style={{ color: 'var(--gold)' }}
        >
          STOCKSAGE
        </span>
        <span
          className="gold-pulse inline-block w-2 h-2 rounded-full"
          style={{ background: 'var(--gold)' }}
        />
      </button>

      {/* Right: Search + market toggle */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden sm:block">
          <SearchBar market={market} />
        </div>
        <MarketToggle market={market} onToggle={setMarket} />
      </div>
    </header>
  );
}
