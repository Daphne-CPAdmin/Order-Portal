import { NextRequest, NextResponse } from "next/server";
import { getOrders, getOrderItems } from "@/lib/sheets";

export const dynamic = "force-dynamic";

function normalizeTelegram(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

export async function GET(req: NextRequest) {
  const tg = req.nextUrl.searchParams.get("telegram");
  if (!tg) return NextResponse.json({ error: "telegram required" }, { status: 400 });

  const normalized = normalizeTelegram(tg);
  if (!normalized) return NextResponse.json({ error: "invalid telegram" }, { status: 400 });

  try {
    const [orders, allItems] = await Promise.all([getOrders(), getOrderItems()]);

    const customerOrders = orders.filter(
      (o) => normalizeTelegram(o.telegramUsername) === normalized
    );

    const result = customerOrders.map((order) => {
      const items = allItems
        .filter((i) => i.orderId === order.id)
        .map((i) => ({
          productName: i.productName,
          category: i.category,
          qtyVials: i.qtyVials,
          pricePerVial: i.pricePerVial,
          vialsPerKit: i.vialsPerKit,
          categoryStatus: i.categoryStatus || "pending",
          handlingFee: i.handlingFee || 0,
        }));
      const subtotal = items.reduce((s, i) => s + i.qtyVials * i.pricePerVial, 0);
      const handlingTotal = [...new Map(items.map((i) => [i.category, i.handlingFee])).values()]
        .reduce((s, v) => s + v, 0);
      return {
        id: order.id,
        customerName: order.customerName,
        telegramUsername: order.telegramUsername,
        orderDate: order.orderDate,
        status: order.status,
        batchId: order.batchId,
        items,
        subtotal,
        grandTotal: subtotal + handlingTotal,
      };
    });

    // Newest first
    result.sort((a, b) => Number(b.id) - Number(a.id));

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/orders/lookup error:", error);
    return NextResponse.json({ error: "Failed to look up orders" }, { status: 500 });
  }
}
