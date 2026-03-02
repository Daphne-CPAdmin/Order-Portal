import { NextRequest, NextResponse } from "next/server";
import { upsertHauler } from "@/lib/sheets";
import { sendTelegramToChat } from "@/lib/telegram";

export const dynamic = "force-dynamic";

function verifySecret(req: NextRequest): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return true; // no secret configured — allow all
  return req.headers.get("x-telegram-bot-api-secret-token") === secret;
}

export async function POST(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const update = await req.json();
    const message = update.message || update.edited_message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId = String(message.chat?.id || "");
    const username = (message.from?.username || "").trim();
    if (!chatId || !username) return NextResponse.json({ ok: true });

    await upsertHauler(username, chatId);

    // Reply to /start command
    const text = (message.text || "").trim();
    if (text === "/start") {
      await sendTelegramToChat(
        chatId,
        `👋 Hi @${username}! You're now registered with Deej Hauls.\n\n` +
          `We'll send your order updates and payment reminders here. 🦋\n\n` +
          `To check your orders, visit: https://deej-hauls.vercel.app`
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ ok: true }); // always 200 to Telegram
  }
}
