import dynamic from "next/dynamic";

const LeafletMap = dynamic(
  () => import("../components/LeafletMap"),
  { ssr: false }
);

export default function Page() {
  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <LeafletMap />
    </div>
  );
}
