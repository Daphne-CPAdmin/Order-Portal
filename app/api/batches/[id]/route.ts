import { NextRequest, NextResponse } from "next/server";
import { updateBatch } from "@/lib/sheets";
import { getAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    await updateBatch(params.id, body);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`PUT /api/batches/${params.id} error:`, error);
    return NextResponse.json({ error: "Failed to update batch" }, { status: 500 });
  }
}
