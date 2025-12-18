import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'gold-primary': '#D4AF37',
        'gold-hover': '#FFD700',
        'gold-dark': '#B8860B',
        'dark-bg': '#141210',
      },
    },
  },
  plugins: [],
}
export default config

