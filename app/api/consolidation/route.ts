import { NextRequest, NextResponse } from "next/server";
import { getConsolidationData } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const batchId = req.nextUrl.searchParams.get("batch") ?? undefined;
    const data = await getConsolidationData(batchId);
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/consolidation error:", error);
    return NextResponse.json({ error: "Failed to fetch consolidation data" }, { status: 500 });
  }
}
