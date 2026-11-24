import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sparkline from './Sparkline';

const getAge = (epoch) => {
  if (!epoch) return '';
  const diff = Math.floor(Date.now() / 1000 - epoch);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

const signalStyles = {
  BUY: {
    stripe: 'var(--green)',
    bg: 'rgba(0,200,150,0.12)',
    color: 'var(--green)',
    border: 'rgba(0,200,150,0.25)',
    sparkline: '#00c896',
  },
  SELL: {
    stripe: 'var(--red)',
    bg: 'rgba(255,69,96,0.12)',
    color: 'var(--red)',
    border: 'rgba(255,69,96,0.25)',
    sparkline: '#ff4560',
  },
  AVOID: {
    stripe: 'var(--orange)',
    bg: 'rgba(255,140,0,0.12)',
    color: 'var(--orange)',
    border: 'rgba(255,140,0,0.25)',
    sparkline: '#ff8c00',
  },
};

// Stagger is decorative. Capped so a long grid never makes the last card
// wait — 30-80ms between items, and no more than ~300ms of cascade total.
const STAGGER_STEP = 50;
const STAGGER_CAP = 6;

export default function SuggestionCard({ card, index = 0, stagger = false }) {
  const navigate = useNavigate();
  // Frozen at mount: re-rendering must never re-time an animation already
  // in flight, and a card that persists across a refresh must not replay it.
  const [entranceDelay] = useState(
    () => (stagger ? Math.min(index, STAGGER_CAP) * STAGGER_STEP : 0)
  );
  const signal = (card.signal || card.action || 'BUY').toUpperCase();
  const style = signalStyles[signal] || signalStyles.BUY;
  const isStale = card.timestamp_epoch && (Date.now() / 1000 - card.timestamp_epoch) > 3600;
  const age = getAge(card.timestamp_epoch);

  const price = card.price || card.ltp || card.current_price || 0;
  const changePct = card.change_pct ?? card.pct_change ?? 0;
  const entry = card.entry || card.entry_price || price;
  const stopLoss = card.stop_loss || card.sl || 0;
  const target = card.target || card.target_price || 0;
  const confidence = card.confidence || card.confidence_score || 0;
  const strategy = card.strategy || card.reason || '';
  const rr = card.risk_reward || card.rr || '';
  const ticker = card.ticker || card.symbol || '';
  const companyName = card.company_name || card.name || '';
  const exchange = card.exchange || '';
  const timestamp = card.timestamp || '';
  const sparkData = card.sparkline || card.price_history || [];

  const currencySymbol = exchange?.includes('NS') || exchange?.includes('BO') ? '₹' : '$';

  const formatPrice = (p) => {
    if (!p || p === 0) return '-';
    return `${currencySymbol}${Number(p).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const open = () =>
    navigate(`/stock/${encodeURIComponent(ticker)}?category=${encodeURIComponent(card.category || '')}`);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${ticker} ${signal} signal`}
      className="press-surface surface-card rise-in rounded-md overflow-hidden cursor-pointer text-left"
      style={{
        // Only the first paint of a grid earns the cascade; a 60s refresh or
        // a tab switch must not replay it.
        animationDelay: `${entranceDelay}ms`,
      }}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
    >
      {/* Top color stripe */}
      <div className="h-[2px]" style={{ background: style.stripe }} />

      <div className="p-4">
        {/* Header: Ticker + badge */}
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="min-w-0">
            <h3
              className="type-display-md text-[22px] truncate"
              style={{ color: 'var(--white)' }}
            >
              {ticker}
            </h3>
            <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--muted)' }}>
              {companyName}{exchange ? ` · ${exchange}` : ''}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span
              className="px-2.5 py-1 rounded text-[10px] uppercase font-medium tracking-wider"
              style={{
                background: style.bg,
                color: style.color,
                border: `1px solid ${style.border}`,
              }}
            >
              {signal}
            </span>
            {card.category && (
              <span
                className="px-2 py-0.5 rounded text-[9px] uppercase tracking-wider"
                style={{ background: 'rgba(201,168,76,0.08)', color: 'var(--gold)', border: '1px solid rgba(201,168,76,0.15)' }}
              >
                {card.category.replace('_', ' ')}
              </span>
            )}
          </div>
        </div>

        {/* Price */}
        <div className="mt-3 flex items-baseline gap-2">
          <span
            className="tnum text-xl"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--white)' }}
          >
            {formatPrice(price)}
          </span>
          {changePct !== 0 && (
            <span
              className="tnum text-sm"
              style={{
                fontFamily: 'var(--font-mono)',
                color: changePct >= 0 ? 'var(--green)' : 'var(--red)',
              }}
            >
              {changePct >= 0 ? '+' : ''}{Number(changePct).toFixed(2)}%
            </span>
          )}
        </div>

        {/* Sparkline */}
        {sparkData.length > 1 && (
          <div className="mt-3">
            <Sparkline data={sparkData} color={style.sparkline} width={280} height={40} />
          </div>
        )}

        {/* Entry / SL / Target grid */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          {[
            { label: 'Entry', value: formatPrice(entry), valueColor: 'var(--white)' },
            { label: 'Stop Loss', value: formatPrice(stopLoss), valueColor: 'var(--red)' },
            { label: 'Target', value: formatPrice(target), valueColor: 'var(--green)' },
          ].map((item) => (
            <div
              key={item.label}
              className="px-2 py-1.5 rounded"
              style={{ border: '1px solid var(--border)', background: 'var(--bg)' }}
            >
              <div className="type-label text-[9px] mb-0.5" style={{ color: 'var(--muted)' }}>
                {item.label}
              </div>
              <div
                className="tnum text-xs"
                style={{ fontFamily: 'var(--font-mono)', color: item.valueColor }}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {/* Confidence bar */}
        <div className="mt-3 flex items-center gap-2">
          <span className="type-label" style={{ color: 'var(--muted)' }}>
            Confidence
          </span>
          <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
            {/* scaleX, not width: transform skips layout and paint. */}
            <div
              className="h-full rounded-full origin-left"
              style={{
                width: '100%',
                transform: `scaleX(${Math.min(confidence, 100) / 100})`,
                transition: 'transform var(--dur-tab) var(--ease-out)',
                background: 'linear-gradient(90deg, var(--gold-dim), var(--gold))',
              }}
            />
          </div>
          <span
            className="tnum text-[11px]"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}
          >
            {Math.round(confidence)}%
          </span>
        </div>

        {/* Strategy + R:R */}
        {(strategy || rr) && (
          <div className="mt-3 flex items-center justify-between">
            {strategy && (
              <p className="text-[11px] truncate mr-2" style={{ color: 'var(--muted)' }}>
                {strategy}
              </p>
            )}
            {rr && (
              <span
                className="tnum text-[11px] whitespace-nowrap"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted2)' }}
              >
                R:R {rr}
              </span>
            )}
          </div>
        )}

        {/* Timestamp */}
        <div className="mt-3 flex items-center gap-1.5">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: isStale ? 'var(--red)' : 'var(--green)' }}
          />
          <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
            {timestamp ? `${timestamp}` : ''}{age ? ` · ${age}` : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
