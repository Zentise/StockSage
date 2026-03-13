import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';

export default function SearchBar({ onSearch }) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim().toUpperCase());
      setQuery('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search ticker (e.g. RELIANCE.NS, AAPL)"
        className="w-full pl-10 pr-4 py-2 bg-bg-card border border-bg-border rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent-green/50 transition-colors"
      />
    </form>
  );
}
