import React from 'react';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'intraday', label: 'Intraday' },
  { id: 'short_term', label: 'Short-term' },
  { id: 'long_term', label: 'Long-term' },
];

export default function CategoryTabs({ active, onChange, counts = {} }) {
  return (
    <div
      className="flex items-center rounded-md overflow-hidden"
      style={{ border: '1px solid var(--border)' }}
    >
      {TABS.map((tab, i) => {
        const isActive = active === tab.id;
        const count = counts[tab.id];
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className="relative px-5 py-2.5 text-xs uppercase tracking-wider transition-colors"
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              color: isActive ? 'var(--gold)' : 'var(--muted)',
              background: isActive ? 'rgba(201,168,76,0.06)' : 'transparent',
              borderRight: i < TABS.length - 1 ? '1px solid var(--border)' : 'none',
            }}
          >
            {tab.label}
            {count != null && (
              <span
                className="ml-1.5 text-[9px]"
                style={{ opacity: 0.6 }}
              >
                {count}
              </span>
            )}
            {isActive && (
              <span
                className="absolute bottom-0 left-0 right-0 h-[2px]"
                style={{ background: 'var(--gold)' }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
