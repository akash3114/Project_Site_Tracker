import type { Config } from "tailwindcss";

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
        // Linear-style field-ops console (v1, light ground for tablet legibility)
        ground: "#F4F5F7",
        surface: "#FFFFFF",
        surfacequiet: "#FAFBFC",
        sidebar: "#0E121B",
        linear: "#5E6AD2",
        ink: "#17222C",
        secondaryink: "#5C6F7E",
        mutedink: "#8A97A3",
        hairline: "rgba(23,34,44,0.08)",
        navy: "#0E121B",
        steel: "#5E6AD2",
        pstbg: "#F4F5F7",
        pstborder: "rgba(23,34,44,0.08)",
        pstmuted: "#5C6F7E",
        cta: "#5E6AD2",
        todo: "#64748B",
        inprogress: "#5E6AD2",
        overdue: "#DC2626",
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
  plugins: [require("tailwindcss-animate")],
};
export default config;
