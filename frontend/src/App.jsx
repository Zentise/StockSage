import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import Home from './pages/Home';
import StockDetail from './pages/StockDetail';
import Accuracy from './pages/Accuracy';

export default function App() {
  const [market, setMarket] = useState('india');

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<Home market={market} setMarket={setMarket} />} />
        <Route path="/stock/:ticker" element={<StockDetail market={market} setMarket={setMarket} />} />
        <Route path="/accuracy" element={<Accuracy market={market} setMarket={setMarket} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
