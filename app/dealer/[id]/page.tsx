import DealerClient from "./DealerClient";

export default async function DealerPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return <DealerClient id={id} />;
}
