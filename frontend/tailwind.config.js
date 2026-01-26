/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Moveify Brand Colors
        moveify: {
          teal: '#46c1c0',      // Primary brand color
          'teal-light': '#5ed4d3',
          'teal-dark': '#3aa9a8',
          navy: '#132232',      // Secondary dark color
          'navy-light': '#1f3548',
          ocean: '#045e62',     // Accent teal-blue
          'ocean-light': '#056f74',
        },
        // Semantic color mappings
        primary: {
          50: '#e6f7f7',
          100: '#b3e7e6',
          200: '#80d7d5',
          300: '#4dc7c4',
          400: '#46c1c0',  // Main
          500: '#3aa9a8',
          600: '#2e8786',
          700: '#226564',
          800: '#164342',
          900: '#0a2120',
        },
        secondary: {
          50: '#e8eaed',
          100: '#b8bec6',
          200: '#88929f',
          300: '#586678',
          400: '#283a51',
          500: '#132232',  // Main
          600: '#0f1b28',
          700: '#0b141e',
          800: '#070d14',
          900: '#03060a',
        },
      },
    },
  },
  plugins: [],
}
