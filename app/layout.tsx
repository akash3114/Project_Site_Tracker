import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted latin variable fonts (app/fonts/) so `next build` never needs
// network access to Google Fonts — required for offline Docker builds.
const display = localFont({
  src: "./fonts/inter-tight-latin-wght.woff2",
  weight: "100 900",
  variable: "--font-display",
  display: "swap",
});

const body = localFont({
  src: "./fonts/inter-latin-wght.woff2",
  weight: "100 900",
  variable: "--font-body",
  display: "swap",
});

const mono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght.woff2",
  weight: "100 800",
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Project Site Tracker",
  description: "Track toll plaza site work across projects",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${display.variable} ${body.variable} ${mono.variable} font-body antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
