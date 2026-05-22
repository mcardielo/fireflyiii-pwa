/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './js/*.js'],
  theme: {
    extend: {
      colors: {
        'ios-bg': '#f2f3f7',
        'ios-separator': '#e5e5ea',
        'ios-gray': '#8e8e93',
        'ios-gray-light': '#c7c7cc',
        'ios-text': '#1c1c1e',
        'ios-blue': '#5856D6',
        'ios-green': '#34c759',
        'ios-orange': '#ff9500',
        'ios-red': '#ff3b30',
        'ios-white': '#ffffff',
        'ios-blue-bg': '#e8e7ff',
        'ios-green-bg': '#e8f8ee',
        'tab-bar-bg': 'rgba(242, 243, 247, 0.94)',
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
