import React from 'react';

export default function MarketToggle({ market, onToggle }) {
  return (
    <div
      className="flex items-center rounded-md overflow-hidden"
      style={{ border: '1px solid var(--border2)' }}
    >
      <button
        onClick={() => onToggle('india')}
        className="px-3 py-1.5 text-xs font-medium transition-all duration-200"
        style={{
          background: market === 'india' ? 'var(--gold)' : 'transparent',
          color: market === 'india' ? '#000' : 'var(--muted)',
        }}
      >
        🇮🇳 India
      </button>
      <button
        onClick={() => onToggle('us')}
        className="px-3 py-1.5 text-xs font-medium transition-all duration-200"
        style={{
          background: market === 'us' ? 'var(--gold)' : 'transparent',
          color: market === 'us' ? '#000' : 'var(--muted)',
        }}
      >
        🇺🇸 US
      </button>
    </div>
  );
}
