import { google } from "googleapis";
import { Product, Order, OrderItem, OrderStatus, Batch, Hauler } from "./types";

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function getSheets() {
  const auth = getAuth();
  return google.sheets({ version: "v4", auth });
}

// ─── PRODUCTS / PRICELIST ──────────────────────────────────────────────────

export async function getProducts(): Promise<Product[]> {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Pricelist!A2:I",
  });

  // Normalize category aliases (e.g. sheet typos / old names)
  const CATEGORY_ALIASES: Record<string, string> = {
    "TOPICALS RAW": "TOPICAL RAWS",
    "TOPICAL RAW":  "TOPICAL RAWS",
  };

  const rows = res.data.values || [];
  return rows
    .map((row, index) => {
      const rawCat = (row[0] || "").trim().toUpperCase();
      const category = CATEGORY_ALIASES[rawCat] ?? rawCat;
      return {
        id: String(index + 2), // row number (1-indexed, skip header)
        category,
        productName: row[1] || "",
        pricePerKit: parseFloat(row[2]) || 0,
        pricePerVial: parseFloat(row[3]) || 0,
        vialsPerKit: parseInt(row[4]) || 1,
        handlingFee: parseFloat(row[5]) || 100,
        active: row[6]?.toUpperCase() !== "FALSE",
        useCase: row[7] || "",
        productFunction: row[8] || "",
      };
    })
    .filter((p) => p.productName.trim() !== "");
}

export async function addProduct(
  product: Omit<Product, "id">
): Promise<void> {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Pricelist!A:I",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          product.category,
          product.productName,
          product.pricePerKit,
          product.pricePerVial,
          product.vialsPerKit,
          product.handlingFee,
          product.active ? "TRUE" : "FALSE",
          product.useCase || "",
          product.productFunction || "",
        ],
      ],
    },
  });
}

export async function updateProduct(
  rowNumber: number,
  product: Omit<Product, "id">
): Promise<void> {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Pricelist!A${rowNumber}:I${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          product.category,
          product.productName,
          product.pricePerKit,
          product.pricePerVial,
          product.vialsPerKit,
          product.handlingFee,
          product.active ? "TRUE" : "FALSE",
          product.useCase || "",
          product.productFunction || "",
        ],
      ],
    },
  });
}

export async function deleteProduct(rowNumber: number): Promise<void> {
  const sheets = await getSheets();
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
  });
  const pricelistSheet = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === "Pricelist"
  );
  const sheetId = pricelistSheet?.properties?.sheetId;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        },
      ],
    },
  });
}

// ─── ORDER BATCH SCHEMA HELPERS ────────────────────────────────────────────
// Each batch = one Google Sheet named "Order-01", "Order-02", etc.
// Columns (A–M):
//   order_date | id | order_id | customer_name | telegram_username |
//   product_name | category | qty_item | price_per_item |
//   handling_fee | category_total | overall_total | status

const BATCH_HEADER = [
  "order_date", "id", "order_id", "customer_name", "telegram_username",
  "product_name", "category", "qty_item", "price_per_item",
  "handling_fee", "category_total", "overall_total", "status", "category_status",
];

function pensHandlingFee(n: number): number {
  if (n === 0) return 0;
  return 150 + Math.floor((n - 1) / 5) * 50;
}

function uspBacHandlingFee(n: number): number {
  if (n === 0) return 0;
  return Math.ceil(n / 50) * 50;
}

async function getOrderSheetNames(
  sheets: Awaited<ReturnType<typeof getSheets>>
): Promise<string[]> {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  return (spreadsheet.data.sheets || [])
    .map((s) => s.properties?.title || "")
    .filter((t) => /^Order-\d+$/.test(t))
    .sort();
}

async function readBatchRows(
  sheets: Awaited<ReturnType<typeof getSheets>>,
  sheetName: string
): Promise<string[][]> {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A2:N`,
    });
    return (res.data.values || []).filter((row) => row[2]); // require order_id column
  } catch {
    return [];
  }
}

async function getVialsPerKitMap(): Promise<Map<string, number>> {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Pricelist!A2:G",
  });
  const map = new Map<string, number>();
  const norm = (s: string) => s.trim().toLowerCase();
  for (const row of res.data.values || []) {
    if (row[1]) map.set(norm(row[1]), parseInt(row[4]) || 1); // productName -> vialsPerKit
  }
  return map;
}

async function ensureBatchSheet(
  sheets: Awaited<ReturnType<typeof getSheets>>,
  sheetName: string
): Promise<void> {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = (spreadsheet.data.sheets || []).some(
    (s) => s.properties?.title === sheetName
  );
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
    });
  }
  // Write header row if empty
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A1:N1`,
  });
  if (!headerRes.data.values || headerRes.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A1:N1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [BATCH_HEADER] },
    });
  }
}

// ─── ORDERS ───────────────────────────────────────────────────────────────

export async function getOrders(batchId?: string): Promise<Order[]> {
  const sheets = await getSheets();
  const sheetNames = batchId ? [batchId] : await getOrderSheetNames(sheets);
  const orderMap = new Map<string, Order>();

  for (const sheetName of sheetNames) {
    const rows = await readBatchRows(sheets, sheetName);
    for (const row of rows) {
      const orderId = row[2];
      if (!orderMap.has(orderId)) {
        orderMap.set(orderId, {
          id: orderId,
          customerName: row[3] || "",
          telegramUsername: row[4] || "",
          orderDate: row[0] || "",
          status: (row[12] as OrderStatus) || "pending",
          batchId: sheetName,
          grandTotal: parseFloat(row[11]) || 0,
        });
      }
    }
  }

  return [...orderMap.values()];
}

export async function getOrderItems(orderId?: string, batchId?: string): Promise<OrderItem[]> {
  const sheets = await getSheets();
  const vialsMap = await getVialsPerKitMap();

  const sheetNames = batchId ? [batchId] : await getOrderSheetNames(sheets);
  const items: OrderItem[] = [];

  for (const sheetName of sheetNames) {
    const rows = await readBatchRows(sheets, sheetName);
    for (const row of rows) {
      if (orderId && row[2] !== orderId) continue;
      const productName = row[5] || "";
      items.push({
        id: row[1] || "",         // B: item row ID
        orderId: row[2] || "",    // C: order_id
        productName,
        category: row[6] || "",
        qtyVials: parseInt(row[7]) || 0,
        pricePerVial: parseFloat(row[8]) || 0,
        vialsPerKit: vialsMap.get(productName.trim().toLowerCase()) || 1,
        handlingFee: parseFloat(row[9]) || 0, // J: handling_fee (per-category flat fee)
        categoryStatus: row[13] || "pending",  // N: category_status
      });
    }
    // If orderId specified and we found items, stop searching further sheets
    if (orderId && items.length > 0) break;
  }

  return items;
}

export async function findOrdersByTelegramInBatch(
  telegramUsername: string,
  batchId: string
): Promise<string[]> {
  const sheets = await getSheets();
  const normalized = telegramUsername.toLowerCase().replace(/^@/, "");
  const rows = await readBatchRows(sheets, batchId);
  const orderIds = new Set<string>();
  for (const row of rows) {
    const rowTelegram = (row[4] || "").toLowerCase().replace(/^@/, "");
    if (rowTelegram === normalized && row[2]) {
      orderIds.add(row[2]);
    }
  }
  return [...orderIds];
}

export async function createOrder(
  order: {
    customerName: string;
    telegramUsername: string;
    orderDate?: string;
    status?: OrderStatus;
    batchId?: string;
  },
  items: Array<{
    productName: string;
    category: string;
    qtyVials: number;
    pricePerVial: number;
    vialsPerKit?: number;
  }>,
  computed: {
    handlingByCat: Record<string, number>;
    grandTotal: number;
  }
): Promise<string> {
  const sheets = await getSheets();

  // Determine which batch sheet to write to
  const activeBatch = await getActiveBatch();
  const sheetName = order.batchId || activeBatch?.id;
  if (!sheetName) throw new Error("No active batch. Please create and activate a batch first.");

  await ensureBatchSheet(sheets, sheetName);

  const orderId = Date.now().toString();
  const orderDate = order.orderDate || new Date().toISOString();
  const status = order.status || "pending";

  // Compute category subtotals
  const categoryTotals: Record<string, number> = {};
  for (const item of items) {
    if (item.qtyVials <= 0) continue;
    categoryTotals[item.category] =
      (categoryTotals[item.category] || 0) + item.qtyVials * item.pricePerVial;
  }

  // Build one row per item
  const rows = items
    .filter((item) => item.qtyVials > 0)
    .map((item, i) => [
      orderDate,                                        // A: order_date
      `${orderId}-${i + 1}`,                           // B: id
      orderId,                                          // C: order_id
      order.customerName,                               // D: customer_name
      order.telegramUsername,                           // E: telegram_username
      item.productName,                                 // F: product_name
      item.category,                                    // G: category
      item.qtyVials,                                    // H: qty_item
      item.pricePerVial,                                // I: price_per_item
      computed.handlingByCat[item.category] || 0,       // J: handling_fee (per-category fee)
      categoryTotals[item.category] || 0,               // K: category_total
      computed.grandTotal,                              // L: overall_total
      status,                                           // M: status
      "pending",                                        // N: category_status
    ]);

  if (rows.length === 0) throw new Error("No items with qty > 0");

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A:N`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  });

  return orderId;
}

export async function updateOrder(
  orderId: string,
  updates: {
    customerName?: string;
    telegramUsername?: string;
    status?: OrderStatus;
    items?: Array<{
      productName: string;
      category: string;
      qtyVials: number;
      pricePerVial: number;
      vialsPerKit: number;
    }>;
  }
): Promise<void> {
  const sheets = await getSheets();
  const sheetNames = await getOrderSheetNames(sheets);

  for (const sheetName of sheetNames) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A:N`,
    });
    const allRows = res.data.values || [];

    const matchedIndices = allRows.reduce<number[]>((acc, row, i) => {
      if (row[2] === orderId) acc.push(i);
      return acc;
    }, []);

    if (matchedIndices.length === 0) continue;

    // If items provided, recompute handling/totals
    const handlingByCat: Record<string, number> = {};
    const categoryTotals: Record<string, number> = {};
    let grandTotal: number | null = null;
    const itemQtyMap: Map<string, number> = new Map(); // productName -> qtyVials

    if (updates.items && updates.items.length > 0) {
      const products = await getProducts();
      const categoryFlatFees: Record<string, number> = {};
      for (const p of products) {
        if (!categoryFlatFees[p.category]) categoryFlatFees[p.category] = p.handlingFee;
      }

      const activeItems = updates.items.filter((i) => i.qtyVials >= 0);
      const totalPens = activeItems
        .filter((i) => i.category === "PENS")
        .reduce((s, i) => s + i.qtyVials, 0);
      const totalUspBac = activeItems
        .filter((i) => i.category === "USP BAC")
        .reduce((s, i) => s + i.qtyVials, 0);

      const categories = new Set(activeItems.map((i) => i.category));
      for (const cat of categories) {
        if (cat === "PENS") handlingByCat[cat] = pensHandlingFee(totalPens);
        else if (cat === "USP BAC") handlingByCat[cat] = uspBacHandlingFee(totalUspBac);
        else handlingByCat[cat] = categoryFlatFees[cat] || 100;
      }

      for (const item of activeItems) {
        categoryTotals[item.category] =
          (categoryTotals[item.category] || 0) + item.qtyVials * item.pricePerVial;
        itemQtyMap.set(item.productName, item.qtyVials);
      }

      const subtotal = activeItems.reduce((s, i) => s + i.qtyVials * i.pricePerVial, 0);
      const handlingTotal = Object.values(handlingByCat).reduce((s, v) => s + v, 0);
      grandTotal = subtotal + handlingTotal;
    }

    // Build batch update
    const updateData: { range: string; values: (string | number)[][] }[] = [];
    for (const rowIdx of matchedIndices) {
      const row = allRows[rowIdx];
      const rowNumber = rowIdx + 1;
      const productName = row[5] || "";

      const newRow = [
        row[0],                                              // A: order_date
        row[1],                                              // B: id
        row[2],                                              // C: order_id
        updates.customerName ?? row[3],                      // D: customer_name
        updates.telegramUsername ?? row[4],                  // E: telegram_username
        productName,                                         // F: product_name
        row[6],                                              // G: category
        itemQtyMap.size > 0
          ? (itemQtyMap.get(productName) ?? parseInt(row[7]) ?? 0)
          : row[7],                                          // H: qty_item
        row[8],                                              // I: price_per_item
        updates.items ? (handlingByCat[row[6]] ?? row[9])
          : row[9],                                          // J: handling_fee
        updates.items ? (categoryTotals[row[6]] ?? row[10])
          : row[10],                                         // K: category_total
        grandTotal !== null ? grandTotal : row[11],          // L: overall_total
        updates.status ?? row[12],                           // M: status
        row[13] ?? "pending",                                // N: category_status (preserve)
      ];

      updateData.push({
        range: `${sheetName}!A${rowNumber}:N${rowNumber}`,
        values: [newRow],
      });
    }

    if (updateData.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: updateData,
        },
      });
    }

    return; // found and updated
  }

  throw new Error(`Order ${orderId} not found in any batch sheet`);
}

export async function updateCategoryStatus(
  orderId: string,
  category: string,
  newCategoryStatus: string
): Promise<void> {
  const sheets = await getSheets();
  const sheetNames = await getOrderSheetNames(sheets);

  for (const sheetName of sheetNames) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A:N`,
    });
    const allRows = res.data.values || [];

    const allOrderRows = allRows.filter((row) => row[2] === orderId);
    if (allOrderRows.length === 0) continue;

    // Derive new overall status from per-category statuses
    const categoryStatuses = new Map<string, string>();
    for (const row of allOrderRows) {
      const cat = row[6];
      const catSt = cat === category ? newCategoryStatus : (row[13] || "pending");
      if (!categoryStatuses.has(cat)) categoryStatuses.set(cat, catSt);
    }
    const statuses = [...categoryStatuses.values()];
    let newOverallStatus: OrderStatus;
    if (statuses.every((s) => s === "paid")) {
      newOverallStatus = "paid";
    } else if (statuses.some((s) => s === "waiting" || s === "paid")) {
      newOverallStatus = "waiting";
    } else {
      newOverallStatus = "pending";
    }

    // Update all rows for this order
    const updateData: { range: string; values: (string | number)[][] }[] = [];
    for (let rowIdx = 0; rowIdx < allRows.length; rowIdx++) {
      const row = allRows[rowIdx];
      if (row[2] !== orderId) continue;
      const rowNumber = rowIdx + 1;
      updateData.push({
        range: `${sheetName}!A${rowNumber}:N${rowNumber}`,
        values: [[
          row[0], row[1], row[2], row[3], row[4],
          row[5], row[6], row[7], row[8], row[9],
          row[10], row[11],
          newOverallStatus,
          row[6] === category ? newCategoryStatus : (row[13] || "pending"),
        ]],
      });
    }

    if (updateData.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { valueInputOption: "USER_ENTERED", data: updateData },
      });
    }
    if (newCategoryStatus === "paid") {
      await setCategoryLock(sheetName, category, true);
    }
    return;
  }
  throw new Error(`Order ${orderId} not found in any batch sheet`);
}

export async function deleteOrder(orderId: string): Promise<void> {
  const sheets = await getSheets();
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const allSheetsInfo = spreadsheet.data.sheets || [];
  const sheetNames = allSheetsInfo
    .map((s) => s.properties?.title || "")
    .filter((t) => /^Order-\d+$/.test(t))
    .sort();

  for (const sheetName of sheetNames) {
    const sheetMeta = allSheetsInfo.find((s) => s.properties?.title === sheetName);
    const sheetId = sheetMeta?.properties?.sheetId;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!C:C`, // order_id column
    });
    const orderIdCol = res.data.values || [];

    // Find rows belonging to this order (reverse order for deletion)
    const deleteIndices: number[] = [];
    for (let i = orderIdCol.length - 1; i >= 1; i--) {
      if (orderIdCol[i]?.[0] === orderId) deleteIndices.push(i);
    }

    if (deleteIndices.length === 0) continue;

    const deleteRequests = deleteIndices.map((i) => ({
      deleteDimension: {
        range: {
          sheetId,
          dimension: "ROWS",
          startIndex: i,
          endIndex: i + 1,
        },
      },
    }));

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: deleteRequests },
    });

    return; // found and deleted
  }
}

// ─── CONSOLIDATION ────────────────────────────────────────────────────────

export async function getConsolidationData(batchId?: string) {
  const sheets = await getSheets();
  const sheetNames = batchId ? [batchId] : await getOrderSheetNames(sheets);

  const [products, allRows] = await Promise.all([
    getProducts(),
    (async () => {
      const rows: string[][] = [];
      for (const name of sheetNames) {
        const r = await readBatchRows(sheets, name);
        rows.push(...r);
      }
      return rows;
    })(),
  ]);

  // Build product lookup (normalized key for resilience against whitespace/case drift)
  const norm = (s: string) => s.trim().toLowerCase();
  const productMap = new Map(products.map((p) => [norm(p.productName), p]));

  // Determine cancelled orders (by order_id — first row status wins)
  const orderStatusMap = new Map<string, string>();
  for (const row of allRows) {
    const orderId = row[2];
    if (!orderStatusMap.has(orderId)) orderStatusMap.set(orderId, row[12] || "pending");
  }
  const activeOrderIds = new Set(
    [...orderStatusMap.entries()]
      .filter(([, s]) => s !== "cancelled")
      .map(([id]) => id)
  );

  // Paid orders handling total (deduplicated per order × category)
  const paidOrderIds = new Set(
    [...orderStatusMap.entries()]
      .filter(([, s]) => s === "paid")
      .map(([id]) => id)
  );
  const paidHandlingKeys = new Set<string>();
  let paidHandlingTotal = 0;
  for (const row of allRows) {
    if (!paidOrderIds.has(row[2])) continue;
    const key = `${row[2]}|${row[6]}`; // orderId|category
    if (!paidHandlingKeys.has(key)) {
      paidHandlingKeys.add(key);
      paidHandlingTotal += parseFloat(row[9]) || 0;
    }
  }

  // Aggregate vials per product (non-cancelled orders only)
  const vialsByProduct = new Map<string, number>();
  const categoryByProduct = new Map<string, string>();
  for (const row of allRows) {
    if (!activeOrderIds.has(row[2])) continue;
    const productName = row[5];
    const qty = parseInt(row[7]) || 0;
    if (!productName || qty <= 0) continue;
    vialsByProduct.set(productName, (vialsByProduct.get(productName) || 0) + qty);
    categoryByProduct.set(productName, row[6]);
  }

  // Category handling fees from Pricelist
  const categoryFees: Record<string, number> = {};
  for (const product of products) {
    if (!categoryFees[product.category]) {
      categoryFees[product.category] = product.handlingFee;
    }
  }

  // Build consolidation rows
  const rows = [];
  for (const [productName, totalVials] of vialsByProduct.entries()) {
    const product = productMap.get(norm(productName));
    const vialsPerKit = product?.vialsPerKit || 1;
    const pricePerKit = product?.pricePerKit || 0;
    const category = categoryByProduct.get(productName) || "Unknown";
    const kitsNeeded = Math.floor(totalVials / vialsPerKit);
    const openSlots = vialsPerKit - (totalVials % vialsPerKit || vialsPerKit);

    rows.push({
      productName,
      category,
      totalVials,
      kitsNeeded,
      openSlots,
      pricePerKit,
      cost: kitsNeeded * pricePerKit,
    });
  }

  const totalKits = rows.reduce((sum, r) => sum + r.kitsNeeded, 0);
  const totalCost = rows.reduce((sum, r) => sum + r.cost, 0);

  // Sum handling once per orderId×category pair across all non-cancelled orders
  const allHandlingKeys = new Set<string>();
  let totalHandling = 0;
  for (const row of allRows) {
    if (!activeOrderIds.has(row[2])) continue;
    const key = `${row[2]}|${row[6]}`; // orderId|category
    if (!allHandlingKeys.has(key)) {
      allHandlingKeys.add(key);
      totalHandling += parseFloat(row[9]) || 0;
    }
  }

  // Per-category vendor cost totals
  const categoryCosts: Record<string, number> = {};
  for (const row of rows) {
    categoryCosts[row.category] = (categoryCosts[row.category] || 0) + row.cost;
  }

  return { rows, categoryFees, categoryCosts, totalKits, totalCost, totalHandling, paidHandlingTotal };
}

// ─── BATCHES ──────────────────────────────────────────────────────────────
// Batch id = sheet name (e.g., "Order-01")

export async function getBatches(): Promise<Batch[]> {
  const sheets = await getSheets();

  // Read registered batches from Batches sheet
  let registeredBatches: Batch[] = [];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "Batches!A2:D",
    });
    registeredBatches = (res.data.values || [])
      .filter((row) => row[0])
      .map((row) => ({
        id: row[0],
        name: row[1] || row[0],
        status: (row[2] as "active" | "closed") || "closed",
        createdDate: row[3] || "",
      }));
  } catch {
    // Batches sheet doesn't exist yet
  }

  // Auto-discover Order-XX sheets not yet registered
  try {
    const sheetNames = await getOrderSheetNames(sheets);
    const registeredIds = new Set(registeredBatches.map((b) => b.id));
    for (const sheetName of sheetNames) {
      if (!registeredIds.has(sheetName)) {
        registeredBatches.push({
          id: sheetName,
          name: sheetName,
          status: "closed",
          createdDate: "",
        });
      }
    }
  } catch {
    // ignore
  }

  return registeredBatches.sort((a, b) => a.id.localeCompare(b.id));
}

export async function getActiveBatch(): Promise<Batch | null> {
  const batches = await getBatches();
  return batches.find((b) => b.status === "active") || null;
}

export async function createBatch(name: string): Promise<string> {
  const sheets = await getSheets();

  // Ensure Batches sheet and headers exist
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const allSheets = spreadsheet.data.sheets || [];
  const batchesExists = allSheets.some((s) => s.properties?.title === "Batches");

  if (!batchesExists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: "Batches" } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: "Batches!A1:D1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["id", "name", "status", "created_date"]] },
    });
  }

  // Determine next Order-XX number
  const orderSheetNums = allSheets
    .map((s) => s.properties?.title || "")
    .filter((t) => /^Order-\d+$/.test(t))
    .map((t) => parseInt(t.replace("Order-", "")));
  const nextNum = orderSheetNums.length > 0 ? Math.max(...orderSheetNums) + 1 : 1;
  const sheetName = `Order-${String(nextNum).padStart(2, "0")}`;

  // Create the Order-XX sheet with header
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A1:M1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [BATCH_HEADER] },
  });

  // Register in Batches sheet
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Batches!A:D",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[sheetName, name, "closed", now]] },
  });

  return sheetName;
}

export async function updateBatch(
  batchId: string,
  updates: { name?: string; status?: "active" | "closed" }
): Promise<void> {
  const sheets = await getSheets();

  // Ensure Batches sheet exists with header
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const batchesExists = (spreadsheet.data.sheets || []).some(
    (s) => s.properties?.title === "Batches"
  );
  if (!batchesExists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: "Batches" } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: "Batches!A1:D1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["id", "name", "status", "created_date"]] },
    });
  }

  // Read current Batches rows
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Batches!A:D",
  });
  const rows = res.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === batchId);

  // If activating this batch, close all others first
  if (updates.status === "active") {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i]?.[0] && rows[i][0] !== batchId && rows[i][2] === "active") {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `Batches!C${i + 1}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [["closed"]] },
        });
      }
    }
  }

  if (rowIndex === -1) {
    // Not yet registered — append new row
    const now = new Date().toISOString();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "Batches!A:D",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[batchId, updates.name ?? batchId, updates.status ?? "closed", now]],
      },
    });
    return;
  }

  const currentRow = rows[rowIndex];
  const rowNumber = rowIndex + 1;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Batches!A${rowNumber}:D${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[batchId, updates.name ?? currentRow[1], updates.status ?? currentRow[2], currentRow[3]]],
    },
  });
}

// ─── CATEGORY NOTES ───────────────────────────────────────────────────────

export async function getCategoryNotes(): Promise<Record<string, string>> {
  const sheets = await getSheets();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "CategoryNotes!A:B",
    });
    const rows = res.data.values || [];
    const notes: Record<string, string> = {};
    for (const row of rows.slice(1)) {
      if (row[0]) notes[row[0]] = row[1] || "";
    }
    return notes;
  } catch {
    return {};
  }
}

// ─── HAULERS (pephaulers sheet) ───────────────────────────────────────────
// Columns: A = Telegram Username, B = Chat ID, C = Updated

export async function getHaulers(): Promise<Hauler[]> {
  const sheets = await getSheets();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "pephaulers!A2:C",
    });
    return (res.data.values || [])
      .map((row, i) => ({
        telegramUsername: (row[0] || "").trim().toLowerCase().replace(/^@/, ""),
        chatId: (row[1] || "").trim(),
        updated: row[2] || "",
        rowNumber: i + 2,
      }))
      .filter((h) => h.telegramUsername && h.chatId);
  } catch {
    return [];
  }
}

export async function upsertHauler(telegramUsername: string, chatId: string): Promise<void> {
  const sheets = await getSheets();
  const normalized = telegramUsername.toLowerCase().replace(/^@/, "");
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "pephaulers!A:C",
    });
    const rows = res.data.values || [];
    const rowIndex = rows.findIndex(
      (r) => (r[0] || "").trim().toLowerCase().replace(/^@/, "") === normalized
    );
    if (rowIndex === -1) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: "pephaulers!A:C",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [["@" + normalized, chatId, ""]] },
      });
    } else {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `pephaulers!B${rowIndex + 1}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[chatId]] },
      });
    }
  } catch {
    // sheet might not exist; silently ignore
  }
}

export async function updateHaulerTimestamp(rowNumber: number): Promise<void> {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `pephaulers!C${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[new Date().toISOString()]] },
  });
}

// ─── CATEGORY LOCKS ───────────────────────────────────────────────────────
// Sheet: CategoryLocks — columns: A=batch_id, B=category, C=locked (TRUE/FALSE), D=locked_at

async function ensureCategoryLocksSheet(
  sheets: Awaited<ReturnType<typeof getSheets>>
): Promise<void> {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = (spreadsheet.data.sheets || []).some(
    (s) => s.properties?.title === "CategoryLocks"
  );
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: "CategoryLocks" } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: "CategoryLocks!A1:D1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["batch_id", "category", "locked", "locked_at"]] },
    });
  }
}

export async function getCategoryLocks(batchId: string): Promise<Record<string, boolean>> {
  const sheets = await getSheets();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "CategoryLocks!A2:D",
    });
    const locks: Record<string, boolean> = {};
    for (const row of res.data.values || []) {
      if (row[0] === batchId) {
        locks[row[1]] = row[2]?.toUpperCase() === "TRUE";
      }
    }
    return locks;
  } catch {
    return {};
  }
}

export async function setCategoryLock(
  batchId: string,
  category: string,
  locked: boolean
): Promise<void> {
  const sheets = await getSheets();
  await ensureCategoryLocksSheet(sheets);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "CategoryLocks!A:D",
  });
  const rows = res.data.values || [];
  const rowIndex = rows.findIndex((r) => r[0] === batchId && r[1] === category);
  const now = new Date().toISOString();
  if (rowIndex === -1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "CategoryLocks!A:D",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[batchId, category, locked ? "TRUE" : "FALSE", locked ? now : ""]],
      },
    });
  } else {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `CategoryLocks!A${rowIndex + 1}:D${rowIndex + 1}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[batchId, category, locked ? "TRUE" : "FALSE", locked ? now : ""]],
      },
    });
  }
}

export async function updateCategoryNote(category: string, note: string): Promise<void> {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "CategoryNotes!A:B",
  });
  const rows = res.data.values || [];
  const rowIndex = rows.findIndex((r) => r[0] === category);

  if (rowIndex === -1) {
    if (rows.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: "CategoryNotes!A1:B1",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [["Category", "Notes"]] },
      });
    }
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "CategoryNotes!A:B",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[category, note]] },
    });
  } else {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `CategoryNotes!A${rowIndex + 1}:B${rowIndex + 1}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[category, note]] },
    });
  }
}
