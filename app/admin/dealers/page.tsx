"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function HomePage() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from("dealers")
      .select("*", { count: "exact", head: true })
      .then(({ count, error }) => {
        if (error) {
          console.error(error);
        } else {
          setCount(count);
        }
      });
  }, []);

  return (
    <main style={{ padding: 40 }}>
      <h1>Supabase Test</h1>
      <p>Dealer in DB: {count ?? "lädt..."}</p>
    </main>
  );
}
