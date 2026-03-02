export interface Product {
  id: string; // row index as string
  category: string;
  productName: string;
  pricePerKit: number;
  pricePerVial: number;
  vialsPerKit: number;
  handlingFee: number;
  active: boolean;
  useCase?: string;
  productFunction?: string;
}

export interface Order {
  id: string;
  customerName: string;
  telegramUsername: string;
  orderDate: string;
  status: OrderStatus;
  batchId: string;
  grandTotal?: number;
}

export interface Hauler {
  telegramUsername: string;
  chatId: string;
  updated: string;
  rowNumber: number;
}

export interface Batch {
  id: string;
  name: string;
  status: "active" | "closed";
  createdDate: string;
}

export type OrderStatus = "pending" | "waiting" | "paid" | "fulfilled" | "cancelled";

export interface OrderItem {
  id: string;
  orderId: string;
  productName: string;
  category: string;
  qtyVials: number;
  pricePerVial: number;
  vialsPerKit: number;
  handlingFee?: number;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
  handlingTotal: number;
  subtotal: number;
  grandTotal: number;
}

export interface ConsolidationRow {
  productName: string;
  category: string;
  totalVials: number;
  kitsNeeded: number;
  openSlots: number;
  pricePerKit: number;
  cost: number;
}

export interface CategoryLock {
  batchId: string;
  category: string;
  locked: boolean;
  lockedAt: string;
}

export interface ConsolidationReport {
  rows: ConsolidationRow[];
  categoryFees: Record<string, number>;
  categoryCosts: Record<string, number>;
  totalKits: number;
  totalCost: number;
  totalHandling: number;
  paidHandlingTotal: number;
}
