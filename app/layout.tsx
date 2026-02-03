import "./globals.css";

export const metadata = {
  title: "Vertriebsgebiet",
  description: "Upload, Mapping und Duplikat-Vorschläge",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}

