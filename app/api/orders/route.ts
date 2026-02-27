import { NextRequest, NextResponse } from "next/server";
import { getOrders, createOrder, getOrderItems } from "@/lib/sheets";
import { sendTelegram, buildNewOrderMessage } from "@/lib/telegram";

export async function GET() {
  try {
    const [orders, allItems] = await Promise.all([
      getOrders(),
      getOrderItems(),
    ]);

    const ordersWithItems = orders.map((order) => {
      const items = allItems.filter((i) => i.orderId === order.id);
      const categories = new Set(items.map((i) => i.category));
      const subtotal = items.reduce(
        (sum, i) => sum + i.qtyVials * i.pricePerVial,
        0
      );
      return {
        ...order,
        items,
        categories: [...categories],
        totalVials: items.reduce((sum, i) => sum + i.qtyVials, 0),
        subtotal,
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
    const { customerName, telegramUsername, items } = body;

    if (!customerName || !telegramUsername) {
      return NextResponse.json(
        { error: "Customer name and Telegram username are required" },
        { status: 400 }
      );
    }

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "At least one item is required" },
        { status: 400 }
      );
    }

    const orderId = await createOrder(
      {
        customerName,
        telegramUsername,
        orderDate: new Date().toISOString(),
        status: "pending",
      },
      items
    );

    // Fire-and-forget Telegram notification
    sendTelegram(buildNewOrderMessage(orderId, customerName, telegramUsername, items));

    return NextResponse.json({ orderId }, { status: 201 });
  } catch (error) {
    console.error("POST /api/orders error:", error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}
