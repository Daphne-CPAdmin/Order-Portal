import { NextRequest, NextResponse } from "next/server";
import { getProducts, addProduct } from "@/lib/sheets";

export async function GET() {
  try {
    const products = await getProducts();
    return NextResponse.json(products);
  } catch (error) {
    console.error("GET /api/products error:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { category, productName, pricePerKit, pricePerVial, vialsPerKit, handlingFee, active, useCase, productFunction } = body;

    if (!category || !productName) {
      return NextResponse.json(
        { error: "Category and product name are required" },
        { status: 400 }
      );
    }

    await addProduct({
      category,
      productName,
      pricePerKit: parseFloat(pricePerKit) || 0,
      pricePerVial: parseFloat(pricePerVial) || 0,
      vialsPerKit: parseInt(vialsPerKit) || 1,
      handlingFee: parseFloat(handlingFee) || 100,
      active: active !== false,
      useCase: useCase || "",
      productFunction: productFunction || "",
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("POST /api/products error:", error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}
