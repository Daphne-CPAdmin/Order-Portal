import { NextRequest, NextResponse } from "next/server";
import { updateCategoryStatus } from "@/lib/sheets";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { category, status } = await req.json();
    if (!category || !status) {
      return NextResponse.json({ error: "category and status required" }, { status: 400 });
    }
    await updateCategoryStatus(params.id, category, status);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`PUT /api/orders/${params.id}/category-status error:`, error);
    return NextResponse.json({ error: "Failed to update category status" }, { status: 500 });
  }
}
