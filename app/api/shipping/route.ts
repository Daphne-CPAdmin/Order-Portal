import { NextRequest, NextResponse } from "next/server";
import { getShippingDetails, upsertShippingDetails } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const telegram = req.nextUrl.searchParams.get("telegram");
  if (!telegram) return NextResponse.json({ error: "Missing telegram" }, { status: 400 });
  try {
    const details = await getShippingDetails(telegram);
    return NextResponse.json(details || null);
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const details = await req.json();
    await upsertShippingDetails(details);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
