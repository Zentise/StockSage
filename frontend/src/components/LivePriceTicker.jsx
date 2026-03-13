import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';

export default function LivePriceTicker({ indices }) {
  const items = [...(indices || [])];

  if (items.length === 0) {
    return (
      <div className="w-full bg-bg-card border-b border-bg-border py-2">
        <div className="flex items-center justify-center text-gray-500 text-xs">
          Loading market data...
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-bg-card/80 backdrop-blur border-b border-bg-border overflow-hidden">
      <div className="flex animate-marquee whitespace-nowrap py-2">
        {[...items, ...items].map((item, i) => {
          const isUp = (item.change_pct || 0) >= 0;
          return (
            <div
              key={`${item.ticker || item.name}-${i}`}
              className="inline-flex items-center gap-2 mx-6 text-xs"
            >
              <span className="text-gray-400 font-medium">
                {item.name || item.ticker}
              </span>
              <span className="font-mono font-semibold text-white">
                {typeof item.price === 'number' ? item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : item.price}
              </span>
              <span
                className={`flex items-center gap-0.5 font-mono font-medium ${
                  isUp ? 'text-accent-green' : 'text-accent-red'
                }`}
              >
                {isUp ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {isUp ? '+' : ''}
                {typeof item.change_pct === 'number' ? item.change_pct.toFixed(2) : item.change_pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
