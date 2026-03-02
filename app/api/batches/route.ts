import { NextRequest, NextResponse } from "next/server";
import { getBatches, createBatch } from "@/lib/sheets";
import { getAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const batches = await getBatches();
    return NextResponse.json(batches);
  } catch (error) {
    console.error("GET /api/batches error:", error);
    return NextResponse.json({ error: "Failed to fetch batches" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { name } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
    const id = await createBatch(name.trim());
    return NextResponse.json({ id });
  } catch (error) {
    console.error("POST /api/batches error:", error);
    return NextResponse.json({ error: "Failed to create batch" }, { status: 500 });
  }
}
