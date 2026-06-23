/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#14130f",
        sidebar: "#17160f",
        panel: "#161510",
        surface: "#1a1912",
        "surface-raised": "#1c1b14",
        "surface-active": "#201e15",
        border: "#26241c",
        "border-strong": "#2e2c24",
        "border-accent": "#34311f",
        cream: "#ECE8DD",
        muted: "#807b6d",
        "muted-dark": "#6b6759",
        "muted-darker": "#5f5b4f",
        "text-secondary": "#9a9588",
        "text-body": "#cfcabb",
        "text-dim": "#a8a294",
        accent: "#DCD06A",
        "accent-muted": "#A8B36A",
        success: "#8FBF8A",
        danger: "#C97A6A",
        info: "#8AA8C8",
        warning: "#C8A45A",
      },
      fontFamily: {
        sans: ["Hanken Grotesk", "system-ui", "sans-serif"],
        serif: ["Newsreader", "Georgia", "serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        "nav-active": "inset 2px 0 0 #DCD06A",
      },
    },
  },
  plugins: [],
};
