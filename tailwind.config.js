/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './js/*.js'],
  theme: {
    extend: {
      colors: {
        'ios-bg': 'var(--ios-bg)',
        'ios-card': 'var(--ios-card)',
        'ios-text': 'var(--ios-text)',
        'ios-text-secondary': 'var(--ios-text-secondary)',
        'ios-text-tertiary': 'var(--ios-text-tertiary)',
        'ios-separator': 'var(--ios-separator)',
        'ios-tab-border': 'var(--ios-tab-border)',
        'ios-nav-bg': 'var(--ios-nav-bg)',
        'ios-tab-bg': 'var(--ios-tab-bg)',
        'ios-blue': '#5856D6',
        'ios-blue-bg': 'var(--ios-blue-bg)',
        'ios-green': '#34c759',
        'ios-green-bg': 'var(--ios-green-bg)',
        'ios-orange': '#ff9500',
        'ios-orange-bg': 'var(--ios-orange-bg)',
        'ios-red': '#ff3b30',
        'ios-lang-btn-bg': 'var(--ios-lang-btn-bg)',
        'ios-spinner-bg': 'var(--ios-spinner-bg)',
      },
      borderRadius: {
        'ios-sm': '7px',
        'ios': '9px',
        'ios-lg': '10px',
        'ios-xl': '12px',
        'ios-2xl': '14px',
      },
      boxShadow: {
        'ios-btn': '0 4px 12px rgba(88, 86, 214, 0.3)',
        'ios-dropdown': '0 4px 12px rgba(0,0,0,0.12)',
      },
      fontSize: {
        'ios-label': '13px',
        'ios-body': '15px',
        'ios-title': '17px',
        'ios-heading': '22px',
        'ios-hero': '28px',
      },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
        'safe-top': 'env(safe-area-inset-top, 0px)',
      },
    },
  },
  plugins: [],
};
