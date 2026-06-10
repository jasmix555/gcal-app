import type { Metadata, Viewport } from "next";
import Providers from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Team Calendar",
  description: "A shared team calendar with groups and event attribution",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="min-h-screen bg-white text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100"
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
