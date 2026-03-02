import { NextResponse } from "next/server";
import { getActiveBatch } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const batch = await getActiveBatch();
    return NextResponse.json(batch);
  } catch {
    return NextResponse.json(null);
  }
}
