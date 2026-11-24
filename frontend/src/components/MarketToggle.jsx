import React from 'react';

const MARKETS = [
  { id: 'india', label: '🇮🇳 India' },
  { id: 'us', label: '🇺🇸 US' },
];

/**
 * Segmented control. The active state is a clipped duplicate of the strip
 * rather than per-button colour transitions, so the gold fill and the black
 * label arrive together instead of crossfading past each other.
 */
export default function MarketToggle({ market, onToggle }) {
  const activeIndex = Math.max(0, MARKETS.findIndex((m) => m.id === market));
  const clipPath = activeIndex === 0 ? 'inset(0 50% 0 0)' : 'inset(0 0 0 50%)';

  const cell = 'px-3 py-1.5 text-xs font-medium text-center whitespace-nowrap';

  return (
    <div
      role="group"
      aria-label="Market"
      className="press relative grid grid-cols-2 rounded-md overflow-hidden"
      style={{ border: '1px solid var(--border2)' }}
    >
      {MARKETS.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onToggle(m.id)}
          aria-pressed={market === m.id}
          className={cell}
          style={{ color: 'var(--muted)' }}
        >
          {m.label}
        </button>
      ))}

      {/* Active copy — clipped to the selected half, ignores the pointer. */}
      <div
        aria-hidden="true"
        className="clip-layer absolute inset-0 grid grid-cols-2 pointer-events-none"
        style={{ clipPath, background: 'var(--gold)' }}
      >
        {MARKETS.map((m) => (
          <span key={m.id} className={cell} style={{ color: '#000' }}>
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}
