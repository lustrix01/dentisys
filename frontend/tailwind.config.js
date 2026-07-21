/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // BU College of Dental Medicine – Bright Green primary (laurel wreath)
        clinical: {
          50: '#f1faf2',
          100: '#e1f5e4',
          200: '#c2ebc9',
          300: '#94dba1',
          400: '#5fc471',
          500: '#43A047', // Clean, bright green matching laurel wreath
          600: '#338037',
          700: '#27612a',
          800: '#1e4b21',
          900: '#143317',
          950: '#0a1a0b',
        },
        // Lavender / Light Purple accent (from logo outer petals)
        accent: {
          50: '#f6f3fc',
          100: '#ede7f7',
          200: '#dbcfef',
          300: '#c4b0e4',
          400: '#aa8dd3',
          500: '#9B72CF', // Light purple from logo ring/petals
          600: '#7e57b3',
          700: '#644196',
          800: '#4a2f71',
          900: '#321f4e',
          955: '#25163b',
          950: '#1a102c',
        },
        // Sage / Secondary Green (from logo hills/details)
        sage: {
          50: '#f6f9f0',
          100: '#ecf3dd',
          200: '#d7e7bb',
          300: '#bad690',
          400: '#9bc065',
          500: '#7CB518', // Grassy sage accent
          600: '#639210',
          700: '#4a6f0a',
          800: '#344f05',
          900: '#213302',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['Outfit', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
