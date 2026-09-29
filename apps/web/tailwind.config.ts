import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#1d4ed8',
          dark: '#1e293b',
        },
      },
    },
  },
  plugins: [],
};

export default config;
