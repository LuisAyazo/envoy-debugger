import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";
import { Shield } from "lucide-react";

export const metadata: Metadata = {
  title: "Gateway Debugger | Univision",
  description: "Real-time debugging and observability for Univision Gateway",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* Subtle grid background */}
          <div className="grid-bg fixed inset-0 z-0 pointer-events-none" />

          {/* Global top bar */}
          <header className="relative z-20 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0">
            <div className="max-w-screen-2xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
              <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                  <Shield className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="font-semibold text-foreground text-sm">Gateway Debugger</span>
                <span className="hidden sm:inline text-muted-foreground text-xs">· Univision</span>
              </Link>

              <nav className="flex items-center gap-1">
                <NavItem href="/traces">Traces</NavItem>
                <NavItem href="/metrics">Metrics</NavItem>
                <NavItem href="/requests">Requests</NavItem>
              </nav>

              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Live</span>
                </div>
                <ThemeToggle />
              </div>
            </div>
          </header>

          <div className="relative z-10">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}

function NavItem({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors font-medium"
    >
      {children}
    </Link>
  );
}
