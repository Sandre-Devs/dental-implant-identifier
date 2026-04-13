export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50:'#f0fafa', 100:'#d0f0f0', 200:'#a0e0e0', 300:'#60c8c8',
          400:'#30b0b0', 500:'#01696f', 600:'#0c4e54', 700:'#0f3638',
          800:'#0a2426', 900:'#061518'
        }
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] }
    }
  },
  plugins: []
}
