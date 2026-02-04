import { dealers } from "../../../lib/dealers";

type Props = {
  params: { id: string };
};

export default function DealerDetailPage({ params }: Props) {
  const dealer = dealers.find(
    (d) => d.id === Number(params.id)
  );

  if (!dealer) {
    return (
      <main style={{ padding: 40 }}>
        <h1>Händler nicht gefunden</h1>
        <a href="/">← Zurück zur Karte</a>
      </main>
    );
  }

  return (
    <main style={{ padding: 40 }}>
      <h1>{dealer.name}</h1>

      <p>
        {dealer.street}
        <br />
        {dealer.city}
      </p>

      {dealer.phone && <p>📞 {dealer.phone}</p>}
      {dealer.email && <p>✉️ {dealer.email}</p>}

      <br />
      <a href="/">← Zurück zur Karte</a>
    </main>
  );
}
