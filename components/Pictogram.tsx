import Image from "next/image";
import { BUYING_GROUP_ICON_FALLBACK, MANUFACTURER_ICON_FALLBACK } from "@/lib/pictograms";

export function Pictogram({
  kind,
  k,
  label,
  dataUrl,
  // slightly larger default so pictograms are readable in lists/cards
  size = 24,
  className = "",
}: {
  kind: "manufacturer" | "buying_group";
  k: string;
  label?: string;
  dataUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const fallback = kind === "manufacturer" ? MANUFACTURER_ICON_FALLBACK[k] : BUYING_GROUP_ICON_FALLBACK[k];
  const src = dataUrl || fallback;

  if (!src) {
    return (
      <span
        title={label ?? k}
        className={`inline-block rounded-md bg-black/10 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      title={label ?? k}
      className={`inline-flex items-center justify-center rounded-md bg-white ${className}`}
      style={{ width: size, height: size }}
    >
      <Image src={src} alt={label ?? k} width={size} height={size} className="object-contain" />
    </span>
  );
}
