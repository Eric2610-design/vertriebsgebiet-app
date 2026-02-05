import RepClient from "./RepClient";

export default async function RepPage({ params }: { params: Promise<{ email: string }> }) {
  const p = await params;
  return <RepClient email={decodeURIComponent(p.email)} />;
}
