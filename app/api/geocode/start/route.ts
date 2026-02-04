import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ ok: true, test: "start route works" });
}
