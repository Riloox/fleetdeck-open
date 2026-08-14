/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // One superfamily at two widths - see the type note in tokens.css.
        sans: [
          'Saira',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        display: [
          'Saira Condensed',
          'Saira',
          'Helvetica Neue',
          'sans-serif',
        ],
        // Wordmark treatment. See tokens.css.
        brand: [
          'Saira',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        // Code surfaces only - console, diff, raw editors. Inline metadata uses
        // the body face with `tabular-nums`; see --font-outlier in tokens.css.
        mono: [
          'IBM Plex Mono',
          'SF Mono',
          'Cascadia Code',
          'Consolas',
          'monospace',
        ],
        pixel: [
          '"Press Start 2P"',
          'IBM Plex Mono',
          'monospace',
        ],
      },
      colors: {
        border: 'oklch(var(--border) / <alpha-value>)',
        input: 'oklch(var(--input) / <alpha-value>)',
        ring: 'oklch(var(--ring) / <alpha-value>)',
        background: 'oklch(var(--background) / <alpha-value>)',
        foreground: 'oklch(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'oklch(var(--primary) / <alpha-value>)',
          strong: 'oklch(var(--primary-strong) / <alpha-value>)',
          foreground: 'oklch(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'oklch(var(--secondary) / <alpha-value>)',
          foreground: 'oklch(var(--secondary-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'oklch(var(--destructive) / <alpha-value>)',
          foreground: 'oklch(var(--destructive-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'oklch(var(--muted) / <alpha-value>)',
          foreground: 'oklch(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'oklch(var(--accent) / <alpha-value>)',
          foreground: 'oklch(var(--accent-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'oklch(var(--popover) / <alpha-value>)',
          foreground: 'oklch(var(--popover-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'oklch(var(--card) / <alpha-value>)',
          foreground: 'oklch(var(--card-foreground) / <alpha-value>)',
        },
        status: {
          online: 'oklch(var(--status-online) / <alpha-value>)',
          warn: 'oklch(var(--status-warn) / <alpha-value>)',
          offline: 'oklch(var(--status-offline) / <alpha-value>)',
          error: 'oklch(var(--status-error) / <alpha-value>)',
        },
        chart: {
          1: 'oklch(var(--chart-1) / <alpha-value>)',
          2: 'oklch(var(--chart-2) / <alpha-value>)',
          3: 'oklch(var(--chart-3) / <alpha-value>)',
          4: 'oklch(var(--chart-4) / <alpha-value>)',
          5: 'oklch(var(--chart-5) / <alpha-value>)',
        },
        sidebar: {
          DEFAULT: 'oklch(var(--sidebar) / <alpha-value>)',
          foreground: 'oklch(var(--sidebar-foreground) / <alpha-value>)',
          primary: 'oklch(var(--sidebar-primary) / <alpha-value>)',
          'primary-foreground': 'oklch(var(--sidebar-primary-foreground) / <alpha-value>)',
          accent: 'oklch(var(--sidebar-accent) / <alpha-value>)',
          'accent-foreground': 'oklch(var(--sidebar-accent-foreground) / <alpha-value>)',
          border: 'oklch(var(--sidebar-border) / <alpha-value>)',
          ring: 'oklch(var(--sidebar-ring) / <alpha-value>)',
        },
        console: 'oklch(var(--console-bg) / <alpha-value>)',
        log: {
          info:  'oklch(var(--log-info) / <alpha-value>)',
          warn:  'oklch(var(--log-warn) / <alpha-value>)',
          error: 'oklch(var(--log-error) / <alpha-value>)',
          cmd:   'oklch(var(--log-cmd) / <alpha-value>)',
          chat:  'oklch(var(--log-chat) / <alpha-value>)',
          muted: 'oklch(var(--log-muted) / <alpha-value>)',
        },
      },
      spacing: {
        sidebar: '220px',
        'sidebar-collapsed': '48px',
      },
      borderRadius: {
        lg: 'var(--radius-lg)',
        md: 'var(--radius-md)',
        sm: 'var(--radius-sm)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
      },
      // Role scale, raised one step. `label` and `title` are named for their job
      // rather than their size: every tracked uppercase instrument label in the
      // app is `text-label` (12px floor) and every card/panel header is
      // `text-title`, so neither can drift back into a per-site arbitrary value.
      fontSize: {
        label: ['12px',   { lineHeight: '1.35' }],
        xs:    ['12px',   { lineHeight: '1.45' }],
        sm:    ['13px',   { lineHeight: '1.5'  }],
        base:  ['14px',   { lineHeight: '1.55' }],
        md:    ['15px',   { lineHeight: '1.5'  }],
        title: ['16px',   { lineHeight: '1.3'  }],
        lg:    ['17px',   { lineHeight: '1.4'  }],
        xl:    ['21px',   { lineHeight: '1.3'  }],
        '2xl': ['32px',   { lineHeight: '1.15' }],
        '3xl': ['38px',   { lineHeight: '1.1'  }],
      },
      letterSpacing: {
        tight:   '-0.011em',
        tightest:'-0.02em',
        wide:    '0.04em',
        wider:   '0.06em',
        widest:  '0.1em',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(1)', opacity: '0.8' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.18s ease-out',
        'pulse-ring': 'pulse-ring 1.4s ease-out infinite',
        shimmer: 'shimmer 2.5s linear infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
