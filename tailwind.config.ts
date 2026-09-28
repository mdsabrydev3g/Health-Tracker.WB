import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef7ff",
          100: "#d9edff",
          200: "#bce0ff",
          300: "#8ecdff",
          400: "#59b0ff",
          500: "#338ffb",
          600: "#1d70f1",
          700: "#1659df",
          800: "#1849b4",
          900: "#19408e",
        },
      },
      fontFamily: {
        sans: ["var(--font-app)", "system-ui", "sans-serif"],
      },
      // Mother Mode is the default-large mode: nothing below these sizes on her device.
      fontSize: {
        "mother-body": ["20px", "1.7"],
        "mother-title": ["28px", "1.4"],
        "mother-giant": ["40px", "1.2"],
      },
      minHeight: {
        touch: "48px",
        "touch-lg": "64px",
      },
      minWidth: {
        touch: "48px",
      },
    },
  },
  plugins: [],
};

export default config;
