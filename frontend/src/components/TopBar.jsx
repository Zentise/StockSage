import React from 'react';
import { useNavigate } from 'react-router-dom';
import MarketToggle from './MarketToggle';

export default function TopBar({ market, setMarket }) {
  const navigate = useNavigate();

  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between px-6"
      style={{
        height: '56px',
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Left: Logo */}
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
        <span
          className="text-[26px] tracking-wide"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)' }}
        >
          STOCKSAGE
        </span>
        <span
          className="gold-pulse inline-block w-2 h-2 rounded-full"
          style={{ background: 'var(--gold)' }}
        />
      </div>

      {/* Right: Market toggle */}
      <div className="flex items-center gap-3">
        <MarketToggle market={market} onToggle={setMarket} />
      </div>
    </header>
  );
}
