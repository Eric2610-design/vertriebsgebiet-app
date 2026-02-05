import "leaflet/dist/leaflet.css";
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Händlerkarte",
  description: "Dealer Tool",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
