/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './projects/angular-starter/src/**/*.{html,ts}',
    './projects/bset-ai-ng/src/**/*.{html,ts}',
    './projects/ngx-twang-ui/src/**/*.{html,ts}',
    './projects/ngx-common/src/**/*.{html,ts}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  'rgb(var(--color-primary-50)  / <alpha-value>)',
          100: 'rgb(var(--color-primary-100) / <alpha-value>)',
          200: 'rgb(var(--color-primary-200) / <alpha-value>)',
          500: 'rgb(var(--color-primary-500) / <alpha-value>)',
          600: 'rgb(var(--color-primary-600) / <alpha-value>)',
          700: 'rgb(var(--color-primary-700) / <alpha-value>)',
          900: 'rgb(var(--color-primary-900) / <alpha-value>)',
        },
        secondary: {
          50:  'rgb(var(--color-secondary-50)  / <alpha-value>)',
          100: 'rgb(var(--color-secondary-100) / <alpha-value>)',
          200: 'rgb(var(--color-secondary-200) / <alpha-value>)',
          500: 'rgb(var(--color-secondary-500) / <alpha-value>)',
          600: 'rgb(var(--color-secondary-600) / <alpha-value>)',
        },
        accent: {
          50:  'rgb(var(--color-accent-50)  / <alpha-value>)',
          100: 'rgb(var(--color-accent-100) / <alpha-value>)',
          500: 'rgb(var(--color-accent-500) / <alpha-value>)',
          600: 'rgb(var(--color-accent-600) / <alpha-value>)',
        },
        danger: {
          50:  'rgb(var(--color-danger-50)  / <alpha-value>)',
          600: 'rgb(var(--color-danger-600) / <alpha-value>)',
        },
        border: 'rgb(var(--color-border) / <alpha-value>)',
        text: {
          DEFAULT: 'rgb(var(--color-text)      / <alpha-value>)',
          muted:   'rgb(var(--color-text-muted) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'rgb(var(--color-surface)      / <alpha-value>)',
          muted:   'rgb(var(--color-surface-muted) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
