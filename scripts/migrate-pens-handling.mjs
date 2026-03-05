/**
 * migrate-pens-handling.mjs
 * Updates all existing PENS orders across all batches to use the new
 * handling fee: ₱150 base for 1-5 pens, +₱50 per 5 pens thereafter.
 *
 * Run from ~/order-portal:
 *   source ~/.nvm/nvm.sh && nvm use 20 && node --env-file=.env.local scripts/migrate-pens-handling.mjs
 */

import { google } from "googleapis";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
if (!SHEET_ID) throw new Error("GOOGLE_SHEET_ID not set in environment");

// Column indices (0-based, rows start at A2)
const COL = {
  order_date: 0,
  id: 1,
  order_id: 2,
  customer_name: 3,
  telegram_username: 4,
  product_name: 5,
  category: 6,
  qty_item: 7,
  price_per_item: 8,
  handling_fee: 9,
  category_total: 10,
  overall_total: 11,
  status: 12,
  category_status: 13,
};

function pensHandlingFee(n) {
  if (n === 0) return 0;
  return 150 + Math.floor((n - 1) / 5) * 50;
}

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function getOrderSheetNames(sheets) {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  return (spreadsheet.data.sheets || [])
    .map((s) => s.properties?.title || "")
    .filter((t) => /^Order-\d+$/.test(t))
    .sort();
}

async function migrateSheet(sheets, sheetName) {
  console.log(`\n─── ${sheetName} ───`);

  // Read all rows (including header at row 1; data starts at row 2)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A:N`,
  });
  const allRows = res.data.values || [];
  if (allRows.length <= 1) {
    console.log("  (empty)");
    return;
  }

  // Group data rows (skip header row index 0) by order_id
  // dataRows[i] is allRows[i+1], so sheet row = i + 2
  const dataRows = allRows.slice(1);

  const orderMap = new Map(); // orderId -> [{ rowIdx (0-based in dataRows), row }]
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const orderId = row[COL.order_id];
    if (!orderId) continue;
    if (!orderMap.has(orderId)) orderMap.set(orderId, []);
    orderMap.get(orderId).push({ rowIdx: i, row });
  }

  // Collect batchUpdate data
  const valueUpdates = []; // { range, values }

  for (const [orderId, entries] of orderMap) {
    const pensEntries = entries.filter(
      (e) => (e.row[COL.category] || "").toUpperCase() === "PENS"
    );
    if (pensEntries.length === 0) continue;

    // Skip cancelled orders
    const status = (entries[0].row[COL.status] || "").toLowerCase();
    if (status === "cancelled") {
      console.log(`  SKIP  ${orderId} (cancelled)`);
      continue;
    }

    // Compute new pens handling fee
    const totalPens = pensEntries.reduce(
      (sum, e) => sum + (parseInt(e.row[COL.qty_item]) || 0),
      0
    );
    const oldHandlingFee = parseFloat(pensEntries[0].row[COL.handling_fee]) || 0;
    const newHandlingFee = pensHandlingFee(totalPens);

    if (newHandlingFee === oldHandlingFee) {
      console.log(`  OK    ${orderId}  pens=${totalPens}  fee=${oldHandlingFee} (no change)`);
      continue;
    }

    const feeDelta = newHandlingFee - oldHandlingFee;
    const oldGrandTotal = parseFloat(entries[0].row[COL.overall_total]) || 0;
    const newGrandTotal = Math.round((oldGrandTotal + feeDelta) * 100) / 100;

    console.log(
      `  FIX   ${orderId}  pens=${totalPens}  fee: ${oldHandlingFee}→${newHandlingFee}  total: ${oldGrandTotal}→${newGrandTotal}`
    );

    // Update J (handling_fee) on all PENS rows
    for (const e of pensEntries) {
      const sheetRow = e.rowIdx + 2; // +1 for header, +1 for 1-based
      valueUpdates.push({
        range: `${sheetName}!J${sheetRow}`,
        values: [[newHandlingFee]],
      });
    }

    // Update L (overall_total) on ALL rows in this order
    for (const e of entries) {
      const sheetRow = e.rowIdx + 2;
      valueUpdates.push({
        range: `${sheetName}!L${sheetRow}`,
        values: [[newGrandTotal]],
      });
    }
  }

  if (valueUpdates.length === 0) {
    console.log("  Nothing to update.");
    return;
  }

  // Execute batchUpdate
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: valueUpdates,
    },
  });

  console.log(`  ${valueUpdates.length} cell(s) updated.`);
}

async function main() {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const sheetNames = await getOrderSheetNames(sheets);
  if (sheetNames.length === 0) {
    console.log("No Order-XX sheets found.");
    return;
  }

  console.log(`Found ${sheetNames.length} batch sheet(s): ${sheetNames.join(", ")}`);

  for (const name of sheetNames) {
    await migrateSheet(sheets, name);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
