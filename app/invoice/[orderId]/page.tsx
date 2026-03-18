"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ShippingDetails } from "@/lib/types";

function formatPrice(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const STATUS_INFO: Record<string, { label: string; color: string; dot: string }> = {
  pending:   { label: "Pending Payment",                 color: "text-amber-700 bg-amber-50 border-amber-200",   dot: "bg-amber-400" },
  waiting:   { label: "Waiting Admin Confirmation",      color: "text-blue-700 bg-blue-50 border-blue-200",      dot: "bg-blue-400" },
  paid:      { label: "Payment Confirmed ✓",             color: "text-emerald-700 bg-emerald-50 border-emerald-200", dot: "bg-emerald-400" },
  fulfilled: { label: "Order Dispatched ✓",              color: "text-purple-700 bg-purple-50 border-purple-200", dot: "bg-purple-400" },
  cancelled: { label: "Cancelled",                       color: "text-gray-500 bg-gray-100 border-gray-200",     dot: "bg-gray-300" },
};

const CATEGORY_EMOJI: Record<string, string> = {
  "USP BAC": "💉",
  COSMETICS: "✨",
  SERUMS: "🧪",
  PENS: "🖊️",
  "TOPICAL RAWS": "🧴",
};

interface InvoiceData {
  id: string;
  customerName: string;
  telegramUsername: string;
  orderDate: string;
  status: string;
  batchId: string;
  categoryGroups: {
    category: string;
    items: { productName: string; qtyVials: number; pricePerVial: number; lineTotal: number }[];
    handling: number;
    subtotal: number;
    categoryStatus: string;
    paymentOpen: boolean;
  }[];
  subtotal: number;
  handlingTotal: number;
  grandTotal: number;
}

export default function InvoicePage() {
  const params = useParams();
  const orderId = params.orderId as string;
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payingCategory, setPayingCategory] = useState<string | null>(null);
  const [paidCategories, setPaidCategories] = useState<Set<string>>(new Set());
  const [shipping, setShipping] = useState<ShippingDetails | null>(null);
  const [showShipping, setShowShipping] = useState(false);
  const [editShipping, setEditShipping] = useState<ShippingDetails | null>(null);
  const [shippingSaving, setShippingSaving] = useState(false);
  const [shippingSaved, setShippingSaved] = useState(false);

  async function handleNotifyAdmin(category: string) {
    setPayingCategory(category);
    try {
      const res = await fetch(`/api/orders/${orderId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      if (res.ok) setPaidCategories((prev) => new Set([...prev, category]));
    } finally {
      setPayingCategory(null);
    }
  }

  useEffect(() => {
    fetch(`/api/invoice/${orderId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else {
          setInvoice(data);
          // Fetch shipping details for this customer
          const tg = data.telegramUsername;
          if (tg) {
            fetch(`/api/shipping?telegram=${encodeURIComponent(tg.replace(/^@/, ""))}`)
              .then((r) => r.json())
              .then((s) => {
                if (s && s.fullName) {
                  setShipping(s);
                  setEditShipping(s);
                } else {
                  setEditShipping({ telegramUsername: tg, fullName: "", phone: "", address: "", city: "", province: "", zip: "", notes: "" });
                }
              })
              .catch(() => {
                setEditShipping({ telegramUsername: tg, fullName: "", phone: "", address: "", city: "", province: "", zip: "", notes: "" });
              });
          }
        }
      })
      .catch(() => setError("Failed to load invoice."))
      .finally(() => setLoading(false));
  }, [orderId]);

  async function handleSaveShipping() {
    if (!editShipping || !invoice) return;
    setShippingSaving(true);
    setShippingSaved(false);
    try {
      await fetch("/api/shipping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editShipping, telegramUsername: invoice.telegramUsername }),
      });
      setShipping(editShipping);
      setShippingSaved(true);
      setTimeout(() => setShippingSaved(false), 3000);
    } finally {
      setShippingSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">Loading invoice…</div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <p className="text-gray-500 mb-3">Invoice not found</p>
          <Link href="/" className="text-rose-600 text-sm hover:underline">← Back to order portal</Link>
        </div>
      </div>
    );
  }

  const statusInfo = STATUS_INFO[invoice.status] || STATUS_INFO.pending;

  return (
    <div className="min-h-screen bg-[#f5f4f2] py-6 px-4">

      {/* Top bar — hidden when printing */}
      <div className="print:hidden max-w-md mx-auto mb-4 flex items-center justify-between">
        <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
          ← Order Portal
        </Link>
        <button
          onClick={() => window.print()}
          className="px-3 py-1.5 bg-purple-600 text-white text-xs font-semibold rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-1.5"
        >
          <span>🖨</span> Save / Print
        </button>
      </div>

      {/* Invoice card */}
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm overflow-hidden print:shadow-none print:max-w-full">

        {/* Brand header */}
        <div
          className="px-6 py-5"
          style={{ background: "linear-gradient(135deg, #fdf2f8 0%, #fce7f3 55%, #ede9fe 100%)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🦋</span>
              <div className="leading-tight">
                <p className="font-extrabold text-purple-900 text-lg tracking-tight">Deej Hauls</p>
                <p className="text-[10px] text-purple-400 font-medium">Group Order Invoice</p>
              </div>
            </div>
            <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusInfo.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusInfo.dot}`} />
              {statusInfo.label}
            </span>
          </div>

          <div className="flex items-end justify-between">
            <div>
              <p className="text-[9px] text-purple-400 uppercase tracking-widest font-bold mb-0.5">Invoice #</p>
              <p className="font-mono text-sm font-bold text-purple-900">{invoice.id}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] text-purple-400 uppercase tracking-widest font-bold mb-0.5">Date</p>
              <p className="text-xs text-purple-800">
                {new Date(invoice.orderDate).toLocaleDateString("en-PH", {
                  month: "short", day: "numeric", year: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Customer info */}
          <div className="flex justify-between items-start pb-4 border-b border-gray-100">
            <div>
              <p className="text-[9px] text-gray-400 uppercase tracking-widest font-bold mb-1">Bill To</p>
              <p className="font-bold text-gray-900 text-sm">{invoice.customerName}</p>
              <p className="text-xs text-gray-400 mt-0.5">{invoice.telegramUsername}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] text-gray-400 uppercase tracking-widest font-bold mb-1">Batch</p>
              <p className="text-xs font-semibold text-gray-600">{invoice.batchId}</p>
            </div>
          </div>

          {/* Shipping details */}
          <div className="pb-4 border-b border-gray-100">
            <button
              onClick={() => setShowShipping((v) => !v)}
              className="flex items-center justify-between w-full text-left"
            >
              <div>
                <p className="text-[9px] text-gray-400 uppercase tracking-widest font-bold mb-0.5">Ship To</p>
                {shipping?.fullName ? (
                  <p className="text-xs text-gray-700 font-medium">{shipping.fullName} · {shipping.city}</p>
                ) : (
                  <p className="text-xs text-gray-400 italic">No shipping details yet</p>
                )}
              </div>
              <span className="text-gray-300 text-xs ml-2 print:hidden">{showShipping ? "▲" : "▾"} Edit</span>
            </button>
            {showShipping && editShipping && (
              <div className="mt-3 space-y-2 print:hidden">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">Full Name</label>
                    <input
                      value={editShipping.fullName}
                      onChange={(e) => setEditShipping((p) => p ? { ...p, fullName: e.target.value } : p)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-purple-300"
                      placeholder="Full name"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">Phone</label>
                    <input
                      value={editShipping.phone}
                      onChange={(e) => setEditShipping((p) => p ? { ...p, phone: e.target.value } : p)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-purple-300"
                      placeholder="09XX..."
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">Address</label>
                  <input
                    value={editShipping.address}
                    onChange={(e) => setEditShipping((p) => p ? { ...p, address: e.target.value } : p)}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-purple-300"
                    placeholder="Street address / unit"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">City</label>
                    <input
                      value={editShipping.city}
                      onChange={(e) => setEditShipping((p) => p ? { ...p, city: e.target.value } : p)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-purple-300"
                      placeholder="City"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">Province</label>
                    <input
                      value={editShipping.province}
                      onChange={(e) => setEditShipping((p) => p ? { ...p, province: e.target.value } : p)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-purple-300"
                      placeholder="Province"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">ZIP</label>
                    <input
                      value={editShipping.zip}
                      onChange={(e) => setEditShipping((p) => p ? { ...p, zip: e.target.value } : p)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-purple-300"
                      placeholder="ZIP"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-0.5">Notes (optional)</label>
                  <input
                    value={editShipping.notes || ""}
                    onChange={(e) => setEditShipping((p) => p ? { ...p, notes: e.target.value } : p)}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-purple-300"
                    placeholder="Landmark, delivery instructions…"
                  />
                </div>
                <button
                  onClick={handleSaveShipping}
                  disabled={shippingSaving}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  {shippingSaving ? "Saving…" : shippingSaved ? "✓ Saved!" : "Save Shipping Details"}
                </button>
              </div>
            )}
            {/* Print-only view of shipping details */}
            {shipping?.fullName && (
              <div className="hidden print:block mt-2 text-xs text-gray-700 leading-snug">
                <p className="font-semibold">{shipping.fullName}</p>
                {shipping.phone && <p>{shipping.phone}</p>}
                <p>{shipping.address}</p>
                <p>{shipping.city}{shipping.province ? `, ${shipping.province}` : ""}{shipping.zip ? ` ${shipping.zip}` : ""}</p>
                {shipping.notes && <p className="text-gray-400 italic">{shipping.notes}</p>}
              </div>
            )}
          </div>

          {/* Line items by category */}
          {invoice.categoryGroups.map((group) => (
            <div key={group.category}>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-sm">{CATEGORY_EMOJI[group.category] || "📦"}</span>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex-1">{group.category}</p>
                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${
                  (group.categoryStatus === "paid" || paidCategories.has(group.category))
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : (group.categoryStatus === "waiting")
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-gray-100 text-gray-400 border-gray-200"
                }`}>
                  {(group.categoryStatus === "paid" || paidCategories.has(group.category)) ? "paid ✓"
                    : group.categoryStatus === "waiting" ? "⏳ waiting"
                    : "pending"}
                </span>
              </div>
              <div className="space-y-1.5">
                {group.items.map((item) => (
                  <div key={item.productName} className="flex justify-between items-baseline">
                    <div className="flex-1 pr-3">
                      <span className="text-sm text-gray-800">{item.productName}</span>
                      {item.qtyVials > 1 && (
                        <span className="text-xs text-gray-400 ml-1.5">× {item.qtyVials}</span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-gray-800 shrink-0">
                      ₱{formatPrice(item.lineTotal)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between text-xs text-gray-400 pt-1.5 border-t border-dashed border-gray-100">
                  <span>Handling fee</span>
                  <span>₱{formatPrice(group.handling)}</span>
                </div>
                <div className="flex justify-between text-xs font-semibold text-gray-600">
                  <span>Category subtotal</span>
                  <span>₱{formatPrice(group.subtotal + group.handling)}</span>
                </div>
              </div>
            </div>
          ))}

          {/* Totals */}
          {(() => {
            const paidTotal = invoice.categoryGroups
              .filter((g) => g.categoryStatus === "paid" || paidCategories.has(g.category))
              .reduce((s, g) => s + g.subtotal + g.handling, 0);
            const balanceDue = invoice.grandTotal - paidTotal;
            return (
              <div className="border-t-2 border-gray-200 pt-4 space-y-1.5">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Products subtotal</span>
                  <span>₱{formatPrice(invoice.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Total handling</span>
                  <span>₱{formatPrice(invoice.handlingTotal)}</span>
                </div>
                <div className="flex justify-between text-lg font-extrabold text-gray-900 pt-2 border-t border-gray-100">
                  <span>Grand Total</span>
                  <span className="text-purple-700">₱{formatPrice(invoice.grandTotal)}</span>
                </div>
                {paidTotal > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600">
                    <span>Paid ✅</span>
                    <span>₱{formatPrice(paidTotal)}</span>
                  </div>
                )}
                {balanceDue > 0 && (
                  <div className="flex justify-between text-sm font-bold text-gray-800">
                    <span>Balance Due</span>
                    <span className="text-red-600">₱{formatPrice(balanceDue)}</span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Fulfilled / dispatched notice */}
          {invoice.status === "fulfilled" && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 text-center">
              <p className="text-purple-700 font-bold text-sm">📦 Order Dispatched</p>
              <p className="text-purple-500 text-xs mt-1">Your order has been dispatched. Thank you!</p>
            </div>
          )}

          {/* Per-category payment blocks */}
          {invoice.status !== "fulfilled" && invoice.status !== "cancelled" && (
            <div className="space-y-2 print:hidden">
              {invoice.categoryGroups.map((group) => {
                const isPaid = group.categoryStatus === "paid" || paidCategories.has(group.category);
                const isWaiting = group.categoryStatus === "waiting" && !paidCategories.has(group.category);
                const canPay = group.categoryStatus === "pending" && group.paymentOpen && !paidCategories.has(group.category);
                if (isPaid) {
                  return (
                    <div key={group.category} className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 text-center">
                      <p className="text-emerald-600 text-sm font-semibold">✅ {group.category} paid</p>
                    </div>
                  );
                }
                if (isWaiting) {
                  return (
                    <div key={group.category} className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-center">
                      <p className="text-blue-600 text-sm">⏳ Waiting confirmation for {group.category}</p>
                    </div>
                  );
                }
                if (canPay) {
                  return (
                    <div key={group.category} className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-3">
                      <div>
                        <p className="text-amber-800 font-bold text-xs mb-1">💳 Pay {group.category} via GCash · GoTyme · Maya</p>
                        <p className="font-extrabold text-amber-900 text-base tracking-wide">09267007491</p>
                        <p className="text-xs text-amber-700 mt-1">Amount: ₱{formatPrice(group.subtotal + group.handling)}</p>
                      </div>
                      <button
                        onClick={() => handleNotifyAdmin(group.category)}
                        disabled={payingCategory === group.category}
                        className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
                      >
                        {payingCategory === group.category ? "Notifying admin…" : `✉️ I've sent payment for ${group.category}`}
                      </button>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <p className="text-[9px] text-gray-300 font-mono">deej-hauls.vercel.app</p>
          <p className="text-[9px] text-gray-300">Haul by Deej · powered by PepHaul 🦋</p>
        </div>
      </div>

      {/* Screenshot tip */}
      <p className="print:hidden text-center text-[10px] text-gray-300 mt-4">
        Screenshot this page as your payment receipt
      </p>

    </div>
  );
}
