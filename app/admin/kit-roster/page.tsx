"use client";

import { useState, useEffect, useCallback } from "react";
import { Batch, OrderStatus } from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────────────────

interface KitHauler {
  orderId: string;
  customerName: string;
  telegramUsername: string;
  orderDate: string;
  status: OrderStatus;
  qtyVials: number;
  slotStart: number;
  slotEnd: number;
  kitSlotStart: number;
  kitSlotEnd: number;
}

interface Kit {
  kitNumber: number;
  capacity: number;
  filledVials: number;
  isFull: boolean;
  haulers: KitHauler[];
}

interface ProductRoster {
  productName: string;
  category: string;
  vialsPerKit: number;
  totalVials: number;
  kits: Kit[];
}

interface CategoryItem {
  productName: string;
  qtyVials: number;
  pricePerVial: number;
  categoryStatus?: string;
}

interface CategoryCustomer {
  orderId: string;
  customerName: string;
  telegramUsername: string;
  orderDate: string;
  status: OrderStatus;
  items: CategoryItem[];
  totalQty: number;
  subtotal: number;
}

interface CategoryRoster {
  category: string;
  customers: CategoryCustomer[];
  totalCustomers: number;
  totalQty: number;
  totalSubtotal: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const CATEGORY_EMOJI: Record<string, string> = {
  "USP BAC":      "💉",
  COSMETICS:      "✨",
  SERUMS:         "🧪",
  PENS:           "🖊️",
  "TOPICAL RAWS": "🧴",
};

const STATUS_COLORS: Record<string, string> = {
  pending:              "bg-yellow-100 text-yellow-700",
  waiting:              "bg-orange-100 text-orange-700",
  partially_paid:       "bg-indigo-100 text-indigo-700",
  paid:                 "bg-blue-100 text-blue-700",
  partially_fulfilled:  "bg-teal-100 text-teal-700",
  fulfilled:            "bg-green-100 text-green-700",
  cancelled:            "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  pending:              "Pending",
  waiting:              "Waiting",
  partially_paid:       "Partially Paid",
  paid:                 "Paid",
  partially_fulfilled:  "Partially Fulfilled",
  fulfilled:            "Fulfilled",
  cancelled:            "Cancelled",
};

const CAT_STATUS_COLORS: Record<string, string> = {
  pending:              "bg-gray-100 text-gray-500",
  partially_paid:       "bg-indigo-100 text-indigo-700",
  paid:                 "bg-blue-100 text-blue-700",
  partially_fulfilled:  "bg-teal-100 text-teal-700",
  fulfilled:            "bg-green-100 text-green-700",
};

const KIT_COLORS = [
  { bg: "bg-violet-50",  border: "border-violet-200", header: "bg-violet-100",  badge: "bg-violet-600 text-white",  text: "text-violet-700" },
  { bg: "bg-sky-50",     border: "border-sky-200",    header: "bg-sky-100",     badge: "bg-sky-600 text-white",     text: "text-sky-700" },
  { bg: "bg-emerald-50", border: "border-emerald-200",header: "bg-emerald-100", badge: "bg-emerald-600 text-white", text: "text-emerald-700" },
  { bg: "bg-amber-50",   border: "border-amber-200",  header: "bg-amber-100",   badge: "bg-amber-500 text-white",   text: "text-amber-700" },
  { bg: "bg-rose-50",    border: "border-rose-200",   header: "bg-rose-100",    badge: "bg-rose-600 text-white",    text: "text-rose-700" },
];

function kitColor(n: number) {
  return KIT_COLORS[(n - 1) % KIT_COLORS.length];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatPrice(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

type SortField = "customer" | "date" | "qty" | "subtotal" | "status";

function sortCustomers(customers: CategoryCustomer[], field: SortField, dir: "asc" | "desc"): CategoryCustomer[] {
  const sorted = [...customers].sort((a, b) => {
    let cmp = 0;
    if (field === "customer") cmp = a.customerName.localeCompare(b.customerName);
    else if (field === "date")     cmp = a.orderDate.localeCompare(b.orderDate);
    else if (field === "qty")      cmp = a.totalQty - b.totalQty;
    else if (field === "subtotal") cmp = a.subtotal - b.subtotal;
    else if (field === "status")   cmp = a.status.localeCompare(b.status);
    return dir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function KitRosterPage() {
  const [rosters, setRosters] = useState<ProductRoster[]>([]);
  const [categoryRosters, setCategoryRosters] = useState<CategoryRoster[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchFilter, setBatchFilter] = useState<string>("__active__");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"kits" | "customers">("customers");

  // Customer breakdown sort
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [catFilter, setCatFilter] = useState<string>("__all__");

  const activeBatch = batches.find((b) => b.status === "active");

  const effectiveBatchId =
    batchFilter === "__active__"
      ? activeBatch?.id
      : batchFilter === "__all__"
      ? undefined
      : batchFilter;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = effectiveBatchId ? `?batch=${effectiveBatchId}` : "";
      const [rosterRes, batchesRes] = await Promise.all([
        fetch(`/api/kit-roster${params}`),
        fetch("/api/batches"),
      ]);
      if (!rosterRes.ok) throw new Error("Failed to fetch roster");
      const data = await rosterRes.json();
      setRosters(data.products || []);
      setCategoryRosters(data.categories || []);
      if (batchesRes.ok) setBatches(await batchesRes.json());
    } catch (e) {
      setError("Failed to load kit roster.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [effectiveBatchId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const batchMap = new Map(batches.map((b) => [b.id, b.name]));
  const displayBatch =
    batchFilter === "__active__" ? (activeBatch ? batchMap.get(activeBatch.id) || activeBatch.id : "—")
    : batchFilter === "__all__" ? "All batches"
    : batchMap.get(batchFilter) || batchFilter;

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function SortIndicator({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="text-gray-300 ml-0.5">↕</span>;
    return <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const visibleCategoryRosters = catFilter === "__all__"
    ? categoryRosters
    : categoryRosters.filter((r) => r.category === catFilter);

  const hasAnyOrders = rosters.length > 0 || categoryRosters.length > 0;

  return (
    <div className="p-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kit Roster</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Who reserved which kit and what each customer ordered
          </p>
        </div>
        <button
          onClick={fetchData}
          className="text-xs text-gray-400 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          ↺ Refresh
        </button>
      </div>

      {/* Batch filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setBatchFilter("__active__")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            batchFilter === "__active__" ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Active batch
        </button>
        {batches.map((b) => (
          <button
            key={b.id}
            onClick={() => setBatchFilter(b.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              batchFilter === b.id ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {b.name || b.id}{b.status === "active" ? " ★" : ""}
          </button>
        ))}
        <button
          onClick={() => setBatchFilter("__all__")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            batchFilter === "__all__" ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          All batches
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-7 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("customers")}
          className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
            activeTab === "customers"
              ? "border-gray-800 text-gray-900"
              : "border-transparent text-gray-400 hover:text-gray-700"
          }`}
        >
          👥 Customer Breakdown
        </button>
        <button
          onClick={() => setActiveTab("kits")}
          className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
            activeTab === "kits"
              ? "border-gray-800 text-gray-900"
              : "border-transparent text-gray-400 hover:text-gray-700"
          }`}
        >
          📦 Kit Allocation
        </button>
      </div>

      {loading && (
        <div className="text-center text-gray-400 py-24">Loading kit roster…</div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm">{error}</div>
      )}

      {!loading && !error && !hasAnyOrders && (
        <div className="text-center text-gray-400 py-24 bg-white rounded-xl border border-gray-200">
          No orders found for <strong>{displayBatch}</strong>.
        </div>
      )}

      {/* ── Customer Breakdown Tab ── */}
      {!loading && !error && activeTab === "customers" && (
        <div>
          {/* Category filter pills */}
          {categoryRosters.length > 1 && (
            <div className="flex gap-2 mb-5 flex-wrap">
              <button
                onClick={() => setCatFilter("__all__")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  catFilter === "__all__" ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                All categories
              </button>
              {categoryRosters.map((r) => (
                <button
                  key={r.category}
                  onClick={() => setCatFilter(r.category)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    catFilter === r.category ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {CATEGORY_EMOJI[r.category] || ""} {r.category}
                  <span className={`ml-1.5 font-bold ${catFilter === r.category ? "text-white/70" : "text-gray-400"}`}>
                    {r.totalCustomers}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Sort controls */}
          <div className="flex items-center gap-2 mb-4 text-[11px] text-gray-400">
            <span className="font-medium uppercase tracking-widest">Sort:</span>
            {(["customer", "date", "qty", "subtotal", "status"] as SortField[]).map((f) => (
              <button
                key={f}
                onClick={() => handleSort(f)}
                className={`px-2 py-1 rounded-md capitalize transition-colors ${
                  sortField === f
                    ? "bg-gray-800 text-white font-semibold"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {f} {sortField === f ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </button>
            ))}
          </div>

          {visibleCategoryRosters.length === 0 ? (
            <div className="text-center text-gray-400 py-20 bg-white rounded-xl border border-gray-200">
              No orders found for <strong>{displayBatch}</strong>.
            </div>
          ) : (
            <div className="space-y-8">
              {visibleCategoryRosters.map((roster) => {
                const emoji = CATEGORY_EMOJI[roster.category] || "";
                const sorted = sortCustomers(roster.customers, sortField, sortDir);
                return (
                  <div key={roster.category}>
                    {/* Category header */}
                    <div className="flex items-center gap-3 mb-3">
                      <h2 className="text-base font-bold text-gray-800">
                        {emoji} {roster.category}
                      </h2>
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold">
                        {roster.totalCustomers} customer{roster.totalCustomers !== 1 ? "s" : ""}
                      </span>
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold">
                        {roster.totalQty} total qty
                      </span>
                      <span className="text-xs text-gray-400 font-mono">
                        ₱{formatPrice(roster.totalSubtotal)}
                      </span>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[10px] text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-200">
                            <th className="text-left px-5 py-2.5 font-medium w-6">#</th>
                            <th
                              className="text-left px-3 py-2.5 font-medium cursor-pointer hover:text-gray-700 select-none"
                              onClick={() => handleSort("customer")}
                            >
                              Customer <SortIndicator field="customer" />
                            </th>
                            <th className="text-left px-3 py-2.5 font-medium hidden sm:table-cell">Telegram</th>
                            <th
                              className="text-left px-3 py-2.5 font-medium hidden md:table-cell cursor-pointer hover:text-gray-700 select-none"
                              onClick={() => handleSort("date")}
                            >
                              Date <SortIndicator field="date" />
                            </th>
                            <th className="text-left px-3 py-2.5 font-medium">Items</th>
                            <th
                              className="text-center px-3 py-2.5 font-medium cursor-pointer hover:text-gray-700 select-none"
                              onClick={() => handleSort("qty")}
                            >
                              Qty <SortIndicator field="qty" />
                            </th>
                            <th
                              className="text-right px-3 py-2.5 font-medium hidden sm:table-cell cursor-pointer hover:text-gray-700 select-none"
                              onClick={() => handleSort("subtotal")}
                            >
                              Subtotal <SortIndicator field="subtotal" />
                            </th>
                            <th
                              className="text-left px-3 py-2.5 font-medium cursor-pointer hover:text-gray-700 select-none"
                              onClick={() => handleSort("status")}
                            >
                              Status <SortIndicator field="status" />
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((customer, idx) => {
                            return (
                              <tr
                                key={customer.orderId}
                                className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
                              >
                                <td className="px-5 py-3 text-xs font-bold text-gray-300">{idx + 1}</td>
                                <td className="px-3 py-3 font-semibold text-gray-800">{customer.customerName}</td>
                                <td className="px-3 py-3 text-gray-400 text-xs font-mono hidden sm:table-cell">
                                  {customer.telegramUsername}
                                </td>
                                <td className="px-3 py-3 text-gray-400 text-xs hidden md:table-cell whitespace-nowrap">
                                  {formatDate(customer.orderDate)}
                                </td>
                                <td className="px-3 py-3 text-xs text-gray-600 max-w-xs">
                                  {customer.items.map((item, i) => (
                                    <div key={i} className="flex items-center gap-1 leading-snug">
                                      <span className="font-medium text-gray-700">{item.productName}</span>
                                      <span className="text-gray-400">×{item.qtyVials}</span>
                                      {item.categoryStatus && item.categoryStatus !== "pending" && (
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${CAT_STATUS_COLORS[item.categoryStatus] || "bg-gray-100 text-gray-400"}`}>
                                          {item.categoryStatus.replace("_", " ")}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <span className="font-bold text-gray-800">{customer.totalQty}</span>
                                </td>
                                <td className="px-3 py-3 text-right text-gray-600 text-xs font-medium hidden sm:table-cell">
                                  ₱{formatPrice(customer.subtotal)}
                                </td>
                                <td className="px-3 py-3">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[customer.status] || "bg-gray-100 text-gray-500"}`}>
                                    {STATUS_LABELS[customer.status] || customer.status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        {/* Total row */}
                        <tfoot>
                          <tr className="bg-gray-50 border-t-2 border-gray-200">
                            <td className="px-5 py-2.5" />
                            <td className="px-3 py-2.5 text-xs font-bold text-gray-700 uppercase tracking-wide" colSpan={3}>
                              Total — {roster.totalCustomers} customer{roster.totalCustomers !== 1 ? "s" : ""}
                            </td>
                            <td className="px-3 py-2.5" />
                            <td className="px-3 py-2.5 text-center text-sm font-bold text-gray-900">
                              {roster.totalQty}
                            </td>
                            <td className="px-3 py-2.5 text-right text-sm font-bold text-gray-900 hidden sm:table-cell">
                              ₱{formatPrice(roster.totalSubtotal)}
                            </td>
                            <td className="px-3 py-2.5" />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Kit Allocation Tab ── */}
      {!loading && !error && activeTab === "kits" && (
        <div>
          {rosters.length === 0 ? (
            <div className="text-center text-gray-400 py-24 bg-white rounded-xl border border-gray-200">
              No kit-based orders found for <strong>{displayBatch}</strong>.
            </div>
          ) : (
            rosters.map((roster) => {
              const emoji = CATEGORY_EMOJI[roster.category] || "";
              return (
                <div key={roster.productName} className="mb-10">

                  {/* Product header */}
                  <div className="flex items-baseline gap-3 mb-3">
                    <h2 className="text-base font-bold text-gray-800">
                      {emoji} {roster.productName}
                    </h2>
                    <span className="text-xs text-gray-400 font-mono">
                      {roster.totalVials} / {roster.vialsPerKit} vials per kit
                    </span>
                    <span className="text-xs font-semibold text-gray-500">
                      {roster.kits.length} kit{roster.kits.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Kits */}
                  <div className="space-y-4">
                    {roster.kits.map((kit) => {
                      const color = kitColor(kit.kitNumber);
                      const fillPct = Math.min(100, Math.round((kit.filledVials / kit.capacity) * 100));
                      return (
                        <div key={kit.kitNumber} className={`rounded-2xl border ${color.border} ${color.bg} overflow-hidden`}>

                          {/* Kit header */}
                          <div className={`${color.header} px-5 py-3 flex items-center justify-between`}>
                            <div className="flex items-center gap-2.5">
                              <span className={`${color.badge} text-xs font-bold px-2.5 py-1 rounded-full`}>
                                Kit {kit.kitNumber}
                              </span>
                              {kit.isFull ? (
                                <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                  ✓ Full
                                </span>
                              ) : (
                                <span className="text-xs text-gray-500">
                                  {kit.capacity - kit.filledVials} slots open
                                </span>
                              )}
                              <span className="text-xs text-gray-500">
                                {kit.filledVials}/{kit.capacity} vials
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-28 h-1.5 bg-white/60 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${kit.isFull ? "bg-emerald-500" : color.badge.split(" ")[0]}`}
                                  style={{ width: `${fillPct}%` }}
                                />
                              </div>
                              <span className="text-xs font-semibold text-gray-600">{fillPct}%</span>
                            </div>
                          </div>

                          {/* Haulers table */}
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-[10px] text-gray-400 uppercase tracking-wider border-b border-gray-200/60">
                                <th className="text-left px-5 py-2 font-medium w-6">#</th>
                                <th className="text-left px-3 py-2 font-medium">Customer</th>
                                <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Telegram</th>
                                <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Reserved</th>
                                <th className="text-center px-3 py-2 font-medium">Qty</th>
                                <th className="text-center px-3 py-2 font-medium hidden sm:table-cell">Slots</th>
                                <th className="text-left px-3 py-2 font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {kit.haulers.map((h, idx) => (
                                <tr
                                  key={`${h.orderId}-${h.kitSlotStart}`}
                                  className="border-b border-gray-200/40 last:border-0 hover:bg-white/50 transition-colors"
                                >
                                  <td className="px-5 py-2.5 text-xs font-bold text-gray-400">{idx + 1}</td>
                                  <td className="px-3 py-2.5 font-semibold text-gray-800">{h.customerName}</td>
                                  <td className="px-3 py-2.5 text-gray-500 text-xs hidden sm:table-cell font-mono">{h.telegramUsername}</td>
                                  <td className="px-3 py-2.5 text-gray-400 text-xs hidden md:table-cell whitespace-nowrap">
                                    {formatDate(h.orderDate)}
                                  </td>
                                  <td className="px-3 py-2.5 text-center">
                                    <span className={`inline-block font-bold text-sm ${color.text}`}>{h.qtyVials}</span>
                                  </td>
                                  <td className="px-3 py-2.5 text-center hidden sm:table-cell">
                                    <span className="text-xs text-gray-400 font-mono">
                                      {h.kitSlotStart}–{h.kitSlotEnd}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[h.status] || "bg-gray-100 text-gray-500"}`}>
                                      {STATUS_LABELS[h.status] || h.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>

                        </div>
                      );
                    })}
                  </div>

                </div>
              );
            })
          )}
        </div>
      )}

    </div>
  );
}
