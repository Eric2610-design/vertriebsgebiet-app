import { clsx } from "clsx";

export function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={clsx("rounded-2xl bg-white shadow-soft border border-slate-100", props.className)} />;
}
export function CardHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={clsx("px-5 pt-5", props.className)} />;
}
export function CardContent(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={clsx("px-5 pb-5", props.className)} />;
}
export function Button({ variant="primary", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {variant?: "primary"|"secondary"|"danger"}) {
  const base="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition border";
  const styles = variant==="primary"
    ? "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
    : variant==="danger"
    ? "bg-rose-600 text-white border-rose-600 hover:bg-rose-500"
    : "bg-white text-slate-900 border-slate-200 hover:bg-slate-50";
  return <button {...props} className={clsx(base, styles, props.className)} />;
}
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx("w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300", props.className)} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx("w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300", props.className)} />;
}
export function Badge({ tone="slate", ...props }: React.HTMLAttributes<HTMLSpanElement> & {tone?: "slate"|"blue"|"emerald"|"amber"|"rose"}) {
  const t = {
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-100 text-blue-700",
    emerald:"bg-emerald-100 text-emerald-700",
    amber:"bg-amber-100 text-amber-800",
    rose:"bg-rose-100 text-rose-700",
  }[tone];
  return <span {...props} className={clsx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", t, props.className)} />;
}
