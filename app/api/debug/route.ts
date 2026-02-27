import { NextResponse } from "next/server";
import { google } from "googleapis";

export const dynamic = "force-dynamic";

export async function GET() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  const key = rawKey?.replace(/\\n/g, "\n");

  const info = {
    emailSet: !!email,
    emailValue: email,
    sheetIdSet: !!sheetId,
    sheetIdValue: sheetId,
    rawKeyLength: rawKey?.length,
    rawKeyStart: rawKey?.substring(0, 40),
    rawKeyEnd: rawKey?.substring(rawKey.length - 40),
    keyAfterReplaceLength: key?.length,
    keyStart: key?.substring(0, 40),
    keyHasActualNewlines: key?.includes("\n"),
    keyHasLiteralNewlines: rawKey?.includes("\\n"),
  };

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: email, private_key: key },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Pricelist!A1:A2",
    });
    return NextResponse.json({ ok: true, rows: res.data.values, info });
  } catch (e: unknown) {
    const err = e as Error & { code?: number };
    return NextResponse.json({ ok: false, error: err.message, code: err.code, info });
  }
}
