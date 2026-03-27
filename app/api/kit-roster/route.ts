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

export interface CategoryItem {
  productName: string;
  qtyVials: number;
  pricePerVial: number;
  categoryStatus?: string;
}

export interface CategoryCustomer {
  orderId: string;
  customerName: string;
  telegramUsername: string;
  orderDate: string;
  status: OrderStatus;
  items: CategoryItem[];
  totalQty: number;
  subtotal: number;
}

export interface CategoryRoster {
  category: string;
  customers: CategoryCustomer[];
  totalCustomers: number;
  totalQty: number;
  totalSubtotal: number;
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

    // ── Kit-based rosters (USP BAC, SERUMS) ─────────────────────────────────

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

    const rosters: ProductRoster[] = [];

    for (const [productName, entries] of productItems.entries()) {
      entries.sort((a, b) => a.orderDate.localeCompare(b.orderDate));

      const vialsPerKit = entries[0]?.vialsPerKit || 1;
      const category = entries[0]?.category || "";
      const totalVials = entries.reduce((s, e) => s + e.qtyVials, 0);

      const kitsMap = new Map<number, Kit>();
      let cumulative = 0;

      for (const entry of entries) {
        const slotStart = cumulative + 1;
        const slotEnd = cumulative + entry.qtyVials;

        let remaining = entry.qtyVials;
        let pos = cumulative;

        while (remaining > 0) {
          const kitNumber = Math.floor(pos / vialsPerKit) + 1;
          const kitOffset = pos % vialsPerKit;
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
            qtyVials: takenInThisKit,
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

      const kits: Kit[] = [...kitsMap.values()]
        .sort((a, b) => a.kitNumber - b.kitNumber)
        .map((k) => ({ ...k, isFull: k.filledVials >= vialsPerKit }));

      rosters.push({ productName, category, vialsPerKit, totalVials, kits });
    }

    rosters.sort((a, b) => a.category.localeCompare(b.category) || a.productName.localeCompare(b.productName));

    // ── Category customer breakdown (all categories) ─────────────────────────

    // Group items by category → order
    const categoryOrderItems = new Map<string, Map<string, CategoryItem[]>>();

    for (const item of allItems) {
      if (item.qtyVials <= 0) continue;
      const order = orderMeta.get(item.orderId);
      if (!order || order.status === "cancelled") continue;

      if (!categoryOrderItems.has(item.category)) {
        categoryOrderItems.set(item.category, new Map());
      }
      const orderMap = categoryOrderItems.get(item.category)!;
      if (!orderMap.has(item.orderId)) orderMap.set(item.orderId, []);
      orderMap.get(item.orderId)!.push({
        productName: item.productName,
        qtyVials: item.qtyVials,
        pricePerVial: item.pricePerVial,
        categoryStatus: item.categoryStatus,
      });
    }

    const CATEGORY_ORDER = ["USP BAC", "SERUMS", "PENS", "COSMETICS", "TOPICAL RAWS"];

    const categoryRosters: CategoryRoster[] = [];

    for (const [category, orderMap] of categoryOrderItems.entries()) {
      const customers: CategoryCustomer[] = [];

      for (const [orderId, items] of orderMap.entries()) {
        const order = orderMeta.get(orderId)!;
        const totalQty = items.reduce((s, i) => s + i.qtyVials, 0);
        const subtotal = items.reduce((s, i) => s + i.qtyVials * i.pricePerVial, 0);
        customers.push({
          orderId,
          customerName: order.customerName,
          telegramUsername: order.telegramUsername,
          orderDate: order.orderDate,
          status: order.status,
          items,
          totalQty,
          subtotal,
        });
      }

      // Sort customers by order date
      customers.sort((a, b) => a.orderDate.localeCompare(b.orderDate));

      const totalCustomers = customers.length;
      const totalQty = customers.reduce((s, c) => s + c.totalQty, 0);
      const totalSubtotal = customers.reduce((s, c) => s + c.subtotal, 0);

      categoryRosters.push({ category, customers, totalCustomers, totalQty, totalSubtotal });
    }

    // Sort by canonical category order
    categoryRosters.sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a.category);
      const bi = CATEGORY_ORDER.indexOf(b.category);
      if (ai === -1 && bi === -1) return a.category.localeCompare(b.category);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    return NextResponse.json({ products: rosters, categories: categoryRosters });
  } catch (error) {
    console.error("GET /api/kit-roster error:", error);
    return NextResponse.json({ error: "Failed to fetch kit roster" }, { status: 500 });
  }
}
