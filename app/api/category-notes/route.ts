import { NextRequest, NextResponse } from "next/server";
import { getCategoryNotes, updateCategoryNote } from "@/lib/sheets";
import { getAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const notes = await getCategoryNotes();
    return NextResponse.json(notes);
  } catch (error) {
    console.error("GET /api/category-notes error:", error);
    return NextResponse.json({});
  }
}

export async function PUT(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { category, note } = await req.json();
    if (!category) return NextResponse.json({ error: "Category required" }, { status: 400 });
    await updateCategoryNote(category, note || "");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /api/category-notes error:", error);
    return NextResponse.json({ error: "Failed to update note" }, { status: 500 });
  }
}
