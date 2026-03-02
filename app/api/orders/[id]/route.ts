import { NextRequest, NextResponse } from "next/server";
import { getOrders, getOrderItems, updateOrder, deleteOrder } from "@/lib/sheets";
import { sendTelegram, buildStatusMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const [orders, items] = await Promise.all([
      getOrders(),
      getOrderItems(params.id),
    ]);

    const order = orders.find((o) => o.id === params.id);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const categories = new Set(items.map((i) => i.category));
    const subtotal = items.reduce((sum, i) => sum + i.qtyVials * i.pricePerVial, 0);

    return NextResponse.json({ ...order, items, categories: [...categories], subtotal });
  } catch (error) {
    console.error(`GET /api/orders/${params.id} error:`, error);
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const body = await req.json();
    await updateOrder(params.id, body);

    // Notify on status change
    if (body.status && body.customerName && body.telegramUsername) {
      sendTelegram(buildStatusMessage(params.id, body.customerName, body.telegramUsername, body.status));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`PUT /api/orders/${params.id} error:`, error);
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await deleteOrder(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`DELETE /api/orders/${params.id} error:`, error);
    return NextResponse.json({ error: "Failed to delete order" }, { status: 500 });
  }
}
