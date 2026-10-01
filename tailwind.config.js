/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Palettes are CSS variables (src/index.css) so the theme can be swapped
      // without touching component classes.
      colors: Object.fromEntries(
        ['neutral', 'primary', 'success', 'warning', 'error'].map((name) => [
          name,
          Object.fromEntries(
            ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'].map(
              (shade) => [shade, `rgb(var(--c-${name}-${shade}) / <alpha-value>)`]
            )
          ),
        ])
      ),
      fontFamily: {
        sans: [
          'Noto Sans JP',
          'Hiragino Sans',
          'Hiragino Kaku Gothic ProN',
          'Yu Gothic',
          'Meiryo',
          'sans-serif',
        ],
        mono: ['Consolas', 'Monaco', 'Andale Mono', 'monospace'],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
    },
  },
  plugins: [],
};
