import { NextResponse } from "next/server";
import { getHaulers } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const haulers = await getHaulers();
    return NextResponse.json(haulers);
  } catch (error) {
    console.error("GET /api/haulers error:", error);
    return NextResponse.json({ error: "Failed to fetch haulers" }, { status: 500 });
  }
}
