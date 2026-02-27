export interface Product {
  id: string; // row index as string
  category: string;
  productName: string;
  pricePerKit: number;
  pricePerVial: number;
  vialsPerKit: number;
  handlingFee: number;
  active: boolean;
}

export interface Order {
  id: string;
  customerName: string;
  telegramUsername: string;
  orderDate: string;
  status: OrderStatus;
}

export type OrderStatus = "pending" | "confirmed" | "delivered" | "cancelled";

export interface OrderItem {
  id: string;
  orderId: string;
  productName: string;
  category: string;
  qtyVials: number;
  pricePerVial: number;
  vialsPerKit: number;
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

export interface ConsolidationReport {
  rows: ConsolidationRow[];
  categoryFees: Record<string, number>;
  totalKits: number;
  totalCost: number;
  totalHandling: number;
}
