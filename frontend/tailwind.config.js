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
        'card-hover': '#171717',
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
      // Motion tokens mirror :root in index.css — the built-in Tailwind
      // easings are too weak for UI, so `ease-out` here is the strong curve.
      transitionTimingFunction: {
        out: 'cubic-bezier(0.23, 1, 0.32, 1)',
        'in-out': 'cubic-bezier(0.77, 0, 0.175, 1)',
        drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      transitionDuration: {
        press: '160ms',
        tip: '125ms',
        menu: '200ms',
        tab: '250ms',
      },
    },
  },
  plugins: [],
}
