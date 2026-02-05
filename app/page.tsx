import Link from "next/link";

export default function Home() {
  return (
    <main className="container">
      <div className="card" style={{padding:16}}>
        <div className="h1">Start</div>
        <p className="small" style={{marginTop:6}}>
          Upload → Dubletten/Filialen prüfen → Geocoding → Karte & Händlerseiten.
        </p>
        <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
          <Link className="btn primary" href="/import">Import starten</Link>
          <Link className="btn" href="/map">Zur Karte</Link>
          <Link className="btn" href="/cleanup">Cleanup (Dubletten)</Link>
        </div>
      </div>
    </main>
  );
}
