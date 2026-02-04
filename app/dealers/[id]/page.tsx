"use client";

import { supabase } from "@/lib/supabaseClient";

function SetMasterButton({ dealerId }: { dealerId: number }) {
  const setMaster = async () => {
    const { error } = await supabase.rpc("set_master_dealer", {
      master_id: dealerId,
    });

    if (error) {
      alert("Fehler: " + error.message);
    } else {
      location.reload(); // simpel & sicher
    }
  };

  return (
    <button
      onClick={setMaster}
      style={{
        padding: "4px 10px",
        border: "1px solid #333",
        cursor: "pointer",
      }}
    >
      Als Master setzen
    </button>
  );
}

export default SetMasterButton;
