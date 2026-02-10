import { redirect } from "next/navigation";

export default function FixpriceRedirect() {
  redirect("/admin/pricing");
}
