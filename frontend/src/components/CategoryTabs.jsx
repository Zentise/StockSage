import { motion } from 'framer-motion';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'intraday', label: 'Intraday' },
  { id: 'fno', label: 'F&O' },
  { id: 'short_term', label: 'Short-term' },
  { id: 'long_term', label: 'Long-term' },
  { id: 'commodities', label: 'Commodities' },
];

export default function CategoryTabs({ active, onSelect }) {
  return (
    <div className="flex items-center gap-1 bg-bg-card border border-bg-border rounded-lg p-1 overflow-x-auto">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          className={`relative px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all duration-200 ${
            active === tab.id
              ? 'text-white'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {active === tab.id && (
            <motion.div
              layoutId="activeTab"
              className="absolute inset-0 bg-white/10 rounded-md"
              transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
            />
          )}
          <span className="relative z-10">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
