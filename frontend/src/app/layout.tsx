import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>
        <div className="grid-bg fixed inset-0 z-0" />
        <div className="relative z-10">
          {children}
        </div>
      </body>
    </html>
  );
}
