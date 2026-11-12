import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Casa 218 · Food cost",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-surface-sunken text-ink antialiased">{children}</body>
    </html>
  );
}
