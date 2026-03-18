import { NextRequest, NextResponse } from "next/server";
import { getOrders, getOrderItems } from "@/lib/sheets";
import { OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export interface KitHauler {
  orderId: string;
  customerName: string;
  telegramUsername: string;
  orderDate: string;
  status: OrderStatus;
  qtyVials: number;
  slotStart: number; // 1-indexed within the product total
  slotEnd: number;
  kitSlotStart: number; // 1-indexed within this specific kit
  kitSlotEnd: number;
}

export interface Kit {
  kitNumber: number;
  capacity: number; // vialsPerKit
  filledVials: number;
  isFull: boolean;
  haulers: KitHauler[];
}

export interface ProductRoster {
  productName: string;
  category: string;
  vialsPerKit: number;
  totalVials: number;
  kits: Kit[];
}

export async function GET(req: NextRequest) {
  try {
    const batchId = req.nextUrl.searchParams.get("batch") ?? undefined;

    const [orders, allItems] = await Promise.all([
      getOrders(batchId),
      getOrderItems(undefined, batchId),
    ]);

    // Index order metadata
    const orderMeta = new Map(orders.map((o) => [o.id, o]));

    const KIT_CATEGORIES = new Set(["USP BAC", "SERUMS"]);

    // Group items by product, skip cancelled orders and non-kit categories
    const productItems = new Map<
      string,
      Array<{
        orderId: string;
        customerName: string;
        telegramUsername: string;
        orderDate: string;
        status: OrderStatus;
        qtyVials: number;
        vialsPerKit: number;
        category: string;
        pricePerVial: number;
      }>
    >();

    for (const item of allItems) {
      if (item.qtyVials <= 0) continue;
      const order = orderMeta.get(item.orderId);
      if (!order || order.status === "cancelled") continue;
      if (!KIT_CATEGORIES.has(item.category)) continue;

      if (!productItems.has(item.productName)) productItems.set(item.productName, []);
      productItems.get(item.productName)!.push({
        orderId: item.orderId,
        customerName: order.customerName,
        telegramUsername: order.telegramUsername,
        orderDate: order.orderDate,
        status: order.status,
        qtyVials: item.qtyVials,
        vialsPerKit: item.vialsPerKit,
        category: item.category,
        pricePerVial: item.pricePerVial,
      });
    }

    // Build roster per product
    const rosters: ProductRoster[] = [];

    for (const [productName, entries] of productItems.entries()) {
      // Sort by order date ascending (earliest = reserved first)
      entries.sort((a, b) => a.orderDate.localeCompare(b.orderDate));

      const vialsPerKit = entries[0]?.vialsPerKit || 1;
      const category = entries[0]?.category || "";
      const totalVials = entries.reduce((s, e) => s + e.qtyVials, 0);

      // Build kits
      const kitsMap = new Map<number, Kit>();
      let cumulative = 0;

      for (const entry of entries) {
        const slotStart = cumulative + 1;
        const slotEnd = cumulative + entry.qtyVials;

        // An order can span a kit boundary — split across kits
        let remaining = entry.qtyVials;
        let pos = cumulative; // 0-indexed

        while (remaining > 0) {
          const kitNumber = Math.floor(pos / vialsPerKit) + 1;
          const kitOffset = pos % vialsPerKit; // 0-indexed within kit
          const slotsAvailableInKit = vialsPerKit - kitOffset;
          const takenInThisKit = Math.min(remaining, slotsAvailableInKit);

          if (!kitsMap.has(kitNumber)) {
            kitsMap.set(kitNumber, {
              kitNumber,
              capacity: vialsPerKit,
              filledVials: 0,
              isFull: false,
              haulers: [],
            });
          }
          const kit = kitsMap.get(kitNumber)!;
          kit.filledVials += takenInThisKit;
          kit.haulers.push({
            orderId: entry.orderId,
            customerName: entry.customerName,
            telegramUsername: entry.telegramUsername,
            orderDate: entry.orderDate,
            status: entry.status,
            qtyVials: takenInThisKit, // vials in THIS kit
            slotStart,
            slotEnd,
            kitSlotStart: kitOffset + 1,
            kitSlotEnd: kitOffset + takenInThisKit,
          });

          pos += takenInThisKit;
          remaining -= takenInThisKit;
        }

        cumulative = slotEnd;
      }

      // Finalize kits
      const kits: Kit[] = [...kitsMap.values()]
        .sort((a, b) => a.kitNumber - b.kitNumber)
        .map((k) => ({ ...k, isFull: k.filledVials >= vialsPerKit }));

      rosters.push({ productName, category, vialsPerKit, totalVials, kits });
    }

    // Sort rosters by category then product name
    rosters.sort((a, b) => a.category.localeCompare(b.category) || a.productName.localeCompare(b.productName));

    return NextResponse.json(rosters);
  } catch (error) {
    console.error("GET /api/kit-roster error:", error);
    return NextResponse.json({ error: "Failed to fetch kit roster" }, { status: 500 });
  }
}
