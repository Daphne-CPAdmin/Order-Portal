import { NextRequest, NextResponse } from "next/server";
import { getOrders, getOrderItems, getHaulers, updateHaulerTimestamp, getBatches } from "@/lib/sheets";
import { sendTelegramToChat, buildOrderReminderMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const [orders, items, haulers, batches] = await Promise.all([
      getOrders(),
      getOrderItems(params.id),
      getHaulers(),
      getBatches(),
    ]);

    const order = orders.find((o) => o.id === params.id);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const batchName = order.batchId
      ? (batches.find((b) => b.id === order.batchId)?.name || order.batchId)
      : "Current Haul";

    const normalized = order.telegramUsername.toLowerCase().replace(/^@/, "");
    const hauler = haulers.find((h) => h.telegramUsername === normalized);

    if (!hauler) {
      return NextResponse.json(
        { error: `@${normalized} not found in pephaulers sheet` },
        { status: 404 }
      );
    }

    const msg = buildOrderReminderMessage(
      order.id,
      order.customerName,
      items,
      order.grandTotal || 0,
      batchName
    );

    await sendTelegramToChat(hauler.chatId, msg);
    await updateHaulerTimestamp(hauler.rowNumber);

    return NextResponse.json({ success: true, sentTo: hauler.chatId });
  } catch (error) {
    console.error(`POST /api/orders/${params.id}/remind error:`, error);
    return NextResponse.json({ error: "Failed to send reminder" }, { status: 500 });
  }
}
