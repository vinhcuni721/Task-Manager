/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
      colors: {
        brand: {
          500: "var(--brand-500)",
          600: "var(--brand-600)",
        },
        secondary: "#0ea5e9",
        accent: "#f59e0b",
        success: "#10b981",
        danger: "#ef4444",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0, 0, 0, 0.10)",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: 0, transform: "translateY(4px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
        slideUp: {
          from: { opacity: 0, transform: "translateY(10px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fadeIn 220ms ease-out",
        "slide-up": "slideUp 220ms ease-out",
      },
    },
  },
  plugins: [],
};
