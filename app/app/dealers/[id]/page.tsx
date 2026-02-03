export const dynamic = "force-dynamic";

export default function DealerPage({ params }: { params: { id: string } }) {
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Händler-Detail</h2>
      <p>Route funktioniert ✅</p>
      <p>ID: <code>{params.id}</code></p>
      <a className="btn secondary" href="/app/map">Zur Karte</a>
    </div>
  );
}
