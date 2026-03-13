import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, RefreshCw, AlertTriangle, Zap } from 'lucide-react';
import CategoryTabs from '../components/CategoryTabs';
import SuggestionCard from '../components/SuggestionCard';
import NewsTickerFeed from '../components/NewsTickerFeed';
import { fetchSuggestions, fetchNews, fetchChartData, triggerScan } from '../api';

export default function Home({ market }) {
  const [category, setCategory] = useState('all');
  const [allSuggestions, setAllSuggestions] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [news, setNews] = useState([]);
  const [chartCache, setChartCache] = useState({});
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [marketOpen, setMarketOpen] = useState(true);
  const [lastScan, setLastScan] = useState('');
  const pollRef = useRef(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sugData, newsData] = await Promise.all([
        fetchSuggestions(market, 'all'),
        fetchNews(market),
      ]);

      const all = sugData.suggestions || [];
      setAllSuggestions(all);
      setSuggestions(category === 'all' ? all : all.filter(s => s.category === category));
      setMarketOpen(sugData.market_open);
      setLastScan(sugData.last_scan || '');
      setScanning(sugData.scanning || false);
      setNews(newsData.news || []);

      // Load mini chart data for first 6 suggestions
      const chartPromises = all.slice(0, 6).map(async (s) => {
        if (!chartCache[s.ticker]) {
          const cd = await fetchChartData(s.ticker, '1mo', '1d');
          return { ticker: s.ticker, data: cd.data || [] };
        }
        return null;
      });

      const charts = await Promise.all(chartPromises);
      const newCache = { ...chartCache };
      charts.forEach((c) => {
        if (c) newCache[c.ticker] = c.data;
      });
      setChartCache(newCache);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [market]);

  // Fetch data only when market changes
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-poll while scan is in progress
  useEffect(() => {
    if (scanning && allSuggestions.length === 0) {
      pollRef.current = setInterval(() => {
        loadData();
      }, 5000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [scanning, allSuggestions.length, loadData]);

  // Filter locally when category changes
  useEffect(() => {
    setSuggestions(
      category === 'all' ? allSuggestions : allSuggestions.filter(s => s.category === category)
    );
  }, [category, allSuggestions]);

  return (
    <div className="flex-1">
      {/* Dashboard Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-6"
      >
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-2 rounded-full bg-accent-green animate-pulse" style={{ boxShadow: '0 0 8px #00ff88' }} />
          <h1 className="text-2xl font-black text-white">
            AI Market <span className="text-accent-green">Dashboard</span>
          </h1>
        </div>
        <p className="text-gray-500 text-sm ml-5">
          Real-time signals powered by multi-agent AI — {market === 'india' ? '🇮🇳 NSE India' : '🇺🇸 US Markets'}
        </p>
      </motion.div>

      {/* Market Closed Banner */}
      <AnimatePresence>
        {!marketOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-accent-yellow/10 border border-accent-yellow/20 rounded-lg px-4 py-2.5 mb-4 flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 text-accent-yellow flex-shrink-0" />
            <span className="text-xs text-accent-yellow">
              Market Closed — Showing last session data
              {lastScan && ` (${lastScan})`}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category Tabs */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <CategoryTabs active={category} onSelect={setCategory} />
        <button
          onClick={loadData}
          className="p-2 rounded-lg bg-bg-card border border-bg-border hover:border-gray-600 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex gap-6">
        {/* Main: Suggestion Cards Grid */}
        <div className="flex-1">
          {(loading || scanning) && suggestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Activity className="w-8 h-8 text-accent-green animate-pulse mb-3" />
              <p className="text-gray-400 text-sm font-medium mb-1">
                {scanning ? 'AI agents scanning markets...' : 'Loading...'}
              </p>
              {scanning && (
                <p className="text-gray-600 text-xs">Analyzing stocks with technical indicators, sentiment & patterns</p>
              )}
            </div>
          ) : suggestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Zap className="w-8 h-8 text-gray-600 mb-3" />
              <p className="text-gray-500 text-sm mb-2">No signals found</p>
              <p className="text-gray-600 text-xs mb-4">Run the AI scanner to find trading opportunities</p>
              <button
                onClick={async () => {
                  setScanning(true);
                  try {
                    const data = await triggerScan(market);
                    const all = data.suggestions || [];
                    setAllSuggestions(all);
                    setSuggestions(category === 'all' ? all : all.filter(s => s.category === category));
                  } catch (e) {
                    console.error('Scan failed:', e);
                  } finally {
                    setScanning(false);
                  }
                }}
                className="px-4 py-2 bg-accent-green/20 text-accent-green rounded-lg text-sm font-medium hover:bg-accent-green/30 transition-colors flex items-center gap-2"
              >
                <Zap className="w-4 h-4" />
                Scan Now
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <AnimatePresence mode="popLayout">
                {suggestions.map((s, i) => (
                  <SuggestionCard
                    key={s.ticker}
                    suggestion={s}
                    chartData={chartCache[s.ticker]}
                    index={i}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Right Sidebar: News */}
        <div className="hidden lg:block w-80 flex-shrink-0">
          <div className="sticky top-4">
            <NewsTickerFeed news={news} />
          </div>
        </div>
      </div>
    </div>
  );
}
