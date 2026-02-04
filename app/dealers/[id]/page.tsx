import { notFound } from "next/navigation";

type Dealer = {
  id: number;
  name: string;
  street?: string;
  city?: string;
  phone?: string;
  email?: string;
};

async function getDealer(id: string): Promise<Dealer | null> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL}/api/dealers/${id}`,
    { cache: "no-store" }
  );

  if (!res.ok) return null;
  return res.json();
}

export default async function DealerPage({
  params,
}: {
  params: { id: string };
}) {
  const dealer = await getDealer(params.id);

  if (!dealer) notFound();

  return (
    <div style={{ padding: 24 }}>
      <h1>{dealer.name}</h1>

      <p>
        {dealer.street}
        <br />
        {dealer.city}
      </p>

      {dealer.phone && <p>📞 {dealer.phone}</p>}
      {dealer.email && <p>✉️ {dealer.email}</p>}
    </div>
  );
}
