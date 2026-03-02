import { NextRequest, NextResponse } from "next/server";
import { getOrders, getOrderItems, updateOrder, updateCategoryStatus } from "@/lib/sheets";
import { sendTelegram, buildPaymentNotificationMessage, buildCategoryPaymentMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const body = await req.json().catch(() => ({}));
    const category: string | undefined = body.category;

    const [orders, orderItems] = await Promise.all([getOrders(), getOrderItems(params.id)]);

    const order = orders.find((o) => o.id === params.id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (order.status === "cancelled") return NextResponse.json({ error: "Cannot pay a cancelled order" }, { status: 400 });

    if (category) {
      await updateCategoryStatus(params.id, category, "waiting");
      const catSubtotal = orderItems
        .filter((i) => i.category === category)
        .reduce((s, i) => s + i.qtyVials * i.pricePerVial, 0);
      await sendTelegram(
        buildCategoryPaymentMessage(params.id, order.customerName, order.telegramUsername, category, catSubtotal)
      );
    } else {
      const subtotal = orderItems.reduce((s, i) => s + i.qtyVials * i.pricePerVial, 0);
      await updateOrder(params.id, { status: "waiting" });
      await sendTelegram(
        buildPaymentNotificationMessage(params.id, order.customerName, order.telegramUsername, subtotal)
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`POST /api/orders/${params.id}/pay error:`, error);
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
  }
}
