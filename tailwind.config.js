/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#2563eb",
          dark: "#1d4ed8",
          soft: "#dbeafe",
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
