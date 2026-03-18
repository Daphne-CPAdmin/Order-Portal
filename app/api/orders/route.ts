import { NextRequest, NextResponse } from "next/server";
import { getOrders, createOrder, getOrderItems, getActiveBatch, findOrdersByTelegramInBatch, deleteOrder, getOrderingLocks } from "@/lib/sheets";
import { sendTelegram, buildNewOrderMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const batchId = req.nextUrl.searchParams.get("batch") ?? undefined;
    const [orders, allItems] = await Promise.all([
      getOrders(batchId),
      getOrderItems(undefined, batchId),
    ]);

    const KIT_CATEGORIES = new Set(["USP BAC", "SERUMS"]);

    // Compute kit-1 membership per product (non-cancelled orders only, sorted by date)
    const productAccumulator = new Map<string, Array<{orderId: string; qty: number; orderDate: string; vialsPerKit: number; category: string}>>();
    for (const order of orders) {
      if (order.status === "cancelled") continue;
      const items = allItems.filter((i) => i.orderId === order.id);
      for (const item of items) {
        if (item.qtyVials <= 0) continue;
        if (!KIT_CATEGORIES.has(item.category)) continue;
        if (!productAccumulator.has(item.productName)) productAccumulator.set(item.productName, []);
        productAccumulator.get(item.productName)!.push({
          orderId: order.id,
          qty: item.qtyVials,
          orderDate: order.orderDate,
          vialsPerKit: item.vialsPerKit,
          category: item.category,
        });
      }
    }

    const kit1Categories = new Map<string, Set<string>>();
    for (const entries of productAccumulator.values()) {
      entries.sort((a, b) => a.orderDate.localeCompare(b.orderDate));
      const vialsPerKit = entries[0]?.vialsPerKit || 1;
      let cumSum = 0;
      for (const entry of entries) {
        const prevCum = cumSum;
        cumSum += entry.qty;
        if (prevCum < vialsPerKit) {
          if (!kit1Categories.has(entry.orderId)) kit1Categories.set(entry.orderId, new Set());
          kit1Categories.get(entry.orderId)!.add(entry.category);
        }
      }
    }

    const ordersWithItems = orders.map((order) => {
      const items = allItems.filter((i) => i.orderId === order.id);
      const categories = new Set(items.map((i) => i.category));
      const subtotal = items.reduce((sum, i) => sum + i.qtyVials * i.pricePerVial, 0);
      return {
        ...order,
        items,
        categories: [...categories],
        totalVials: items.reduce((sum, i) => sum + i.qtyVials, 0),
        subtotal,
        firstKitCategories: [...(kit1Categories.get(order.id) || [])],
      };
    });

    return NextResponse.json(ordersWithItems);
  } catch (error) {
    console.error("GET /api/orders error:", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { customerName, telegramUsername, items, batchId, handlingByCat, grandTotal } = body;

    if (!customerName || !telegramUsername) {
      return NextResponse.json(
        { error: "Customer name and Telegram username are required" },
        { status: 400 }
      );
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
    }

    // handlingByCat must come from the frontend (already computed there)
    const handlingMap: Record<string, number> = handlingByCat || {};
    const total: number = grandTotal ?? 0;

    // Determine effective batch for upsert check
    let effectiveBatchId: string = batchId || "";
    if (!effectiveBatchId) {
      const activeBatch = await getActiveBatch();
      effectiveBatchId = activeBatch?.id || "";
    }

    // Check ordering locks — reject if any ordered category is locked
    if (effectiveBatchId) {
      const orderingLocks = await getOrderingLocks(effectiveBatchId);
      const orderedCategories: string[] = [...new Set<string>(items.map((i: { category: string }) => i.category))];
      const lockedCategories = orderedCategories.filter((cat) => orderingLocks[cat]);
      if (lockedCategories.length > 0) {
        return NextResponse.json(
          { error: `Ordering is currently closed for: ${lockedCategories.join(", ")}. Please contact the haul admin.` },
          { status: 403 }
        );
      }
    }

    // Upsert: delete any existing order for this customer in this batch
    let isUpdate = false;
    if (effectiveBatchId) {
      const existingIds = await findOrdersByTelegramInBatch(telegramUsername, effectiveBatchId);
      if (existingIds.length > 0) {
        // Block update if existing order is locked (payment pending or confirmed)
        const existingOrders = await getOrders(effectiveBatchId);
        const lockedOrder = existingOrders.find(
          (o) => existingIds.includes(o.id) && o.status !== "pending"
        );
        if (lockedOrder) {
          return NextResponse.json(
            {
              error:
                lockedOrder.status === "waiting"
                  ? "Your order is locked — payment is under review. Contact the haul admin to make changes."
                  : "Your order cannot be updated at this stage. Please contact the haul admin.",
            },
            { status: 403 }
          );
        }
        for (const id of existingIds) {
          await deleteOrder(id);
        }
        isUpdate = true;
      }
    }

    const orderId = await createOrder(
      {
        customerName,
        telegramUsername,
        orderDate: new Date().toISOString(),
        status: "pending",
        batchId: effectiveBatchId,
      },
      items,
      { handlingByCat: handlingMap, grandTotal: total }
    );

    sendTelegram(
      buildNewOrderMessage(orderId, customerName, telegramUsername, items, handlingMap, total, isUpdate)
    );

    return NextResponse.json({ orderId, isUpdate }, { status: 201 });
  } catch (error) {
    console.error("POST /api/orders error:", error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}
