import { NextRequest, NextResponse } from "next/server";
import { getOrders, getOrderItems, getHaulers, updateHaulerTimestamp, getBatches } from "@/lib/sheets";
import { sendTelegramToChat, buildOrderReminderMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { batchId, statuses } = await req.json();
    const allowedStatuses: string[] = statuses || ["pending", "confirmed"];

    const [orders, allItems, haulers, batches] = await Promise.all([
      getOrders(batchId || undefined),
      getOrderItems(undefined, batchId || undefined),
      getHaulers(),
      getBatches(),
    ]);

    const batchName = batchId
      ? (batches.find((b) => b.id === batchId)?.name || batchId)
      : "Current Haul";

    // Lookup hauler by normalised telegram username
    const haulerMap = new Map(haulers.map((h) => [h.telegramUsername, h]));

    const targetOrders = orders.filter((o) => allowedStatuses.includes(o.status));

    const results: { telegram: string; name: string; sent: boolean; reason?: string }[] = [];

    for (const order of targetOrders) {
      const normalized = order.telegramUsername.toLowerCase().replace(/^@/, "");
      const hauler = haulerMap.get(normalized);
      const items = allItems.filter((i) => i.orderId === order.id);

      if (!hauler) {
        results.push({
          telegram: order.telegramUsername,
          name: order.customerName,
          sent: false,
          reason: "not in pephaulers",
        });
        continue;
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

      results.push({ telegram: order.telegramUsername, name: order.customerName, sent: true });
    }

    return NextResponse.json({ results, total: targetOrders.length });
  } catch (error) {
    console.error("POST /api/reminders error:", error);
    return NextResponse.json({ error: "Failed to send reminders" }, { status: 500 });
  }
}
