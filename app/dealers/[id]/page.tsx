"use client";

import { useEffect, useState } from "react";
import { UploadedDealer } from "../../../components/UploadBox";

export default function DealerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [dealer, setDealer] = useState<UploadedDealer | null>(null);

  useEffect(() => {
    const data = (window as any).__DEALERS__ as UploadedDealer[] | undefined;
    if (!data) return;

    const found = data.find(
      (d) => d.id === Number(params.id)
    );
    setDealer(found ?? null);
  }, [params.id]);

  if (!dealer) {
    return (
      <main style={{ padding: 40 }}>
        <h1>Händler nicht gefunden</h1>
        <a href="/">← Zurück</a>
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
