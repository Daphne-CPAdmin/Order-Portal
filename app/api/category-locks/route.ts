import { NextRequest, NextResponse } from "next/server";
import { getCategoryLocks, setCategoryLock } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const batchId = req.nextUrl.searchParams.get("batch");
    if (!batchId) return NextResponse.json({});
    const locks = await getCategoryLocks(batchId);
    return NextResponse.json(locks);
  } catch {
    return NextResponse.json({}, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { batchId, category, locked } = await req.json();
    if (!batchId || !category || locked === undefined) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    await setCategoryLock(batchId, category, locked);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update lock" }, { status: 500 });
  }
}
