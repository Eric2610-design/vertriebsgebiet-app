import dynamic from "next/dynamic";

const DealerMapDynamic = dynamic(() => import("@/components/DealerMap"), {
  ssr: false,
});

export default DealerMapDynamic;
