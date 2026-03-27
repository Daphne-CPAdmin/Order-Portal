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

export type OrderStatus = "pending" | "waiting" | "partially_paid" | "paid" | "partially_fulfilled" | "fulfilled" | "cancelled";

export type CategoryStatus = "pending" | "partially_paid" | "paid" | "partially_fulfilled" | "fulfilled";

export interface OrderItem {
  id: string;
  orderId: string;
  productName: string;
  category: string;
  qtyVials: number;
  pricePerVial: number;
  vialsPerKit: number;
  handlingFee?: number;
  categoryStatus?: CategoryStatus;
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

export interface AppSettings {
  moq: Record<string, { qty: number; unit: string }>;
  handlingFees: {
    pens:        { baseFee: number; tierSize: number; tierIncrement: number };
    uspBac:      { tierSize: number; feePerTier: number };
    topicalRaws: { baseFee: number; varietyThreshold: number; perVarietyIncrement: number };
    cosmetics:   { bulkThreshold: number; bulkDiscount: number };
  };
}

export interface ShippingDetails {
  telegramUsername: string;
  fullName: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  zip: string;
  notes?: string;
  updatedAt?: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  moq: {
    "USP BAC":      { qty: 100, unit: "ampoules" },
    COSMETICS:      { qty: 30,  unit: "boxes" },
    SERUMS:         { qty: 10,  unit: "kits" },
    PENS:           { qty: 30,  unit: "pens" },
    "TOPICAL RAWS": { qty: 50,  unit: "g total" },
  },
  handlingFees: {
    pens:        { baseFee: 150, tierSize: 5,  tierIncrement: 50 },
    uspBac:      { tierSize: 50, feePerTier: 50 },
    topicalRaws: { baseFee: 150, varietyThreshold: 10, perVarietyIncrement: 50 },
    cosmetics:   { bulkThreshold: 3, bulkDiscount: 100 },
  },
};
