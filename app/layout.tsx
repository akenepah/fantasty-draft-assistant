import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { AppStateProvider } from "@/components/AppStateProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fantasy Hockey Draft Assistant",
  description:
    "Manual-first fantasy hockey draft assistant — league setup, imported analyst projections, live pick recording and post-draft analysis.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f8fa",
};

/**
 * The provider wraps every route, so all five destinations share one league,
 * one draft and one player pool. A pick recorded in the Draft Room is
 * immediately true everywhere else.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AppStateProvider>
          <AppShell>{children}</AppShell>
        </AppStateProvider>
      </body>
    </html>
  );
}
