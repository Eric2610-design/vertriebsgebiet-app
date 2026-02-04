import "./globals.css";
import TopNav from "@/components/TopNav";

export const metadata = {
  title: "Vertriebsgebiet",
  description: "Händlerkarte, Upload, Dubletten & Geocoding",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <TopNav />
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
