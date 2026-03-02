import { NextRequest, NextResponse } from "next/server";
import { updateProduct, deleteProduct } from "@/lib/sheets";

type Params = { params: { id: string } };

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const rowNumber = parseInt(params.id);
    if (isNaN(rowNumber)) {
      return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
    }

    const body = await req.json();
    await updateProduct(rowNumber, {
      category: body.category,
      productName: body.productName,
      pricePerKit: parseFloat(body.pricePerKit) || 0,
      pricePerVial: parseFloat(body.pricePerVial) || 0,
      vialsPerKit: parseInt(body.vialsPerKit) || 1,
      handlingFee: parseFloat(body.handlingFee) || 100,
      active: body.active !== false,
      useCase: body.useCase || "",
      productFunction: body.productFunction || "",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`PUT /api/products/${params.id} error:`, error);
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const rowNumber = parseInt(params.id);
    if (isNaN(rowNumber)) {
      return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
    }

    await deleteProduct(rowNumber);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`DELETE /api/products/${params.id} error:`, error);
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
