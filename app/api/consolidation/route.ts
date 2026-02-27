import { NextResponse } from "next/server";
import { getConsolidationData } from "@/lib/sheets";

export async function GET() {
  try {
    const data = await getConsolidationData();
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/consolidation error:", error);
    return NextResponse.json({ error: "Failed to fetch consolidation data" }, { status: 500 });
  }
}
