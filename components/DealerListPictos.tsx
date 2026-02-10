import { Pictogram } from "@/components/Pictogram";

/**
 * UI-Regel: In allen Listen links Hersteller-Piktogramme, rechts Einkaufsverband (optional).
 */
export function DealerListPictos({
  manufacturerKeys,
  buyingGroupKey,
  size = 20,
  maxManufacturers = 3,
  className = "",
}: {
  manufacturerKeys?: string[] | null;
  buyingGroupKey?: string | null;
  size?: number;
  maxManufacturers?: number;
  className?: string;
}) {
  const keys = (manufacturerKeys ?? []).filter(Boolean);

  // Wichtig: Flyer soll nie aus Versehen durch andere Icons (z.B. Cube) ersetzt werden.
  // Daher sortieren wir die Hersteller-Keys stabil mit einer kleinen Prioritätenliste.
  const PREF = ["flyer", "riese_mueller", "bergamont", "kalkhoff", "ktm", "cube", "scott"];
  const prefIndex = (k: string) => {
    const i = PREF.indexOf(k);
    return i === -1 ? 999 : i;
  };

  const left = [...keys]
    .sort((a, b) => {
      const pa = prefIndex(a);
      const pb = prefIndex(b);
      if (pa !== pb) return pa - pb;
      return String(a).localeCompare(String(b), "de");
    })
    .slice(0, maxManufacturers);

  return (
    <div className={`flex items-center justify-between gap-2 ${className}`.trim()}>
      <div className="flex flex-wrap items-center gap-1">
        {left.map((k) => (
          <Pictogram key={k} kind="manufacturer" k={k} size={size} />
        ))}
        {keys.length > maxManufacturers ? (
          <span className="text-[10px] text-slate-500" title="Weitere Hersteller">…</span>
        ) : null}
      </div>
      {buyingGroupKey ? <Pictogram kind="buying_group" k={buyingGroupKey} size={size} /> : null}
    </div>
  );
}
