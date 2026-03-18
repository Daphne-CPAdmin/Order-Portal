"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { OrderStatus, OrderItem, Batch } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────────────────

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
  firstKitCategories: string[];
}

interface OrderDetail extends OrderRow {
  items: OrderItem[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: OrderStatus[] = ["pending", "waiting", "paid", "fulfilled", "cancelled"];

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

const CATEGORY_EMOJI: Record<string, string> = {
  "USP BAC": "💉",
  COSMETICS: "✨",
  SERUMS: "🧪",
  PENS: "🖊️",
  "TOPICAL RAWS": "🧴",
};

function formatPrice(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [batchFilter, setBatchFilter] = useState<string>("__all__");
  const [search, setSearch] = useState("");
  const [kit1Only, setKit1Only] = useState(false);

  // Side panel
  const [panelOrder, setPanelOrder] = useState<OrderDetail | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState("");
  const [panelSuccess, setPanelSuccess] = useState("");

  // Edit state
  const [editName, setEditName] = useState("");
  const [editTelegram, setEditTelegram] = useState("");
  const [editStatus, setEditStatus] = useState<OrderStatus>("pending");
  const [editQtys, setEditQtys] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [quickStatusSaving, setQuickStatusSaving] = useState<OrderStatus | null>(null);
  const [updatingCatKey, setUpdatingCatKey] = useState<string | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, batchesRes] = await Promise.all([
        fetch("/api/orders"),
        fetch("/api/batches"),
      ]);
      if (ordersRes.ok) setOrders(await ordersRes.json());
      if (batchesRes.ok) setBatches(await batchesRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  async function openPanel(orderId: string) {
    setPanelError("");
    setPanelSuccess("");
    setPanelLoading(true);
    setPanelOrder(null);
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data: OrderDetail = await res.json();
      setPanelOrder(data);
      setEditName(data.customerName);
      setEditTelegram(data.telegramUsername);
      setEditStatus(data.status);
      const qtys: Record<string, number> = {};
      for (const item of data.items) qtys[item.id] = item.qtyVials;
      setEditQtys(qtys);
    } catch {
      setPanelError("Failed to load order details.");
    } finally {
      setPanelLoading(false);
    }
  }

  function closePanel() {
    setPanelOrder(null);
    setPanelLoading(false);
    setPanelError("");
    setPanelSuccess("");
    setShowDeleteConfirm(false);
  }

  // ── Panel actions ──────────────────────────────────────────────────────────

  async function handleSave() {
    if (!panelOrder) return;
    setSaving(true);
    setPanelError("");
    setPanelSuccess("");
    try {
      const updatedItems = panelOrder.items.map((item) => ({
        productName: item.productName,
        category: item.category,
        qtyVials: editQtys[item.id] ?? item.qtyVials,
        pricePerVial: item.pricePerVial,
        vialsPerKit: item.vialsPerKit,
      }));
      const res = await fetch(`/api/orders/${panelOrder.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: editName,
          telegramUsername: editTelegram,
          status: editStatus,
          items: updatedItems,
        }),
      });
      if (res.ok) {
        setPanelSuccess("Saved successfully.");
        // Refresh list
        setOrders((prev) =>
          prev.map((o) =>
            o.id === panelOrder.id
              ? { ...o, customerName: editName, telegramUsername: editTelegram, status: editStatus }
              : o
          )
        );
      } else {
        const d = await res.json();
        setPanelError(d.error || "Failed to save.");
      }
    } catch {
      setPanelError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!panelOrder) return;
    setCancelling(true);
    setPanelError("");
    setPanelSuccess("");
    try {
      const res = await fetch(`/api/orders/${panelOrder.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: editName,
          telegramUsername: editTelegram,
          status: "cancelled",
        }),
      });
      if (res.ok) {
        setEditStatus("cancelled");
        setPanelSuccess("Order cancelled.");
        setOrders((prev) =>
          prev.map((o) => (o.id === panelOrder.id ? { ...o, status: "cancelled" } : o))
        );
      } else {
        setPanelError("Failed to cancel.");
      }
    } catch {
      setPanelError("Network error.");
    } finally {
      setCancelling(false);
    }
  }

  async function handleRemind() {
    if (!panelOrder) return;
    setReminding(true);
    setPanelError("");
    setPanelSuccess("");
    try {
      const res = await fetch(`/api/orders/${panelOrder.id}/remind`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setPanelSuccess(`Reminder sent to ${panelOrder.telegramUsername} via @pephaul_bot.`);
      } else {
        setPanelError(data.error || "Failed to send reminder.");
      }
    } catch {
      setPanelError("Network error.");
    } finally {
      setReminding(false);
    }
  }

  async function handleQuickStatus(newStatus: OrderStatus) {
    if (!panelOrder) return;
    setQuickStatusSaving(newStatus);
    setPanelError("");
    setPanelSuccess("");
    try {
      const res = await fetch(`/api/orders/${panelOrder.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName: editName, telegramUsername: editTelegram, status: newStatus }),
      });
      if (res.ok) {
        setEditStatus(newStatus);
        setPanelSuccess(`Status updated to "${newStatus}".`);
        setOrders((prev) =>
          prev.map((o) => (o.id === panelOrder.id ? { ...o, status: newStatus } : o))
        );
      } else {
        const d = await res.json();
        setPanelError(d.error || "Failed to update status.");
      }
    } catch {
      setPanelError("Network error.");
    } finally {
      setQuickStatusSaving(null);
    }
  }

  async function handleCategoryStatus(orderId: string, category: string, status: string) {
    const catKey = `${orderId}:${category}`;
    setUpdatingCatKey(catKey);
    setPanelError("");
    setPanelSuccess("");
    try {
      const res = await fetch(`/api/orders/${orderId}/category-status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, status }),
      });
      if (res.ok) {
        setPanelSuccess(`${category} marked as ${status}.`);
        setPanelOrder((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((i) =>
              i.category === category ? { ...i, categoryStatus: status } : i
            ),
            status: status === "paid" && prev.items.every((i) => i.category === category || i.categoryStatus === "paid")
              ? "paid"
              : status === "waiting" || status === "paid"
                ? "waiting"
                : prev.status,
          };
        });
        setOrders((prev) =>
          prev.map((o) => {
            if (o.id !== orderId) return o;
            return { ...o, status: status === "paid" ? "waiting" : o.status };
          })
        );
      } else {
        const d = await res.json();
        setPanelError(d.error || "Failed to update.");
      }
    } catch {
      setPanelError("Network error.");
    } finally {
      setUpdatingCatKey(null);
    }
  }

  async function handleDelete() {
    if (!panelOrder) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/orders/${panelOrder.id}`, { method: "DELETE" });
      if (res.ok) {
        setOrders((prev) => prev.filter((o) => o.id !== panelOrder.id));
        closePanel();
      } else {
        setPanelError("Failed to delete.");
        setDeleting(false);
      }
    } catch {
      setPanelError("Network error.");
      setDeleting(false);
    }
  }

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filtered = orders.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (batchFilter !== "__all__" && o.batchId !== batchFilter) return false;
    if (kit1Only && (!o.firstKitCategories || o.firstKitCategories.length === 0)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!o.customerName.toLowerCase().includes(q) && !o.telegramUsername.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const batchMap = new Map(batches.map((b) => [b.id, b.name]));

  // ── Summary stats ──────────────────────────────────────────────────────────

  const summaryStats = useMemo(() => {
    const active = filtered.filter((o) => o.status !== "cancelled");
    const total = (o: OrderRow) => o.grandTotal || o.subtotal;
    return {
      totalOrders: filtered.length,
      productCollectibles: active.reduce((s, o) => s + o.subtotal, 0),
      handlingFeeCollectibles: active.reduce((s, o) => s + Math.max(0, (o.grandTotal || o.subtotal) - o.subtotal), 0),
      paidAmount:    filtered.filter((o) => o.status === "paid").reduce((s, o) => s + total(o), 0),
      waitingAmount: filtered.filter((o) => o.status === "waiting").reduce((s, o) => s + total(o), 0),
      unpaidAmount:  filtered.filter((o) => o.status === "pending").reduce((s, o) => s + total(o), 0),
      statusCounts: STATUS_OPTIONS.reduce((acc, s) => {
        acc[s] = filtered.filter((o) => o.status === s).length;
        return acc;
      }, {} as Record<string, number>),
    };
  }, [filtered]);

  // Computed totals in panel
  const panelSubtotal = panelOrder?.items.reduce(
    (sum, item) => sum + (editQtys[item.id] ?? item.qtyVials) * item.pricePerVial, 0
  ) ?? 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full">

      {/* ── Main orders list ── */}
      <div className={`flex-1 overflow-auto p-8 transition-all ${panelOrder || panelLoading ? "lg:pr-4" : ""}`}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
            <p className="text-sm text-gray-500 mt-0.5">{filtered.length} of {orders.length} orders</p>
          </div>
        </div>

        {/* Summary cards */}
        {!loading && orders.length > 0 && (
          <div className="mb-6 space-y-3">

            {/* Row 1: order count + financial overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Orders</p>
                <p className="text-2xl font-bold text-gray-900">{summaryStats.totalOrders}</p>
                {(statusFilter !== "all" || batchFilter !== "__all__" || search || kit1Only) && (
                  <p className="text-[10px] text-gray-400 mt-0.5">of {orders.length} total</p>
                )}
              </div>
              <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Product Collectibles</p>
                <p className="text-xl font-bold text-gray-900">₱{formatPrice(summaryStats.productCollectibles)}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">products only</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Handling Fees</p>
                <p className="text-xl font-bold text-gray-900">₱{formatPrice(summaryStats.handlingFeeCollectibles)}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">fees collectible</p>
              </div>
              <div className="bg-purple-50 rounded-xl border border-purple-100 px-4 py-3">
                <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1">Grand Total</p>
                <p className="text-xl font-bold text-purple-700">₱{formatPrice(summaryStats.productCollectibles + summaryStats.handlingFeeCollectibles)}</p>
                <p className="text-[10px] text-purple-400 mt-0.5">all collectibles</p>
              </div>
            </div>

            {/* Row 2: payment status breakdown */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-blue-50 rounded-xl border border-blue-100 px-4 py-3">
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Paid</p>
                <p className="text-xl font-bold text-blue-700">₱{formatPrice(summaryStats.paidAmount)}</p>
                <p className="text-[10px] text-blue-400 mt-0.5">{summaryStats.statusCounts.paid} order{summaryStats.statusCounts.paid !== 1 ? "s" : ""}</p>
              </div>
              <div className="bg-orange-50 rounded-xl border border-orange-100 px-4 py-3">
                <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-1">Waiting</p>
                <p className="text-xl font-bold text-orange-700">₱{formatPrice(summaryStats.waitingAmount)}</p>
                <p className="text-[10px] text-orange-400 mt-0.5">{summaryStats.statusCounts.waiting} order{summaryStats.statusCounts.waiting !== 1 ? "s" : ""}</p>
              </div>
              <div className="bg-yellow-50 rounded-xl border border-yellow-100 px-4 py-3">
                <p className="text-[10px] font-bold text-yellow-500 uppercase tracking-widest mb-1">Unpaid</p>
                <p className="text-xl font-bold text-yellow-700">₱{formatPrice(summaryStats.unpaidAmount)}</p>
                <p className="text-[10px] text-yellow-500 mt-0.5">{summaryStats.statusCounts.pending} order{summaryStats.statusCounts.pending !== 1 ? "s" : ""}</p>
              </div>
            </div>

            {/* Row 3: all status counts */}
            <div className="flex gap-2 flex-wrap">
              {STATUS_OPTIONS.map((s) => (
                <div key={s} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${STATUS_COLORS[s]}`}>
                  <span className="capitalize">{s}</span>
                  <span className="bg-white/60 rounded-full px-1.5 font-bold">{summaryStats.statusCounts[s]}</span>
                </div>
              ))}
            </div>

          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3 mb-5 flex-wrap items-center">
          <input
            type="text"
            placeholder="Search name or @username…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 w-56"
          />
          <select
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white"
          >
            <option value="__all__">All batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}{b.status === "active" ? " ★" : ""}</option>
            ))}
          </select>
          <div className="flex gap-1">
            {(["all", ...STATUS_OPTIONS] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s as OrderStatus | "all")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize ${
                  statusFilter === s ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>
          <button
            onClick={() => setKit1Only((v) => !v)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              kit1Only ? "bg-amber-400 text-amber-900" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            title="Show only orders with items in Kit 1"
          >
            🥇 Kit 1
          </button>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-20">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-400 py-20 bg-white rounded-xl border border-gray-200">No orders found.</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-5 py-3 font-medium">Customer</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Telegram</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Batch</th>
                  <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Date</th>
                  <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Categories / Kit</th>
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => {
                  const isActive = panelOrder?.id === order.id;
                  return (
                    <tr
                      key={order.id}
                      className={`border-b border-gray-50 transition-colors ${
                        isActive ? "bg-purple-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="px-5 py-3 font-medium text-gray-800">{order.customerName}</td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{order.telegramUsername}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {order.batchId ? (
                          <span className="text-xs text-purple-700 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full font-medium">
                            {batchMap.get(order.batchId) || order.batchId}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">
                        {new Date(order.orderDate).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {order.categories?.map((c) => (
                            <span key={c} className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded-full text-xs font-medium">
                              {CATEGORY_EMOJI[c] || ""} {c}
                            </span>
                          ))}
                          {order.firstKitCategories?.map((c) => (
                            <span key={`k1-${c}`} className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold" title={`${c}: order is in Kit 1`}>
                              🥇 {c}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">
                        ₱{formatPrice(order.grandTotal || order.subtotal)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[order.status]}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => isActive ? closePanel() : openPanel(order.id)}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                            isActive
                              ? "bg-purple-100 text-purple-700"
                              : "text-purple-600 hover:bg-purple-50"
                          }`}
                        >
                          {isActive ? "Close" : "View →"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Side panel ── */}
      {(panelOrder || panelLoading) && (
        <div className="w-full lg:w-[420px] shrink-0 border-l border-gray-200 bg-white flex flex-col h-full overflow-hidden fixed inset-0 lg:static z-40 lg:z-auto">

          {/* Panel header */}
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <div>
              {panelOrder ? (
                <>
                  <h2 className="font-bold text-gray-900 truncate">{panelOrder.customerName}</h2>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">{panelOrder.telegramUsername}</p>
                </>
              ) : (
                <h2 className="font-bold text-gray-400">Loading…</h2>
              )}
            </div>
            <button
              onClick={closePanel}
              className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-xl leading-none transition-colors"
            >×</button>
          </div>

          {panelLoading && (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading order…</div>
          )}

          {panelOrder && !panelLoading && (
            <div className="flex-1 overflow-y-auto">

              {/* Alerts */}
              {(panelError || panelSuccess) && (
                <div className={`mx-5 mt-4 px-4 py-3 rounded-lg text-sm ${
                  panelError ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                }`}>
                  {panelError || panelSuccess}
                </div>
              )}

              <div className="p-5 space-y-5">

                {/* Customer info */}
                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Customer</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Name</label>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Telegram</label>
                      <input
                        value={editTelegram}
                        onChange={(e) => setEditTelegram(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400">
                    Placed {new Date(panelOrder.orderDate).toLocaleString("en-PH", {
                      month: "short", day: "numeric", year: "numeric",
                      hour: "2-digit", minute: "2-digit"
                    })}
                  </p>
                  {panelOrder.firstKitCategories?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {panelOrder.firstKitCategories.map((c) => (
                        <span key={c} className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-semibold">
                          🥇 Kit 1 — {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Status */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</p>
                  <div className="flex gap-2 flex-wrap">
                    {STATUS_OPTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => setEditStatus(s)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-all ${
                          editStatus === s
                            ? STATUS_COLORS[s] + " ring-2 ring-offset-1 ring-current"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Items — grouped by category with per-category payment status */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Items</p>
                  {(() => {
                    const itemsByCat = new Map<string, OrderItem[]>();
                    for (const item of panelOrder.items) {
                      if (!itemsByCat.has(item.category)) itemsByCat.set(item.category, []);
                      itemsByCat.get(item.category)!.push(item);
                    }
                    return (
                      <div className="space-y-2">
                        {[...itemsByCat.entries()].map(([cat, catItems]) => {
                          const catStatus = catItems[0]?.categoryStatus || "pending";
                          const catKey = `${panelOrder.id}:${cat}`;
                          const catSubtotal = catItems.reduce((s, i) => s + (editQtys[i.id] ?? i.qtyVials) * i.pricePerVial, 0);
                          return (
                            <div key={cat} className="bg-gray-50 rounded-xl overflow-hidden border border-gray-100">
                              {/* Category header */}
                              <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200">
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{CATEGORY_EMOJI[cat] || ""} {cat}</span>
                                <div className="flex items-center gap-1.5">
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                    catStatus === "paid"    ? "bg-blue-100 text-blue-700" :
                                    catStatus === "waiting" ? "bg-orange-100 text-orange-700" :
                                    "bg-gray-200 text-gray-500"
                                  }`}>{catStatus}</span>
                                  {catStatus !== "paid" && (
                                    <button
                                      onClick={() => handleCategoryStatus(panelOrder.id, cat, "paid")}
                                      disabled={updatingCatKey === catKey}
                                      className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-50 transition-colors"
                                    >
                                      {updatingCatKey === catKey ? "…" : "✅ Mark Paid"}
                                    </button>
                                  )}
                                  {catStatus === "paid" && (
                                    <button
                                      onClick={() => handleCategoryStatus(panelOrder.id, cat, "pending")}
                                      disabled={updatingCatKey === catKey}
                                      className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 disabled:opacity-50 transition-colors"
                                    >
                                      {updatingCatKey === catKey ? "…" : "↩ Revert"}
                                    </button>
                                  )}
                                </div>
                              </div>
                              {/* Items */}
                              {catItems.map((item) => {
                                const qty = editQtys[item.id] ?? item.qtyVials;
                                return (
                                  <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 last:border-0">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-800 truncate">{item.productName}</p>
                                      <p className="text-[10px] text-gray-400">₱{formatPrice(item.pricePerVial)}/vial</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <button
                                        onClick={() => setEditQtys((p) => ({ ...p, [item.id]: Math.max(0, (p[item.id] ?? item.qtyVials) - 1) }))}
                                        className="w-6 h-6 rounded-full bg-white border border-gray-200 text-gray-500 hover:bg-gray-100 flex items-center justify-center text-sm font-bold leading-none"
                                      >−</button>
                                      <span className="text-sm font-semibold w-6 text-center text-gray-900">{qty}</span>
                                      <button
                                        onClick={() => setEditQtys((p) => ({ ...p, [item.id]: (p[item.id] ?? item.qtyVials) + 1 }))}
                                        className="w-6 h-6 rounded-full bg-white border border-gray-200 text-gray-500 hover:bg-gray-100 flex items-center justify-center text-sm font-bold leading-none"
                                      >+</button>
                                    </div>
                                    <p className="text-sm font-semibold text-gray-800 w-16 text-right shrink-0">
                                      ₱{formatPrice(qty * item.pricePerVial)}
                                    </p>
                                  </div>
                                );
                              })}
                              <div className="px-4 py-2 bg-white flex justify-between text-xs text-gray-500">
                                <span>Category subtotal</span>
                                <span className="font-semibold text-gray-700">₱{formatPrice(catSubtotal)}</span>
                              </div>
                            </div>
                          );
                        })}
                        {/* Grand total */}
                        <div className="bg-white rounded-xl px-4 py-3 space-y-1 border border-gray-100">
                          <div className="flex justify-between text-xs text-gray-500">
                            <span>Subtotal</span><span>₱{formatPrice(panelSubtotal)}</span>
                          </div>
                          <div className="flex justify-between text-sm font-bold text-gray-900 pt-1">
                            <span>Grand Total</span>
                            <span className="text-purple-700">₱{formatPrice(panelOrder.grandTotal || panelSubtotal)}</span>
                          </div>
                          <p className="text-[10px] text-gray-400 font-mono pt-0.5">Order #{panelOrder.id}</p>
                          <a
                            href={`/invoice/${panelOrder.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-center text-[10px] text-purple-600 hover:underline mt-1"
                          >
                            📄 View Invoice ↗
                          </a>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Panel actions */}
          {panelOrder && !panelLoading && (
            <div className="border-t border-gray-100 p-4 space-y-2 shrink-0">
              {/* Primary: Save */}
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>

              {/* Quick status row */}
              <div className="flex gap-1.5">
                {[
                  { s: "paid" as OrderStatus,      label: "✅ Mark Paid",      active: "bg-blue-600 text-white",      idle: "border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100" },
                  { s: "fulfilled" as OrderStatus, label: "📦 Fulfilled",       active: "bg-emerald-600 text-white",   idle: "border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100" },
                  { s: "waiting" as OrderStatus,   label: "⏳ Waiting",         active: "bg-orange-600 text-white",    idle: "border border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100" },
                ].map(({ s, label, active, idle }) => (
                  <button
                    key={s}
                    onClick={() => handleQuickStatus(s)}
                    disabled={!!quickStatusSaving || editStatus === s}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 ${editStatus === s ? active : idle}`}
                  >
                    {quickStatusSaving === s ? "…" : label}
                  </button>
                ))}
              </div>

              {/* Secondary row: Remind + Cancel */}
              <div className="flex gap-2">
                <button
                  onClick={handleRemind}
                  disabled={reminding || editStatus === "cancelled" || (editStatus as string) === "delivered"}
                  className="flex-1 py-2 border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 disabled:opacity-40 rounded-xl text-xs font-semibold transition-colors"
                  title="Send payment reminder via @pephaul_bot"
                >
                  {reminding ? "Sending…" : "📣 Send Reminder"}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelling || editStatus === "cancelled"}
                  className="flex-1 py-2 border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-40 rounded-xl text-xs font-semibold transition-colors"
                >
                  {cancelling ? "Cancelling…" : "✕ Cancel Order"}
                </button>
              </div>

              {/* Danger: Delete */}
              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full py-1.5 text-gray-400 hover:text-red-500 text-xs transition-colors"
                >
                  Delete order permanently
                </button>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                  <p className="text-xs text-red-700 font-semibold">Delete this order? This cannot be undone.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 bg-white"
                    >
                      No, keep it
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex-1 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleting ? "Deleting…" : "Yes, Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
