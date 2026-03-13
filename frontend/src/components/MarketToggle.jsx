import { motion } from 'framer-motion';

export default function MarketToggle({ market, onToggle }) {
  return (
    <div className="flex items-center bg-bg-card border border-bg-border rounded-lg p-1 gap-1">
      <button
        onClick={() => onToggle('india')}
        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
          market === 'india'
            ? 'bg-accent-green/20 text-accent-green border border-accent-green/30'
            : 'text-gray-400 hover:text-white'
        }`}
      >
        🇮🇳 India
      </button>
      <button
        onClick={() => onToggle('us')}
        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
          market === 'us'
            ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
            : 'text-gray-400 hover:text-white'
        }`}
      >
        🇺🇸 US
      </button>
    </div>
  );
}
