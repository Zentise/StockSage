import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
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

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.3, ease: 'easeOut' },
  }),
};

export default function SuggestionCard({ card, index = 0 }) {
  const navigate = useNavigate();
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

  return (
    <motion.div
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="rounded-md cursor-pointer transition-all duration-200"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}
      whileHover={{
        y: -2,
        transition: { duration: 0.2 },
      }}
      onHoverStart={(e) => {
        e.currentTarget.style.borderColor = 'var(--border2)';
        e.currentTarget.style.background = '#161616';
      }}
      onHoverEnd={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.background = 'var(--card)';
      }}
      onClick={() => navigate(`/stock/${encodeURIComponent(ticker)}?category=${encodeURIComponent(card.category || '')}`)}
    >
      {/* Top color stripe */}
      <div className="h-[2px]" style={{ background: style.stripe }} />

      <div className="p-4">
        {/* Header: Ticker + badge */}
        <div className="flex items-start justify-between mb-1">
          <div>
            <h3
              className="text-[22px] leading-tight"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--white)' }}
            >
              {ticker}
            </h3>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
              {companyName}{exchange ? ` · ${exchange}` : ''}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
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
            className="text-xl"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--white)' }}
          >
            {formatPrice(price)}
          </span>
          {changePct !== 0 && (
            <span
              className="text-sm"
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
              <div
                className="text-[9px] uppercase mb-0.5"
                style={{ color: 'var(--muted)', letterSpacing: '0.5px' }}
              >
                {item.label}
              </div>
              <div
                className="text-xs"
                style={{ fontFamily: 'var(--font-mono)', color: item.valueColor }}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {/* Confidence bar */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] uppercase" style={{ color: 'var(--muted)' }}>
            Confidence
          </span>
          <div className="flex-1 h-[3px] rounded-full" style={{ background: 'var(--border)' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(confidence, 100)}%`,
                background: `linear-gradient(90deg, var(--gold-dim), var(--gold))`,
              }}
            />
          </div>
          <span
            className="text-[11px]"
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
                className="text-[11px] whitespace-nowrap"
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
            style={{
              background: isStale ? 'var(--red)' : 'var(--green)',
            }}
          />
          <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
            {timestamp ? `${timestamp}` : ''}{age ? ` · ${age}` : ''}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
