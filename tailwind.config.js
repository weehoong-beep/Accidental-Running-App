/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          950: '#0A0F1C',
          900: '#0F1526',
          800: '#151C31',
          700: '#1C2438'
        },
        accent: {
          purple: '#8B6BFF',
          teal: '#2DD4BF',
          coral: '#FF7A59',
          amber: '#FFB454'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      backgroundImage: {
        'accent-gradient': 'linear-gradient(135deg, #8B6BFF 0%, #2DD4BF 55%, #FF7A59 100%)',
        'coral-gradient': 'linear-gradient(135deg, #FF7A59 0%, #FFB454 100%)'
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(139,107,255,0.15), 0 8px 30px -8px rgba(139,107,255,0.35)',
        card: '0 4px 24px -8px rgba(0,0,0,0.5)'
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.75rem'
      }
    }
  },
  plugins: []
}
