import dynamic from "next/dynamic";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false });

export default function DashboardPage() {
  return (
    <div style={{ height: "100%", display: "flex" }}>
      <div style={{ flex: 1 }}>
        <LeafletMap />
      </div>
    </div>
  );
}