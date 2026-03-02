const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID!;

export async function sendTelegram(text: string): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN || !CHAT_ID) return;
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
    });
  } catch (err) {
    console.error("Telegram notification failed:", err);
  }
}

export async function sendTelegramToChat(chatId: string, text: string): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch (err) {
    console.error(`Telegram send to chat ${chatId} failed:`, err);
  }
}

function fmt(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface OrderItem {
  productName: string;
  category: string;
  qtyVials: number;
  pricePerVial: number;
  vialsPerKit?: number;
}

export function buildNewOrderMessage(
  orderId: string,
  customerName: string,
  telegramUsername: string,
  items: OrderItem[],
  handlingByCat: Record<string, number> = {},
  grandTotal?: number,
  isUpdate?: boolean
): string {
  // Group by category
  const byCategory = new Map<string, OrderItem[]>();
  for (const item of items) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category)!.push(item);
  }

  const subtotal = items.reduce((s, i) => s + i.qtyVials * i.pricePerVial, 0);
  const handlingTotal = Object.values(handlingByCat).reduce((s, v) => s + v, 0);
  const total = grandTotal ?? subtotal + handlingTotal;

  let lines = `${isUpdate ? "✏️ <b>Updated Order" : "🛒 <b>New Order"} — Deej Hauls</b>\n\n`;
  lines += `👤 <b>${customerName}</b>\n`;
  lines += `📱 ${telegramUsername}\n`;
  lines += `🆔 #${orderId}\n`;
  lines += `🕐 ${new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}\n\n`;

  for (const [cat, catItems] of byCategory) {
    const catSubtotal = catItems.reduce((s, i) => s + i.qtyVials * i.pricePerVial, 0);
    const catHandling = handlingByCat[cat] || 0;
    lines += `<b>[${cat}]</b>\n`;
    for (const item of catItems) {
      const lineTotal = item.qtyVials * item.pricePerVial;
      lines += `  • ${item.productName} ×${item.qtyVials} — ₱${fmt(lineTotal)}\n`;
    }
    lines += `  📦 Subtotal: ₱${fmt(catSubtotal)}`;
    if (catHandling > 0) lines += ` + ₱${fmt(catHandling)} handling`;
    lines += "\n\n";
  }

  lines += `💰 Subtotal: ₱${fmt(subtotal)}\n`;
  if (handlingTotal > 0) lines += `📦 Total handling: ₱${fmt(handlingTotal)}\n`;
  lines += `✅ <b>Grand Total: ₱${fmt(total)}</b>`;

  return lines;
}

export function buildOrderReminderMessage(
  orderId: string,
  customerName: string,
  items: Array<{ productName: string; qtyVials: number; pricePerVial: number }>,
  grandTotal: number,
  batchName: string
): string {
  const subtotal = items.reduce((s, i) => s + i.qtyVials * i.pricePerVial, 0);
  const handling = grandTotal - subtotal;

  let text = `🦋 <b>Deej Hauls — Order Reminder</b>\n\n`;
  text += `Hi <b>${customerName}</b>! Here's your order summary for <b>${batchName}</b>:\n\n`;

  for (const item of items) {
    text += `• ${item.productName} ×${item.qtyVials} — ₱${fmt(item.qtyVials * item.pricePerVial)}\n`;
  }

  text += `\n`;
  if (handling > 0) {
    text += `Subtotal: ₱${fmt(subtotal)}\n`;
    text += `Handling: ₱${fmt(handling)}\n`;
  }
  text += `💰 <b>Total Due: ₱${fmt(grandTotal)}</b>\n\n`;
  text += `💳 <b>Pay via:</b> GCash · GoTyme · Maya\n`;
  text += `<b>09267007491</b>\n\n`;
  text += `Once paid, tap <b>"I've sent payment"</b> on the order portal to notify us! 🧾\n`;
  text += `<i>Order #${orderId}</i>`;

  return text;
}

export function buildPaymentNotificationMessage(
  orderId: string,
  customerName: string,
  telegramUsername: string,
  subtotal: number
): string {
  return (
    `💳 <b>Payment Ready — Deej Hauls</b>\n\n` +
    `👤 <b>${customerName}</b> (${telegramUsername})\n` +
    `🆔 #${orderId}\n` +
    `💰 Order subtotal: ₱${fmt(subtotal)}\n\n` +
    `Customer is ready to pay their order.`
  );
}

export function buildStatusMessage(
  orderId: string,
  customerName: string,
  telegramUsername: string,
  newStatus: string
): string {
  const emoji: Record<string, string> = {
    pending: "⏳",
    confirmed: "✅",
    delivered: "📦",
    cancelled: "❌",
  };
  const icon = emoji[newStatus] ?? "🔄";
  return (
    `${icon} <b>Order ${newStatus.toUpperCase()}</b>\n\n` +
    `🆔 #${orderId}\n` +
    `👤 ${customerName} (${telegramUsername})`
  );
}
