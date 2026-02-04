import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse
) {
  const { data, error } = await supabase
    .from("dealers")
    .select("id, name, lat, lng");

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json(data ?? []);
}
