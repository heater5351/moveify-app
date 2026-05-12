module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./index.html"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#46c1c0',
          light: {
            1: '#f8f9fa',
            5: '#e9ecef',
            10: '#dee2e6',
            12: '#ced4da'
          },
          dark: {
            1: '#212529',
            10: '#adb5bd',
            11: '#6c757d',
            12: '#495057'
          }
        },
        body: {
          light: {
            1: '#ffffff',
            10: '#adb5bd',
            11: '#6c757d',
            12: '#495057'
          },
          dark: {
            1: '#212529',
            10: '#adb5bd',
            11: '#6c757d',
            12: '#495057'
          }
        }
      },
      fontFamily: {
        sans: ['Poppins', 'sans-serif']
      }
    },
  },
  plugins: [],
}