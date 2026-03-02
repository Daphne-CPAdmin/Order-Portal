"use client";

import { useState, useEffect, useCallback } from "react";
import { ConsolidationReport, Batch, OrderStatus } from "@/lib/types";

function formatPrice(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const CATEGORY_EMOJI: Record<string, string> = {
  "USP BAC": "💉",
  COSMETICS: "✨",
  SERUMS: "🧪",
  PENS: "🖊️",
  "TOPICAL RAWS": "🧴",
};

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-700",
  waiting:   "bg-orange-100 text-orange-700",
  paid:      "bg-blue-100 text-blue-700",
  fulfilled: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
  // backwards compat
  confirmed: "bg-orange-100 text-orange-700",
  delivered: "bg-green-100 text-green-700",
};

interface OrderRow {
  id: string;
  customerName: string;
  telegramUsername: string;
  orderDate: string;
  status: OrderStatus;
  batchId: string;
  categories: string[];
  totalVials: number;
  subtotal: number;
  grandTotal?: number;
  items: { productName: string; category: string; qtyVials: number; pricePerVial: number; handlingFee?: number }[];
}

interface ReminderResult {
  telegram: string;
  name: string;
  sent: boolean;
  reason?: string;
}

export default function Dashboard() {
  const [report, setReport] = useState<ConsolidationReport | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>("__all__");
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [error, setError] = useState("");
  const [newBatchName, setNewBatchName] = useState("");
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [showNewBatch, setShowNewBatch] = useState(false);
  const [copyText, setCopyText] = useState("");
  const [showCopy, setShowCopy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  // Reminders
  const [sendingReminders, setSendingReminders] = useState(false);
  const [reminderResults, setReminderResults] = useState<ReminderResult[] | null>(null);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [forwardedCategories, setForwardedCategories] = useState<Set<string>>(new Set());
  const [catCopied, setCatCopied] = useState<string | null>(null);
  const [categoryLocks, setCategoryLocks] = useState<Record<string, boolean>>({});
  const [lockingCategory, setLockingCategory] = useState<string | null>(null);

  const fetchBatches = useCallback(async () => {
    setBatchesLoading(true);
    try {
      const res = await fetch("/api/batches");
      if (res.ok) setBatches(await res.json());
    } finally {
      setBatchesLoading(false);
    }
  }, []);

  const fetchReport = useCallback(async (batchId: string) => {
    setLoading(true);
    setError("");
    try {
      const param = batchId === "__all__" ? "" : `?batch=${encodeURIComponent(batchId)}`;
      const res = await fetch(`/api/consolidation${param}`);
      if (!res.ok) throw new Error("Failed to fetch");
      setReport(await res.json());
    } catch {
      setError("Failed to load consolidation data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOrders = useCallback(async (batchId: string) => {
    setOrdersLoading(true);
    try {
      const param = batchId === "__all__" ? "" : `?batch=${encodeURIComponent(batchId)}`;
      const res = await fetch(`/api/orders${param}`);
      if (res.ok) setOrders(await res.json());
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  useEffect(() => {
    fetchReport(selectedBatch);
    fetchOrders(selectedBatch);
    if (selectedBatch !== "__all__") {
      fetch(`/api/category-locks?batch=${encodeURIComponent(selectedBatch)}`)
        .then((r) => r.json())
        .then(setCategoryLocks)
        .catch(() => {});
    } else {
      setCategoryLocks({});
    }
  }, [selectedBatch, fetchReport, fetchOrders]);

  async function handleCreateBatch() {
    if (!newBatchName.trim()) return;
    setCreatingBatch(true);
    try {
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newBatchName.trim() }),
      });
      if (res.ok) { setNewBatchName(""); setShowNewBatch(false); await fetchBatches(); }
    } finally { setCreatingBatch(false); }
  }

  async function handleSetActive(batchId: string) {
    setActivatingId(batchId);
    try {
      await fetch(`/api/batches/${batchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      await fetchBatches();
    } finally { setActivatingId(null); }
  }

  async function handleDeactivate(batchId: string) {
    setActivatingId(batchId);
    try {
      await fetch(`/api/batches/${batchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });
      await fetchBatches();
    } finally { setActivatingId(null); }
  }

  async function handleSendReminders() {
    const batchId = selectedBatch === "__all__" ? null : selectedBatch;
    if (!batchId) {
      alert("Please select a specific batch to send reminders.");
      return;
    }
    setSendingReminders(true);
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId }),
      });
      if (res.ok) {
        const data = await res.json();
        setReminderResults(data.results);
        setShowReminderModal(true);
      }
    } finally { setSendingReminders(false); }
  }

  async function handleToggleLock(category: string) {
    if (selectedBatch === "__all__") return;
    const newLocked = !categoryLocks[category];
    setLockingCategory(category);
    try {
      await fetch("/api/category-locks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: selectedBatch, category, locked: newLocked }),
      });
      setCategoryLocks((prev) => ({ ...prev, [category]: newLocked }));
    } finally {
      setLockingCategory(null);
    }
  }

  function handleCopyForVendor(category: string, rows: ConsolidationReport["rows"], cost: number) {
    const batchName = selectedBatch === "__all__"
      ? "All Batches"
      : (batches.find((b) => b.id === selectedBatch)?.name || "Unknown Batch");
    const emoji = CATEGORY_EMOJI[category] || "📦";
    const date = new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
    let text = `📦 VENDOR ORDER — ${emoji} ${category}\n`;
    text += `📅 ${date} · 🏷 ${batchName}\n\n`;
    for (const row of rows) {
      const slotNote = row.openSlots > 0 ? ` (${row.openSlots} open slots)` : " ✓";
      text += `• ${row.productName}: ${row.kitsNeeded} kit${row.kitsNeeded !== 1 ? "s" : ""}${slotNote}\n`;
      text += `  ₱${formatPrice(row.pricePerKit)}/kit → ₱${formatPrice(row.cost)}\n`;
    }
    text += `\n💰 Total: ₱${formatPrice(cost)}`;
    navigator.clipboard.writeText(text).then(() => {
      setCatCopied(category);
      setTimeout(() => setCatCopied(null), 2000);
    });
  }

  function handleMarkForwarded(category: string) {
    setForwardedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category); else next.add(category);
      return next;
    });
  }

  function buildCopySummary() {
    if (!report) return "";
    const batchName = selectedBatch === "__all__"
      ? "All Batches"
      : (batches.find((b) => b.id === selectedBatch)?.name || "Unknown Batch");
    const date = new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });

    const byCategory = new Map<string, ConsolidationReport["rows"]>();
    for (const row of report.rows) {
      if (!byCategory.has(row.category)) byCategory.set(row.category, []);
      byCategory.get(row.category)!.push(row);
    }

    let text = `📦 DEEJ HAULS — ${batchName.toUpperCase()}\n`;
    text += `📅 ${date}\n\n`;

    for (const [cat, rows] of byCategory) {
      const emoji = CATEGORY_EMOJI[cat] || "📦";
      text += `${emoji} ${cat}\n`;
      for (const row of rows) {
        const slotNote = row.openSlots > 0 ? ` (${row.openSlots} open slots)` : " ✓";
        text += `  • ${row.productName}: ${row.totalVials} ordered → ${row.kitsNeeded} kit${row.kitsNeeded !== 1 ? "s" : ""}${slotNote} — ₱${formatPrice(row.cost)}\n`;
      }
      text += "\n";
    }

    text += "─────────────────────\n";
    text += `🧮 Total kits: ${report.totalKits}\n`;
    text += `💰 Products: ₱${formatPrice(report.totalCost)}\n`;
    text += `📦 Handling: ₱${formatPrice(report.totalHandling)}\n`;
    text += `✅ Grand Total: ₱${formatPrice(report.totalCost + report.totalHandling)}`;

    return text;
  }

  function handleCopyClick() {
    setCopyText(buildCopySummary());
    setShowCopy(true);
    setCopied(false);
  }

  function handleCopyToClipboard() {
    navigator.clipboard.writeText(copyText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Derived stats ─────────────────────────────────────────────────────────
  const activeOrders    = orders.filter((o) => o.status !== "cancelled");
  const pendingOrders   = orders.filter((o) => o.status === "pending");
  const waitingOrders   = orders.filter((o) => o.status === "waiting" || (o.status as string) === "confirmed");
  const paidOrders      = orders.filter((o) => o.status === "paid");
  const fulfilledOrders = orders.filter((o) => o.status === "fulfilled" || (o.status as string) === "delivered");
  const cancelledOrders = orders.filter((o) => o.status === "cancelled");
  const totalRevenue    = activeOrders.reduce((s, o) => s + (o.grandTotal || o.subtotal), 0);

  const unpaidCollectibles  = [...pendingOrders, ...waitingOrders]
    .reduce((s, o) => s + (o.grandTotal || o.subtotal), 0);
  const paidCollectibles    = [...paidOrders, ...fulfilledOrders]
    .reduce((s, o) => s + (o.grandTotal || o.subtotal), 0);
  const totalCollectibles   = activeOrders
    .reduce((s, o) => s + (o.grandTotal || o.subtotal), 0);

  const byCategory = new Map<string, ConsolidationReport["rows"]>();
  if (report) {
    for (const row of report.rows) {
      if (!byCategory.has(row.category)) byCategory.set(row.category, []);
      byCategory.get(row.category)!.push(row);
    }
  }

  const activeBatch = batches.find((b) => b.status === "active");

  return (
    <div className="p-8 space-y-6">

      {/* ── Batch Management ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-700">Haul Batches</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {activeBatch
                ? <span>Active: <span className="text-emerald-600 font-semibold">{activeBatch.name}</span> — visible to customers</span>
                : "No active batch — customers cannot place orders"}
            </p>
          </div>
          <button
            onClick={() => setShowNewBatch(!showNewBatch)}
            className="px-3 py-1.5 bg-purple-600 text-white text-xs font-semibold rounded-lg hover:bg-purple-700 transition-colors"
          >
            + New Batch
          </button>
        </div>

        {showNewBatch && (
          <div className="px-5 py-3 border-b border-gray-100 bg-purple-50 flex gap-2">
            <input
              type="text"
              placeholder="e.g. Batch 01 · March 2026"
              value={newBatchName}
              onChange={(e) => setNewBatchName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateBatch()}
              className="flex-1 px-3 py-1.5 border border-purple-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
            <button
              onClick={handleCreateBatch}
              disabled={creatingBatch || !newBatchName.trim()}
              className="px-4 py-1.5 bg-purple-600 text-white text-sm rounded-lg disabled:opacity-50 font-medium"
            >
              {creatingBatch ? "Creating…" : "Create"}
            </button>
            <button onClick={() => setShowNewBatch(false)} className="px-3 py-1.5 text-gray-400 hover:text-gray-600 text-sm">Cancel</button>
          </div>
        )}

        {batchesLoading ? (
          <div className="px-5 py-4 text-sm text-gray-400">Loading batches…</div>
        ) : batches.length === 0 ? (
          <div className="px-5 py-4 text-sm text-gray-400">No batches yet. Create your first batch to get started.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {batches.map((batch) => (
              <div key={batch.id} className="px-5 py-3 flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">{batch.name}</span>
                    {batch.status === "active" && (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full uppercase tracking-wide">Active</span>
                    )}
                  </div>
                  {batch.createdDate && (
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Created {new Date(batch.createdDate).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  )}
                </div>
                {batch.status === "active" ? (
                  <button
                    onClick={() => handleDeactivate(batch.id)}
                    disabled={activatingId === batch.id}
                    className="px-3 py-1 text-xs text-gray-500 border border-gray-200 rounded-lg hover:border-gray-300 disabled:opacity-50"
                  >
                    {activatingId === batch.id ? "…" : "Deactivate"}
                  </button>
                ) : (
                  <button
                    onClick={() => handleSetActive(batch.id)}
                    disabled={activatingId === batch.id}
                    className="px-3 py-1 text-xs text-purple-700 border border-purple-200 bg-purple-50 rounded-lg hover:bg-purple-100 disabled:opacity-50"
                  >
                    {activatingId === batch.id ? "…" : "Set Active"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Batch selector + action bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Summary</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {selectedBatch === "__all__" ? "All batches" : (batches.find((b) => b.id === selectedBatch)?.name || selectedBatch)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedBatch}
            onChange={(e) => setSelectedBatch(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white"
          >
            <option value="__all__">All batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}{b.status === "active" ? " ★" : ""}</option>
            ))}
          </select>
          <button
            onClick={handleCopyClick}
            disabled={!report || report.rows.length === 0}
            className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            📋 Copy Summary
          </button>
          <button
            onClick={() => { fetchReport(selectedBatch); fetchOrders(selectedBatch); }}
            disabled={loading || ordersLoading}
            className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            {loading || ordersLoading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            onClick={handleSendReminders}
            disabled={sendingReminders || selectedBatch === "__all__" || orders.filter(o => o.status === "pending" || o.status === "waiting" || (o.status as string) === "confirmed").length === 0}
            className="px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-40 transition-colors"
            title={selectedBatch === "__all__" ? "Select a specific batch to send reminders" : ""}
          >
            {sendingReminders ? "Sending…" : "📣 Send Reminders"}
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      {!ordersLoading && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: "Total Orders",        value: orders.length,           color: "text-gray-900",   bg: "bg-white" },
            { label: "Pending",             value: pendingOrders.length,    color: "text-yellow-700", bg: "bg-yellow-50" },
            { label: "Waiting Confirmation",value: waitingOrders.length,    color: "text-orange-700", bg: "bg-orange-50" },
            { label: "Paid",                value: paidOrders.length,       color: "text-blue-700",   bg: "bg-blue-50" },
            { label: "Fulfilled",           value: fulfilledOrders.length,  color: "text-green-700",  bg: "bg-green-50" },
            { label: "Cancelled",           value: cancelledOrders.length,  color: "text-gray-500",   bg: "bg-gray-50" },
            { label: "Revenue",             value: `₱${formatPrice(totalRevenue)}`, color: "text-purple-700", bg: "bg-purple-50" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`${bg} rounded-xl border border-gray-200 px-4 py-3`}>
              <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-1">{label}</p>
              <p className={`text-xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Customer Orders Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-700">Customer Orders</h2>
          <span className="text-xs text-gray-400">{orders.length} order{orders.length !== 1 ? "s" : ""}</span>
        </div>

        {ordersLoading ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">Loading orders…</div>
        ) : orders.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            No orders{selectedBatch !== "__all__" ? " in this batch" : ""}.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {orders.map((order) => (
              <div key={order.id}>
                <div
                  className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                >
                  {/* Customer info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800 text-sm truncate">{order.customerName}</span>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${STATUS_COLORS[order.status]}`}>
                        {order.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{order.telegramUsername}</p>
                  </div>

                  {/* Categories */}
                  <div className="hidden sm:flex flex-wrap gap-1 max-w-[180px]">
                    {order.categories?.map((c) => (
                      <span key={c} className="px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded text-[10px] font-medium">
                        {CATEGORY_EMOJI[c] || ""} {c}
                      </span>
                    ))}
                  </div>

                  {/* Total */}
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900">₱{formatPrice(order.grandTotal || order.subtotal)}</p>
                    <p className="text-[10px] text-gray-400">
                      {new Date(order.orderDate).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                    </p>
                  </div>

                  {/* Expand chevron */}
                  <span className="text-gray-300 text-xs shrink-0">
                    {expandedOrder === order.id ? "▲" : "▾"}
                  </span>
                </div>

                {/* Expanded items — grouped by category with handling */}
                {expandedOrder === order.id && (() => {
                  // Group items by category
                  const catGroups = new Map<string, typeof order.items>();
                  for (const item of (order.items || [])) {
                    if (!catGroups.has(item.category)) catGroups.set(item.category, []);
                    catGroups.get(item.category)!.push(item);
                  }
                  return (
                    <div className="px-5 pb-4 bg-gray-50 border-t border-gray-100">
                      <div className="pt-3 space-y-3">
                        {Array.from(catGroups.entries()).map(([cat, items]) => {
                          const catSubtotal = items.reduce((s, i) => s + i.qtyVials * i.pricePerVial, 0);
                          const handling = items[0]?.handlingFee || 0;
                          return (
                            <div key={cat}>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                                {CATEGORY_EMOJI[cat] || "📦"} {cat}
                              </p>
                              <div className="space-y-0.5">
                                {items.map((item) => (
                                  <div key={item.productName} className="flex justify-between text-xs text-gray-600">
                                    <span>{item.productName}{item.qtyVials > 1 ? <span className="text-gray-400 ml-1">×{item.qtyVials}</span> : ""}</span>
                                    <span className="font-medium">₱{formatPrice(item.qtyVials * item.pricePerVial)}</span>
                                  </div>
                                ))}
                              </div>
                              <div className="mt-1 pt-1 border-t border-gray-200 space-y-0.5">
                                <div className="flex justify-between text-[10px] text-gray-400">
                                  <span>Subtotal</span>
                                  <span>₱{formatPrice(catSubtotal)}</span>
                                </div>
                                {handling > 0 && (
                                  <div className="flex justify-between text-[10px] text-gray-400">
                                    <span>Handling</span>
                                    <span>₱{formatPrice(handling)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between text-xs font-semibold text-gray-700">
                                  <span>Category Total</span>
                                  <span>₱{formatPrice(catSubtotal + handling)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div className="flex justify-between text-xs font-bold text-gray-900 border-t-2 border-gray-300 pt-2">
                          <span>Grand Total</span>
                          <span className="text-purple-700">₱{formatPrice(order.grandTotal || order.subtotal)}</span>
                        </div>
                        <p className="text-[10px] text-gray-400 font-mono">Order #{order.id}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Consolidation header ── */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Consolidation</h2>
        <p className="text-sm text-gray-500 mb-4">Aggregated product totals for all active (non-cancelled) orders</p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>
        )}

        {loading && !report && (
          <div className="text-center text-gray-400 py-12">Loading…</div>
        )}

        {report && (
          report.rows.length === 0 ? (
            <div className="text-center text-gray-400 py-12 bg-white rounded-xl border border-gray-200">
              No active orders{selectedBatch !== "__all__" ? " in this batch" : ""}.
            </div>
          ) : (
            <div className="space-y-4">
              {Array.from(byCategory.entries()).map(([category, rows]) => (
                <div key={category} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3 flex-wrap">
                    <h3 className="font-semibold text-gray-700 flex items-center gap-2 flex-1">
                      {CATEGORY_EMOJI[category] || "📦"} {category}
                      {forwardedCategories.has(category) && (
                        <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">✓ Forwarded</span>
                      )}
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-400">
                        Handling: ₱{formatPrice(report.categoryFees[category] || 0)}
                      </span>
                      {/* Lock/unlock payment for this category */}
                      {selectedBatch !== "__all__" && (
                        <button
                          onClick={() => handleToggleLock(category)}
                          disabled={lockingCategory === category}
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all border ${
                            categoryLocks[category]
                              ? "bg-rose-100 text-rose-700 border-rose-200 hover:bg-rose-200"
                              : "bg-white text-gray-500 border-gray-200 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200"
                          }`}
                          title={categoryLocks[category] ? "Payment open — click to lock" : "Click to open payment for this category"}
                        >
                          {lockingCategory === category ? "…" : categoryLocks[category] ? "🔓 Payment Open" : "🔒 Lock Payment"}
                        </button>
                      )}
                      <button
                        onClick={() => handleCopyForVendor(category, rows, report.categoryCosts[category] || 0)}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all border ${
                          catCopied === category
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-white text-purple-700 border-purple-200 hover:bg-purple-50"
                        }`}
                      >
                        {catCopied === category ? "✓ Copied!" : "📋 Copy for Vendor"}
                      </button>
                      <button
                        onClick={() => handleMarkForwarded(category)}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all border ${
                          forwardedCategories.has(category)
                            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                            : "bg-white text-gray-500 border-gray-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                        }`}
                      >
                        {forwardedCategories.has(category) ? "✓ Forwarded" : "Mark Forwarded"}
                      </button>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 border-b border-gray-100">
                        <th className="text-left px-5 py-2 font-medium">Product</th>
                        <th className="text-right px-5 py-2 font-medium">Total Ordered</th>
                        <th className="text-right px-5 py-2 font-medium">Kits Needed</th>
                        <th className="text-right px-5 py-2 font-medium">Open Slots</th>
                        <th className="text-right px-5 py-2 font-medium">Price/Kit</th>
                        <th className="text-right px-5 py-2 font-medium">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.productName} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-5 py-3 font-medium text-gray-800">{row.productName}</td>
                          <td className="px-5 py-3 text-right text-gray-600">{row.totalVials}</td>
                          <td className="px-5 py-3 text-right font-semibold text-gray-900">{row.kitsNeeded}</td>
                          <td className="px-5 py-3 text-right">
                            {row.openSlots === 0 ? (
                              <span className="text-emerald-600 font-semibold text-xs">Full ✓</span>
                            ) : (
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="text-indigo-500 font-semibold">{row.openSlots}</span>
                                {(() => {
                                  const vialsPerKit = row.kitsNeeded > 0
                                    ? Math.round((row.totalVials + row.openSlots) / row.kitsNeeded)
                                    : 1;
                                  const filledInLastKit = vialsPerKit - row.openSlots;
                                  const pct = Math.round((filledInLastKit / vialsPerKit) * 100);
                                  return (
                                    <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                                      <div className="h-full bg-indigo-300 rounded-full" style={{ width: `${pct}%` }} />
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right text-gray-600">₱{formatPrice(row.pricePerKit)}</td>
                          <td className="px-5 py-3 text-right font-medium text-gray-800">₱{formatPrice(row.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              {/* ── Incomplete kits ── */}
              {report.rows.some((r) => r.openSlots > 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-amber-200">
                    <h3 className="font-semibold text-amber-800 text-sm">⚠ Incomplete Kits</h3>
                    <p className="text-xs text-amber-600 mt-0.5">These products need more orders to fill their kits</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-amber-600 border-b border-amber-100 bg-amber-50">
                        <th className="text-left px-5 py-2 font-medium">Product</th>
                        <th className="text-right px-5 py-2 font-medium">Ordered</th>
                        <th className="text-right px-5 py-2 font-medium">Kit Size</th>
                        <th className="text-right px-5 py-2 font-medium">Open Slots</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.filter((r) => r.openSlots > 0).map((row) => {
                        const vialsPerKit = row.kitsNeeded > 0
                          ? Math.round((row.totalVials + row.openSlots) / row.kitsNeeded) : 1;
                        const pct = Math.round(((vialsPerKit - row.openSlots) / vialsPerKit) * 100);
                        return (
                          <tr key={row.productName} className="border-b border-amber-50 last:border-0">
                            <td className="px-5 py-2.5 font-medium text-amber-900">{row.productName}</td>
                            <td className="px-5 py-2.5 text-right text-amber-700">{row.totalVials}</td>
                            <td className="px-5 py-2.5 text-right text-amber-600">{vialsPerKit}/kit</td>
                            <td className="px-5 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-20 h-1.5 bg-amber-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-indigo-600 font-semibold text-xs">{row.openSlots} needed</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Per-category vendor costs ── */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-700 text-sm">Category Costs — Vendor Forwarding</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Total product cost per category to send to vendor</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {Object.entries(report.categoryCosts).map(([cat, cost]) => {
                    const catRows = byCategory.get(cat) || [];
                    return (
                      <div key={cat} className="px-5 py-3 flex items-center gap-3">
                        <span className="text-sm text-gray-700 font-medium flex-1 flex items-center gap-2">
                          {CATEGORY_EMOJI[cat] || "📦"} {cat}
                          {forwardedCategories.has(cat) && (
                            <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">✓ Forwarded</span>
                          )}
                        </span>
                        <span className="text-sm font-bold text-gray-900">₱{formatPrice(cost)}</span>
                        <button
                          onClick={() => handleCopyForVendor(cat, catRows, cost)}
                          className={`px-2 py-0.5 text-[10px] font-semibold rounded-lg border transition-all shrink-0 ${
                            catCopied === cat
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-white text-purple-600 border-purple-200 hover:bg-purple-50"
                          }`}
                        >
                          {catCopied === cat ? "✓" : "📋"}
                        </button>
                        <button
                          onClick={() => handleMarkForwarded(cat)}
                          className={`px-2 py-0.5 text-[10px] font-semibold rounded-lg border transition-all shrink-0 ${
                            forwardedCategories.has(cat)
                              ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                              : "bg-white text-gray-400 border-gray-200 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200"
                          }`}
                        >
                          {forwardedCategories.has(cat) ? "✓ Fwd" : "Fwd"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Grand totals ── */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Total Kits</p>
                    <p className="text-xl font-bold text-gray-900">{report.totalKits}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Product Cost</p>
                    <p className="text-xl font-bold text-gray-900">₱{formatPrice(report.totalCost)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Handling Confirmed (Paid)</p>
                    <p className="text-xl font-bold text-blue-700">₱{formatPrice(report.paidHandlingTotal)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Total Handling (All Orders)</p>
                    <p className="text-xl font-bold text-gray-900">₱{formatPrice(report.totalHandling)}</p>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
                  <p className="text-sm text-gray-500">Grand Total — products + handling</p>
                  <p className="text-2xl font-bold text-purple-700">
                    ₱{formatPrice(report.totalCost + report.totalHandling)}
                  </p>
                </div>

                {/* ── Collectibles summary ── */}
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Customer Collectibles</p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-amber-50 border border-amber-100 rounded-xl py-3 px-2">
                      <p className="text-[9px] text-amber-500 uppercase tracking-widest font-bold mb-1">Unpaid</p>
                      <p className="text-lg font-extrabold text-amber-700">₱{formatPrice(unpaidCollectibles)}</p>
                      <p className="text-[9px] text-amber-400 mt-0.5">
                        {pendingOrders.length + waitingOrders.length} order{pendingOrders.length + waitingOrders.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl py-3 px-2">
                      <p className="text-[9px] text-emerald-500 uppercase tracking-widest font-bold mb-1">Paid / Collected</p>
                      <p className="text-lg font-extrabold text-emerald-700">₱{formatPrice(paidCollectibles)}</p>
                      <p className="text-[9px] text-emerald-400 mt-0.5">
                        {paidOrders.length + fulfilledOrders.length} order{paidOrders.length + fulfilledOrders.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="bg-purple-50 border border-purple-100 rounded-xl py-3 px-2">
                      <p className="text-[9px] text-purple-500 uppercase tracking-widest font-bold mb-1">Total Collectibles</p>
                      <p className="text-lg font-extrabold text-purple-700">₱{formatPrice(totalCollectibles)}</p>
                      <p className="text-[9px] text-purple-400 mt-0.5">
                        {activeOrders.length} active order{activeOrders.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {/* ── Bot Sync / Webhook Info ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="font-semibold text-gray-700 text-sm">🤖 Telegram Bot Sync</h3>
          <p className="text-xs text-gray-400 mt-0.5">Auto-register customers when they message @pephaul_bot</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-800 space-y-2">
            <p className="font-bold">Step 1 — Set webhook (one-time setup)</p>
            <p className="font-mono text-[10px] bg-white border border-blue-100 rounded-lg px-3 py-2 break-all select-all text-blue-700">
              https://api.telegram.org/bot&#123;YOUR_TOKEN&#125;/setWebhook?url=https://deej-hauls.vercel.app/api/telegram/webhook&secret_token=&#123;TELEGRAM_WEBHOOK_SECRET&#125;
            </p>
            <p className="text-blue-600 text-[10px]">Set <code className="bg-white px-1 rounded">TELEGRAM_WEBHOOK_SECRET</code> in Vercel env vars for security.</p>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-800">
            <p className="font-bold mb-1">Step 2 — Tell customers to message the bot</p>
            <p>Ask customers to send <strong>/start</strong> to <strong>@pephaul_bot</strong> after placing their order. They will be automatically registered for Telegram reminders.</p>
          </div>
          <p className="text-[10px] text-gray-400">
            Registered customers appear in the <em>pephaulers</em> sheet and can receive payment reminders via the Send Reminders button.
          </p>
        </div>
      </div>

      {/* ── Copy summary modal ── */}
      {showCopy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Order Summary</h3>
              <button onClick={() => setShowCopy(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="p-5">
              <textarea
                readOnly
                value={copyText}
                className="w-full h-64 px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono text-gray-700 resize-none focus:outline-none bg-gray-50"
              />
            </div>
            <div className="px-5 pb-5">
              <button
                onClick={handleCopyToClipboard}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  copied ? "bg-emerald-500 text-white" : "bg-purple-600 hover:bg-purple-700 text-white"
                }`}
              >
                {copied ? "✓ Copied to clipboard!" : "Copy to Clipboard"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reminders result modal ── */}
      {showReminderModal && reminderResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">Reminders Sent</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {reminderResults.filter((r) => r.sent).length} of {reminderResults.length} sent successfully
                </p>
              </div>
              <button onClick={() => setShowReminderModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="p-5 max-h-96 overflow-y-auto space-y-2">
              {reminderResults.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No pending/confirmed orders to remind.</p>
              ) : reminderResults.map((r, i) => (
                <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${r.sent ? "bg-emerald-50" : "bg-gray-50"}`}>
                  <span className={`text-sm font-bold ${r.sent ? "text-emerald-600" : "text-gray-400"}`}>
                    {r.sent ? "✓" : "✗"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{r.name}</p>
                    <p className="text-xs text-gray-400">{r.telegram}</p>
                  </div>
                  {!r.sent && r.reason && (
                    <span className="text-[10px] text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full shrink-0">{r.reason}</span>
                  )}
                </div>
              ))}
            </div>
            <div className="px-5 pb-5 pt-3 border-t border-gray-100">
              <button
                onClick={() => setShowReminderModal(false)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
