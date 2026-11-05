import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#090514",
        surface: "#0D071E",
        card: "rgba(22, 13, 46, 0.6)",
        border: "rgba(168, 85, 247, 0.2)",
        neon: {
          primary: "#D8B4FE",
          electric: "#A855F7",
          intense: "#7C3AED",
          soft: "#C084FC",
          muted: "#C8A2C8",
        },
      },
      backgroundImage: {
        "noise": "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E\")",
      },
      boxShadow: {
        "volumetric": "0 0 25px -5px rgba(168, 85, 247, 0.4)",
        "volumetric-strong": "0 0 40px -10px rgba(168, 85, 247, 0.6)",
        "neon-glow": "0 0 15px rgba(168, 85, 247, 0.35)",
      },
      backdropBlur: {
        xs: "2px",
      },
      animation: {
        "pulse-neon": "pulse-neon 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "float": "float 6s ease-in-out infinite",
      },
      keyframes: {
        "pulse-neon": {
          "0%, 100%": { boxShadow: "0 0 15px rgba(168, 85, 247, 0.35)" },
          "50%": { boxShadow: "0 0 35px rgba(168, 85, 247, 0.7)" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
