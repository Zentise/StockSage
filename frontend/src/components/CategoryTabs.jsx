import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'intraday', label: 'Intraday' },
  { id: 'short_term', label: 'Short-term' },
  { id: 'long_term', label: 'Long-term' },
];

/**
 * Tabs where the active state is a clipped duplicate of the whole strip.
 * Text colour, tint and underline are one element being revealed rather than
 * three properties being interpolated, so they can never fall out of sync.
 */
export default function CategoryTabs({ active, onChange, counts = {} }) {
  const listRef = useRef(null);
  const tabRefs = useRef({});
  const [clipPath, setClipPath] = useState(null);

  const measure = useCallback(() => {
    const list = listRef.current;
    const el = tabRefs.current[active];
    if (!list || !el) return;
    // offsetLeft is measured from the border box; the clipped copy is
    // positioned against the padding box, so discount the border.
    const left = el.offsetLeft - list.clientLeft;
    const right = list.clientWidth - (left + el.offsetWidth);
    setClipPath(`inset(0 ${right}px 0 ${left}px)`);
  }, [active]);

  // A stable key: `counts` is a fresh object every parent render, and this
  // effect must only re-run when a label's width can actually have changed.
  const countsKey = TABS.map((t) => counts[t.id]).join(',');

  // Before paint, so the indicator is never briefly in the wrong place.
  useLayoutEffect(measure, [measure, countsKey]);

  // Labels change width when the counts land, and the strip reflows on resize.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [measure]);

  const renderTab = (tab, i, activeCopy) => {
    const count = counts[tab.id];
    return (
      <span
        key={tab.id}
        className="relative px-5 py-2.5 text-xs uppercase tracking-wider whitespace-nowrap"
        style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 500,
          color: activeCopy ? 'var(--gold)' : 'var(--muted)',
          background: activeCopy ? 'rgba(201,168,76,0.06)' : 'transparent',
          borderRight: i < TABS.length - 1 ? '1px solid var(--border)' : 'none',
        }}
      >
        {tab.label}
        {count != null && (
          <span className="ml-1.5 text-[9px]" style={{ opacity: 0.6 }}>
            {count}
          </span>
        )}
        {activeCopy && (
          <span
            className="absolute bottom-0 left-0 right-0 h-[2px]"
            style={{ background: 'var(--gold)' }}
          />
        )}
      </span>
    );
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Signal horizon"
      className="relative inline-flex items-stretch rounded-md overflow-hidden"
      style={{ border: '1px solid var(--border)' }}
    >
      {TABS.map((tab, i) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          ref={(el) => { tabRefs.current[tab.id] = el; }}
          className="flex"
        >
          {renderTab(tab, i, false)}
        </button>
      ))}

      {/* Active copy — one clipped layer, so every property lands together. */}
      <div
        aria-hidden="true"
        className="clip-layer absolute inset-0 flex items-stretch pointer-events-none"
        style={{ clipPath: clipPath ?? 'inset(0 100% 0 0)', opacity: clipPath ? 1 : 0 }}
      >
        {TABS.map((tab, i) => (
          <span key={tab.id} className="flex">
            {renderTab(tab, i, true)}
          </span>
        ))}
      </div>
    </div>
  );
}
