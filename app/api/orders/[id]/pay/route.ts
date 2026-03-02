import { NextRequest, NextResponse } from "next/server";
import { getOrders, getOrderItems, updateOrder } from "@/lib/sheets";
import { sendTelegram, buildPaymentNotificationMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const [orders, allItems] = await Promise.all([getOrders(), getOrderItems()]);

    const order = orders.find((o) => o.id === params.id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    if (order.status === "cancelled") {
      return NextResponse.json({ error: "Cannot pay a cancelled order" }, { status: 400 });
    }

    const orderItems = allItems.filter((i) => i.orderId === params.id);
    const subtotal = orderItems.reduce((s, i) => s + i.qtyVials * i.pricePerVial, 0);

    // Auto-lock: set status to "waiting" (order can no longer be modified by customer)
    await updateOrder(params.id, { status: "waiting" });

    await sendTelegram(
      buildPaymentNotificationMessage(params.id, order.customerName, order.telegramUsername, subtotal)
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`POST /api/orders/${params.id}/pay error:`, error);
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
  }
}
