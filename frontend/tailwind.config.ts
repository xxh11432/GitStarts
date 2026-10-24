import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'rgb(var(--color-bg) / <alpha-value>)',
        surface: 'rgb(var(--color-bg-subtle) / <alpha-value>)',
        line: 'rgb(var(--color-border) / <alpha-value>)',
        ink: 'rgb(var(--color-text) / <alpha-value>)',
        'ink-secondary': 'rgb(var(--color-text-secondary) / <alpha-value>)',
        'ink-muted': 'rgb(var(--color-text-muted) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          hover: 'rgb(var(--color-accent-hover) / <alpha-value>)',
        },
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        info: 'rgb(var(--color-info) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
      },
      fontSize: {
        display: ['40px', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
        title: ['28px', { lineHeight: '1.3', letterSpacing: '-0.01em' }],
        body: ['16px', { lineHeight: '1.7' }],
      },
      borderRadius: {
        card: 'var(--radius-card)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
      },
      maxWidth: {
        container: 'var(--container)',
      },
      screens: {
        sm: '640px',
        md: '900px',
        lg: '1200px',
      },
    },
  },
  plugins: [],
};

export default config;
