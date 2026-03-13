import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Clock, Zap, Target, Shield } from 'lucide-react';
import MiniChart from './MiniChart';

export default function SuggestionCard({ suggestion, chartData, index = 0 }) {
  const navigate = useNavigate();
  const {
    ticker, name, signal, entry, sl, target, rr_ratio,
    confidence, strategy, top_headline, timeframe, category, sentiment,
  } = suggestion;

  const isBuy = signal === 'BUY';
  const isAvoid = signal === 'AVOID';
  const displayPrice = entry;
  const currency = ticker?.endsWith('.NS') ? '₹' : '$';

  const accentColor = isBuy ? '#00ff88' : isAvoid ? '#ffd700' : '#ff3355';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      onClick={() => navigate(`/stock/${encodeURIComponent(ticker)}`)}
      whileHover={{ y: -6, scale: 1.01 }}
      className="relative overflow-hidden rounded-xl p-4 cursor-pointer group"
      style={{
        background: '#0d0d15',
        border: `1px solid rgba(255,255,255,0.06)`,
        transition: 'border-color 0.3s, box-shadow 0.3s',
      }}
      onHoverStart={(e) => {
        e.currentTarget.style.borderColor = `${accentColor}30`;
        e.currentTarget.style.boxShadow = `0 0 30px ${accentColor}10`;
      }}
      onHoverEnd={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Neon top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] rounded-t-xl"
        style={{ background: accentColor, boxShadow: `0 0 12px ${accentColor}80` }}
      />

      {/* Header: Name + Signal Badge */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-sm truncate">{name}</h3>
          <p className="text-gray-500 text-xs font-mono">{ticker}</p>
        </div>
        <span
          className="px-3 py-1 rounded-full text-xs font-black"
          style={{ color: accentColor, background: `${accentColor}18`, border: `1px solid ${accentColor}40` }}
        >
          {signal}
        </span>
      </div>

      {/* Price */}
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-xl font-mono font-bold text-white">
          {currency}{displayPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      {/* Mini Chart */}
      {chartData && chartData.length > 0 && (
        <div className="mb-3">
          <MiniChart
            data={chartData}
            color={isBuy ? '#00ff88' : '#ff3355'}
            width={240}
            height={45}
          />
        </div>
      )}

      {/* Entry / SL / Target */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
        <div className="bg-white/5 rounded-lg p-2 text-center">
          <div className="text-gray-500 mb-0.5">Entry</div>
          <div className="font-mono font-semibold text-white">
            {currency}{entry?.toFixed(2)}
          </div>
        </div>
        <div className="bg-white/5 rounded-lg p-2 text-center">
          <div className="text-gray-500 mb-0.5">SL</div>
          <div className="font-mono font-semibold text-accent-red">
            {currency}{sl?.toFixed(2)}
          </div>
        </div>
        <div className="bg-white/5 rounded-lg p-2 text-center">
          <div className="text-gray-500 mb-0.5">Target</div>
          <div className="font-mono font-semibold text-accent-green">
            {currency}{target?.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Badges row */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 text-[10px] text-gray-300 border border-white/10">
          <Target className="w-3 h-3" /> R:R {rr_ratio}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 text-[10px] text-gray-300 border border-white/10">
          <Clock className="w-3 h-3" /> {timeframe}
        </span>
        {sentiment && (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border ${
              sentiment === 'positive'
                ? 'bg-accent-green/10 text-accent-green border-accent-green/20'
                : sentiment === 'negative'
                ? 'bg-accent-red/10 text-accent-red border-accent-red/20'
                : 'bg-white/5 text-gray-400 border-white/10'
            }`}
          >
            {sentiment}
          </span>
        )}
      </div>

      {/* Confidence bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-gray-500">Confidence</span>
          <span className="font-mono text-gray-300">{confidence}%</span>
        </div>
        <div className="w-full bg-white/5 rounded-full h-1.5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${confidence}%` }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className={`h-1.5 rounded-full ${
              confidence >= 70 ? 'bg-accent-green' : confidence >= 50 ? 'bg-accent-yellow' : 'bg-accent-red'
            }`}
          />
        </div>
      </div>

      {/* Strategy */}
      <div className="flex items-center gap-1.5 mb-2">
        <Zap className="w-3 h-3 text-accent-yellow" />
        <span className="text-[11px] text-gray-300 truncate">{strategy}</span>
      </div>

      {/* Top headline */}
      {top_headline && top_headline !== 'No recent news' && (
        <p className="text-[10px] text-gray-500 truncate leading-relaxed">
          📰 {top_headline}
        </p>
      )}
    </motion.div>
  );
}
