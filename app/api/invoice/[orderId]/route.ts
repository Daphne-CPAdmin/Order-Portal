import { NextRequest, NextResponse } from "next/server";
import { getOrders, getOrderItems } from "@/lib/sheets";

export const dynamic = "force-dynamic";

type Params = { params: { orderId: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const [orders, items] = await Promise.all([
      getOrders(),
      getOrderItems(params.orderId),
    ]);

    const order = orders.find((o) => o.id === params.orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Group items by category
    const catMap = new Map<string, typeof items>();
    for (const item of items) {
      if (!catMap.has(item.category)) catMap.set(item.category, []);
      catMap.get(item.category)!.push(item);
    }

    const categoryGroups = Array.from(catMap.entries()).map(([category, catItems]) => ({
      category,
      items: catItems.map((i) => ({
        productName: i.productName,
        qtyVials: i.qtyVials,
        pricePerVial: i.pricePerVial,
        lineTotal: i.qtyVials * i.pricePerVial,
      })),
      handling: catItems[0]?.handlingFee || 0,
      subtotal: catItems.reduce((s, i) => s + i.qtyVials * i.pricePerVial, 0),
      categoryStatus: catItems[0]?.categoryStatus || "pending",
      paymentOpen: true, // always allow customers to notify admin of payment
    }));

    const subtotal = items.reduce((s, i) => s + i.qtyVials * i.pricePerVial, 0);
    const handlingTotal = categoryGroups.reduce((s, g) => s + g.handling, 0);

    return NextResponse.json({
      id: order.id,
      customerName: order.customerName,
      telegramUsername: order.telegramUsername,
      orderDate: order.orderDate,
      status: order.status,
      batchId: order.batchId,
      categoryGroups,
      subtotal,
      handlingTotal,
      grandTotal: order.grandTotal || subtotal + handlingTotal,
    });
  } catch (err) {
    console.error(`GET /api/invoice/${params.orderId} error:`, err);
    return NextResponse.json({ error: "Failed to fetch invoice" }, { status: 500 });
  }
}
