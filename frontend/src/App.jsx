import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity } from 'lucide-react';
import Home from './pages/Home';
import StockDetail from './pages/StockDetail';
import LivePriceTicker from './components/LivePriceTicker';
import MarketToggle from './components/MarketToggle';
import SearchBar from './components/SearchBar';
import { fetchIndices } from './api';

function AppLayout() {
  const [market, setMarket] = useState('india');
  const [indices, setIndices] = useState([]);
  const navigate = useNavigate();

  // Load indices on market change or page load
  useEffect(() => {
    fetchIndices(market)
      .then((data) => setIndices(data.indices || []))
      .catch(() => setIndices([]));
  }, [market]);

  const handleSearch = useCallback((ticker) => {
    navigate(`/stock/${encodeURIComponent(ticker)}`);
  }, [navigate]);

  const handleMarketToggle = useCallback((m) => {
    setMarket(m);
    navigate('/');
  }, [navigate]);

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-50 bg-bg-primary/95 backdrop-blur-md border-b border-bg-border">
        {/* Nav row */}
        <div className="flex items-center justify-between px-6 py-3">
          {/* Logo */}
          <motion.div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => navigate('/')}
            whileHover={{ scale: 1.02 }}
          >
            <div className="relative">
              <Activity className="w-6 h-6 text-accent-green" />
              <div className="absolute inset-0 w-6 h-6 text-accent-green animate-pulse-slow opacity-50">
                <Activity className="w-6 h-6" />
              </div>
            </div>
            <span className="text-lg font-bold text-white tracking-tight">
              Stock<span className="text-accent-green">Sage</span>
            </span>
          </motion.div>

          {/* Search */}
          <div className="hidden md:block w-80">
            <SearchBar onSearch={handleSearch} />
          </div>

          {/* Market Toggle */}
          <MarketToggle market={market} onToggle={handleMarketToggle} />
        </div>

        {/* Scrolling ticker */}
        <LivePriceTicker indices={indices} />
      </header>

      {/* Main content */}
      <main className="flex-1 px-6 py-6">
        <Routes>
          <Route path="/" element={<Home market={market} />} />
          <Route path="/stock/:ticker" element={<StockDetail market={market} />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="border-t border-bg-border px-6 py-3 text-center">
        <p className="text-xs text-gray-600">
          StockSage — AI-powered trading signals. Not financial advice. Trade at your own risk.
        </p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}
