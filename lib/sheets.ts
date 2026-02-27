import { google } from "googleapis";
import { Product, Order, OrderItem, OrderStatus } from "./types";

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
    range: "Pricelist!A2:G",
  });

  const rows = res.data.values || [];
  return rows
    .map((row, index) => ({
      id: String(index + 2), // row number (1-indexed, skip header)
      category: row[0] || "",
      productName: row[1] || "",
      pricePerKit: parseFloat(row[2]) || 0,
      pricePerVial: parseFloat(row[3]) || 0,
      vialsPerKit: parseInt(row[4]) || 1,
      handlingFee: parseFloat(row[5]) || 100,
      active: row[6]?.toUpperCase() !== "FALSE",
    }))
    .filter((p) => p.productName.trim() !== "");
}

export async function addProduct(
  product: Omit<Product, "id">
): Promise<void> {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Pricelist!A:G",
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
    range: `Pricelist!A${rowNumber}:G${rowNumber}`,
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
        ],
      ],
    },
  });
}

export async function deleteProduct(rowNumber: number): Promise<void> {
  const sheets = await getSheets();
  // Get spreadsheet to find sheet ID for Pricelist
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
              startIndex: rowNumber - 1, // 0-indexed
              endIndex: rowNumber,
            },
          },
        },
      ],
    },
  });
}

// ─── ORDERS ───────────────────────────────────────────────────────────────

const ORDERS_HEADER = ["id", "customer_name", "telegram_username", "order_date", "status"];
const ORDER_ITEMS_HEADER = ["id", "order_id", "product_name", "category", "qty_vials", "price_per_vial", "vials_per_kit"];

async function ensureHeaders(sheets: Awaited<ReturnType<typeof getSheets>>) {
  // Check if Orders sheet has headers
  try {
    const ordersRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "Orders!A1:E1",
    });
    if (!ordersRes.data.values || ordersRes.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: "Orders!A1:E1",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [ORDERS_HEADER] },
      });
    }
  } catch {
    // Sheet might not exist yet — create it via batchUpdate if needed
  }

  try {
    const itemsRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "Order_Items!A1:G1",
    });
    if (!itemsRes.data.values || itemsRes.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: "Order_Items!A1:G1",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [ORDER_ITEMS_HEADER] },
      });
    }
  } catch {
    // Sheet might not exist yet
  }
}

export async function getOrders(): Promise<Order[]> {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Orders!A2:E",
  });

  const rows = res.data.values || [];
  return rows
    .filter((row) => row[0])
    .map((row) => ({
      id: row[0],
      customerName: row[1] || "",
      telegramUsername: row[2] || "",
      orderDate: row[3] || "",
      status: (row[4] as OrderStatus) || "pending",
    }));
}

export async function getOrderItems(orderId?: string): Promise<OrderItem[]> {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Order_Items!A2:G",
  });

  const rows = res.data.values || [];
  const items = rows
    .filter((row) => row[0])
    .map((row) => ({
      id: row[0],
      orderId: row[1] || "",
      productName: row[2] || "",
      category: row[3] || "",
      qtyVials: parseInt(row[4]) || 0,
      pricePerVial: parseFloat(row[5]) || 0,
      vialsPerKit: parseInt(row[6]) || 1,
    }));

  if (orderId) {
    return items.filter((i) => i.orderId === orderId);
  }
  return items;
}

export async function createOrder(
  order: Omit<Order, "id">,
  items: Omit<OrderItem, "id" | "orderId">[]
): Promise<string> {
  const sheets = await getSheets();
  await ensureHeaders(sheets);

  const orderId = Date.now().toString();
  const now = new Date().toISOString();

  // Write order row
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Orders!A:E",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          orderId,
          order.customerName,
          order.telegramUsername,
          order.orderDate || now,
          order.status || "pending",
        ],
      ],
    },
  });

  // Write order items
  if (items.length > 0) {
    const itemRows = items.map((item, i) => [
      `${orderId}-${i + 1}`,
      orderId,
      item.productName,
      item.category,
      item.qtyVials,
      item.pricePerVial,
      item.vialsPerKit,
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "Order_Items!A:G",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: itemRows },
    });
  }

  return orderId;
}

export async function updateOrder(
  orderId: string,
  updates: Partial<Order & { items: Omit<OrderItem, "id" | "orderId">[] }>
): Promise<void> {
  const sheets = await getSheets();

  // Find the order row number
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Orders!A:E",
  });
  const rows = res.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === orderId);
  if (rowIndex === -1) throw new Error("Order not found");

  const currentRow = rows[rowIndex];
  const rowNumber = rowIndex + 1; // 1-indexed

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Orders!A${rowNumber}:E${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          orderId,
          updates.customerName ?? currentRow[1],
          updates.telegramUsername ?? currentRow[2],
          currentRow[3],
          updates.status ?? currentRow[4],
        ],
      ],
    },
  });

  // Update items if provided
  if (updates.items) {
    // Delete existing items for this order
    const itemsRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "Order_Items!A:G",
    });
    const itemRows = itemsRes.data.values || [];

    // Get spreadsheet to find sheet IDs
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
    });
    const orderItemsSheet = spreadsheet.data.sheets?.find(
      (s) => s.properties?.title === "Order_Items"
    );
    const sheetId = orderItemsSheet?.properties?.sheetId;

    // Find rows belonging to this order (in reverse to delete from bottom up)
    const deleteRequests: Array<{ deleteDimension: { range: { sheetId: number | null | undefined; dimension: string; startIndex: number; endIndex: number } } }> = [];
    for (let i = itemRows.length - 1; i >= 1; i--) {
      if (itemRows[i]?.[1] === orderId) {
        deleteRequests.push({
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: i,
              endIndex: i + 1,
            },
          },
        });
      }
    }

    if (deleteRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { requests: deleteRequests },
      });
    }

    // Re-add items
    if (updates.items.length > 0) {
      const newItemRows = updates.items.map((item, i) => [
        `${orderId}-${i + 1}`,
        orderId,
        item.productName,
        item.category,
        item.qtyVials,
        item.pricePerVial,
        item.vialsPerKit,
      ]);

      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: "Order_Items!A:G",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: newItemRows },
      });
    }
  }
}

export async function deleteOrder(orderId: string): Promise<void> {
  const sheets = await getSheets();

  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
  });
  const ordersSheet = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === "Orders"
  );
  const orderItemsSheet = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === "Order_Items"
  );

  // Find and delete order row
  const ordersRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Orders!A:A",
  });
  const orderRows = ordersRes.data.values || [];
  const orderRowIndex = orderRows.findIndex((row) => row[0] === orderId);

  const deleteRequests = [];

  if (orderRowIndex !== -1) {
    deleteRequests.push({
      deleteDimension: {
        range: {
          sheetId: ordersSheet?.properties?.sheetId,
          dimension: "ROWS",
          startIndex: orderRowIndex,
          endIndex: orderRowIndex + 1,
        },
      },
    });
  }

  // Find and delete order item rows (in reverse)
  const itemsRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Order_Items!A:B",
  });
  const itemRows = itemsRes.data.values || [];
  for (let i = itemRows.length - 1; i >= 1; i--) {
    if (itemRows[i]?.[1] === orderId) {
      deleteRequests.push({
        deleteDimension: {
          range: {
            sheetId: orderItemsSheet?.properties?.sheetId,
            dimension: "ROWS",
            startIndex: i,
            endIndex: i + 1,
          },
        },
      });
    }
  }

  if (deleteRequests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: deleteRequests },
    });
  }
}

// ─── CONSOLIDATION ────────────────────────────────────────────────────────

export async function getConsolidationData() {
  const [products, allItems] = await Promise.all([
    getProducts(),
    getOrderItems(),
  ]);

  // Build product lookup
  const productMap = new Map(products.map((p) => [p.productName, p]));

  // Aggregate vials per product (only from non-cancelled orders)
  const orders = await getOrders();
  const activeOrderIds = new Set(
    orders.filter((o) => o.status !== "cancelled").map((o) => o.id)
  );

  const vialsByProduct = new Map<string, number>();
  for (const item of allItems) {
    if (!activeOrderIds.has(item.orderId)) continue;
    const current = vialsByProduct.get(item.productName) || 0;
    vialsByProduct.set(item.productName, current + item.qtyVials);
  }

  // Build consolidation rows
  const rows = [];
  for (const [productName, totalVials] of vialsByProduct.entries()) {
    if (totalVials === 0) continue;
    const product = productMap.get(productName);
    const vialsPerKit = product?.vialsPerKit || 1;
    const pricePerKit = product?.pricePerKit || 0;
    const category = product?.category || (allItems.find(i => i.productName === productName)?.category || "Unknown");
    const kitsNeeded = Math.ceil(totalVials / vialsPerKit);
    const openSlots = kitsNeeded * vialsPerKit - totalVials;

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

  // Category handling fees (from Pricelist — take first product per category)
  const categoryFees: Record<string, number> = {};
  for (const product of products) {
    if (!categoryFees[product.category]) {
      categoryFees[product.category] = product.handlingFee;
    }
  }

  const totalKits = rows.reduce((sum, r) => sum + r.kitsNeeded, 0);
  const totalCost = rows.reduce((sum, r) => sum + r.cost, 0);
  const activeCategories = new Set(rows.map((r) => r.category));
  const totalHandling = [...activeCategories].reduce(
    (sum, cat) => sum + (categoryFees[cat] || 0),
    0
  );

  return { rows, categoryFees, totalKits, totalCost, totalHandling };
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

export async function updateCategoryNote(category: string, note: string): Promise<void> {
  const sheets = await getSheets();
  // Try to find existing row
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "CategoryNotes!A:B",
  });
  const rows = res.data.values || [];
  const rowIndex = rows.findIndex((r) => r[0] === category);

  if (rowIndex === -1) {
    // Append new row (write header on first use)
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
