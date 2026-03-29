import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity } from 'lucide-react';
import Home from './pages/Home';
import StockDetail from './pages/StockDetail';
import LandingPage from './pages/LandingPage';
import LivePriceTicker from './components/LivePriceTicker';
import MarketToggle from './components/MarketToggle';
import SearchBar from './components/SearchBar';
import { fetchIndices } from './api';

// Error boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, hasError: false };
  }
  static getDerivedStateFromError(error) {
    return { error, hasError: true };
  }
  componentDidCatch(error) {
    console.error('App error:', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: '#fff', background: '#050507', minHeight: '100vh' }}>
          <h1>App Error</h1>
          <p>{this.state.error?.message}</p>
          <p style={{ color: '#999', fontSize: '12px', marginTop: '10px' }}>{this.state.error?.stack}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    navigate('/dashboard');
  }, [navigate]);

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-50 bg-bg-primary/95 backdrop-blur-md border-b border-bg-border">
        {/* Nav row */}
        <div className="flex items-center justify-between px-6 py-3">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <motion.div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => navigate('/dashboard')}
              whileHover={{ scale: 1.02 }}
            >
              <div className="relative">
                <Activity className="w-6 h-6 text-accent-green" style={{ filter: 'drop-shadow(0 0 6px #00ff88)' }} />
                <div className="absolute inset-0 w-6 h-6 text-accent-green animate-pulse-slow opacity-40">
                  <Activity className="w-6 h-6" />
                </div>
              </div>
              <span className="text-lg font-black text-white tracking-tight">
                Stock<span className="text-accent-green" style={{ textShadow: '0 0 12px rgba(0,255,136,0.5)' }}>Sage</span>
              </span>
            </motion.div>
            <motion.button
              onClick={() => navigate('/')}
              whileHover={{ scale: 1.05 }}
              className="hidden sm:flex items-center gap-1 text-gray-600 hover:text-gray-400 text-xs transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
            >
              ← Home
            </motion.button>
          </div>

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
          <Route path="/dashboard" element={<Home market={market} />} />
          <Route path="/stock/:ticker" element={<StockDetail market={market} />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
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
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/*" element={<AppLayout />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
