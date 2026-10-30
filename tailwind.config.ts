import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        // Forest-and-lime field operations palette.
        ground: "#F5F5EF",
        surface: "#FFFFFF",
        surfacequiet: "#FAFBFC",
        sidebar: "#102D27",
        linear: "#173B33",
        ink: "#1C2824",
        secondaryink: "#586760",
        mutedink: "#66756D",
        hairline: "#CDD6CE",
        navy: "#102D27",
        steel: "#173B33",
        pstbg: "#F5F5EF",
        pstborder: "#CDD6CE",
        pstmuted: "#586760",
        cta: "#173B33",
        todo: "#76867D",
        inprogress: "#347966",
        overdue: "#8F2824",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        heading: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        sans: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
        meta: ["var(--font-mono)", "monospace"],
      },
      borderRadius: {
        lg: "12px",
        md: "12px",
        sm: "6px",
        badge: "6px",
        input: "6px",
        card: "12px",
      },
      minHeight: {
        touch: "44px",
      },
      minWidth: {
        touch: "44px",
      },
      boxShadow: {
        panel: "0 1px 2px rgba(23,34,44,0.04)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
export default config;
