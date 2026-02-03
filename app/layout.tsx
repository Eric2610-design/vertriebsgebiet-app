import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata = {
  title: "Vertriebsgebiet",
  description: "Händlerkarte & Upload",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <Navbar />
        <main style={{ height: "calc(100vh - 56px)" }}>
          {children}
        </main>
      </body>
    </html>
  );
}