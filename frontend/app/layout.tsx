import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { AppNav } from "./components/app-nav";

const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "GrooveGraph",
  description: "Unified graph-first exploration for recorded music relationships",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={fontSans.variable}>
      <body className="min-h-screen font-sans antialiased">
        <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="text-lg font-semibold">
              GrooveGraph
            </Link>
            <AppNav isAdmin={false} />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pt-4 pb-8">{children}</main>
      </body>
    </html>
  );
}
