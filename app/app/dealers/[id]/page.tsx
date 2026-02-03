// app/app/dealers/[id]/page.tsx
export const dynamic = "force-dynamic";

import DealerClient from "./DealerClient";

export default function DealerPage({ params }: { params: { id: string } }) {
  return <DealerClient dealerId={params.id} />;
}
