import { clsx } from "clsx";
import { getBrandIcon } from "@/lib/brandIcons";

export function BrandLabel({
  manufacturerKey,
  label,
  size = 18,
  className,
}: {
  manufacturerKey?: string | null;
  label: string;
  size?: number;
  className?: string;
}) {
  const src = getBrandIcon({ key: manufacturerKey, label });
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      {src ? (
        <img
          src={src}
          alt={label}
          width={size}
          height={size}
          className="rounded-md bg-white object-contain"
          loading="lazy"
        />
      ) : (
        <span
          style={{ width: size, height: size }}
          className="rounded-md bg-slate-200"
          aria-hidden
        />
      )}
      <span className="text-sm">{label}</span>
    </span>
  );
}
