import '@fontsource-variable/anek-latin/wdth.css';
import '@fontsource-variable/spline-sans-mono/wght.css';
import './styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import Shell from './components/Shell';
import { AppState } from './state';

const Landing = lazy(() => import('./pages/Landing'));
const Desk = lazy(() => import('./pages/Desk'));
const Stock = lazy(() => import('./pages/Stock'));
const Record = lazy(() => import('./pages/Record'));
const Watchlist = lazy(() => import('./pages/Watchlist'));
const Journal = lazy(() => import('./pages/Journal'));
const Brief = lazy(() => import('./pages/Brief'));
const Legal = lazy(() => import('./pages/Legal'));

const wait = <div className="skeleton m-6 h-[60vh]" />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <AppState>
        <BrowserRouter>
          <Suspense fallback={wait}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route element={<Shell />}>
                <Route path="/desk" element={<Desk />} />
                <Route path="/stock/:ticker" element={<Stock />} />
                <Route path="/record" element={<Record />} />
                <Route path="/watchlist" element={<Watchlist />} />
                <Route path="/journal" element={<Journal />} />
                <Route path="/brief" element={<Brief />} />
                <Route path="/about" element={<Legal />} />
              </Route>
              {/* old addresses */}
              <Route path="/dashboard" element={<Navigate to="/desk" replace />} />
              <Route path="/accuracy" element={<Navigate to="/record" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AppState>
    </QueryClientProvider>
  </StrictMode>,
);
