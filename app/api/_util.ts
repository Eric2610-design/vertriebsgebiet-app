import { NextResponse } from "next/server";

export function ok(data: any, status = 200) {
  return NextResponse.json(data, { status });
}
export function bad(message: string, status = 400, extra?: any) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}
