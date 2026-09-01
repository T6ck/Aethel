/** CORE section 9 palette, verbatim. No value here is invented. */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        obsidian:  '#050505',
        graphite:  '#0B0B0D',
        elevated:  '#111114',
        raised:    '#17171B',
        line:      '#1A1A1F',
        line2:     '#26262C',
        soft:      '#F5F5F2',
        secondary: '#8A8A8F',
        muted:     '#4A4A4F',
        healthy:   '#3ECF8E',
        attention: '#E0A33E',
        critical:  '#E56A5A',
      },
      fontFamily: {
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        sans:  ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono:  ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
