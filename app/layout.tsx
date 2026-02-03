import "leaflet/dist/leaflet.css";
import "./globals.css";
import React from "react";

export const metadata = {
  title: "Vertriebsgebiet – Import & Merge",
  description: "Upload, Mapping und Duplikat-Vorschläge",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <div className="container">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:14,flexWrap:"wrap"}}>
            <div>
              <div style={{fontWeight:800, fontSize:18}}>Vertriebsgebiet</div>
              <small>Upload → Mapping → Merge-Vorschläge</small>
            </div>
            <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
              <a className="btn secondary" href="/app">Dashboard</a>
              <a className="btn secondary" href="/app/map">Karte</a>
              <a className="btn secondary" href="/login">Login</a>
            </div>
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
