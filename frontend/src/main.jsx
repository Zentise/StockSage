import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

console.log('🚀 StockSage mounting...');
const root = document.getElementById('root');
console.log('Root element:', root);

// Catch unhandled Promise rejections
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
  root.innerHTML = `<div style="padding: 20px; color: #fff; background: #050507; font-family: monospace; line-height: 1.6;">
    <p style="color: #f66;">❌ Unhandled Error</p>
    <p style="margin-top: 10px; font-size: 12px; color: #ccc;">${e.reason?.message || e.reason}</p>
  </div>`;
});

try {
  console.log('Creating React root...');
  const rootElement = ReactDOM.createRoot(root);
  console.log('Rendering App...');
  rootElement.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  console.log('✅ StockSage mounted successfully');
} catch (error) {
  console.error('❌ Failed to mount StockSage:', error);
  root.innerHTML = `<div style="padding: 20px; color: #fff; background: #050507; font-family: monospace; line-height: 1.6;">
    <p style="color: #f66;">❌ Mount Error</p>
    <p style="margin-top: 10px; font-size: 12px; color: #ccc;">${error.message}</p>
    <p style="margin-top: 20px; font-size: 11px; color: #999; max-height: 200px; overflow: auto;">${error.stack}</p>
  </div>`;
}
