import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        "serif-display": ["var(--font-instrument-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      height: {
        screen: "var(--arbor-screen-h)",
      },
      minHeight: {
        screen: "var(--arbor-screen-h)",
      },
      width: {
        screen: "var(--arbor-screen-w)",
      },
    },
  },
  plugins: [],
};

export default config;
