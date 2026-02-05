import "./globals.css";
import Link from "next/link";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <div style={{background:"#ffffff", borderBottom:"1px solid #e2e8f0"}}>
          <div className="container" style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:12}}>
            <div style={{display:"flex", alignItems:"center", gap:10}}>
              <div style={{width:34,height:34,borderRadius:12,background:"#0ea5e9"}} />
              <div>
                <div style={{fontWeight:900}}>Händlerkarte</div>
                <div className="small">Import · Dubletten · Karte · AD</div>
              </div>
            </div>
            <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
              <Link href="/import" className="btn">Import</Link>
              <Link href="/cleanup" className="btn">Cleanup</Link>
              <Link href="/map" className="btn primary">Karte</Link>
              <Link href="/admin" className="btn">Admin</Link>
            </div>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
