export const dynamic = "force-dynamic";

import DealerClient from "./DealerClient";

export default function DealerPage({ params }: { params: { id: string } }) {
  // Übergabe als Prop (zusätzlich zu useParams im Client) => doppelt robust
  return <DealerClient id={params.id} />;
}
