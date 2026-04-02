/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#080808',
        surface: '#0f0f0f',
        card: '#131313',
        border: '#1e1e1e',
        border2: '#2a2a2a',
        gold: '#c9a84c',
        gold2: '#e8c96a',
        'gold-dim': '#7a6330',
        green: '#00c896',
        red: '#ff4560',
        orange: '#ff8c00',
        white: '#f0ede6',
        muted: '#666666',
        muted2: '#444444',
      },
      fontFamily: {
        display: ['Bebas Neue', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
