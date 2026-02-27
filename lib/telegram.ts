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

function fmt(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface OrderItem {
  productName: string;
  category: string;
  qtyVials: number;
  pricePerVial: number;
  vialsPerKit: number;
}

export function buildNewOrderMessage(
  orderId: string,
  customerName: string,
  telegramUsername: string,
  items: OrderItem[]
): string {
  // Group by category
  const byCategory = new Map<string, OrderItem[]>();
  for (const item of items) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category)!.push(item);
  }

  const subtotal = items.reduce((s, i) => s + i.qtyVials * i.pricePerVial, 0);

  let lines = `🛒 <b>New Order — Deej Hauls</b>\n\n`;
  lines += `👤 <b>${customerName}</b>\n`;
  lines += `📱 ${telegramUsername}\n`;
  lines += `🆔 #${orderId}\n`;
  lines += `🕐 ${new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}\n\n`;

  for (const [cat, catItems] of byCategory) {
    lines += `<b>[${cat}]</b>\n`;
    for (const item of catItems) {
      const lineTotal = item.qtyVials * item.pricePerVial;
      lines += `  • ${item.productName} ×${item.qtyVials} — ₱${fmt(lineTotal)}\n`;
    }
    lines += "\n";
  }

  lines += `💰 <b>Subtotal: ₱${fmt(subtotal)}</b>\n`;
  lines += `(+ handling fees per category)`;

  return lines;
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
