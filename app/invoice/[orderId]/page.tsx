"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

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

  useEffect(() => {
    fetch(`/api/invoice/${orderId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setInvoice(data);
      })
      .catch(() => setError("Failed to load invoice."))
      .finally(() => setLoading(false));
  }, [orderId]);

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

          {/* Line items by category */}
          {invoice.categoryGroups.map((group) => (
            <div key={group.category}>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-sm">{CATEGORY_EMOJI[group.category] || "📦"}</span>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{group.category}</p>
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
          </div>

          {/* Payment info / status block */}
          {invoice.status === "waiting" && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-center">
              <p className="text-blue-700 font-bold text-sm">⏳ Payment Under Review</p>
              <p className="text-blue-500 text-xs mt-1">Waiting for haul admin to confirm your payment. We&apos;ll reach out on Telegram.</p>
            </div>
          )}
          {invoice.status === "paid" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-center">
              <p className="text-emerald-700 font-bold text-sm">✓ Payment Confirmed</p>
              <p className="text-emerald-500 text-xs mt-1">Your order is confirmed and being processed.</p>
            </div>
          )}
          {invoice.status === "fulfilled" && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 text-center">
              <p className="text-purple-700 font-bold text-sm">📦 Order Dispatched</p>
              <p className="text-purple-500 text-xs mt-1">Your order has been dispatched. Thank you!</p>
            </div>
          )}
          {invoice.status === "pending" && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-amber-800 font-bold text-xs mb-1">💳 Send payment via GCash · GoTyme · Maya</p>
              <p className="font-extrabold text-amber-900 text-base tracking-wide">09267007491</p>
              <p className="text-amber-600 text-[10px] mt-1">After paying, notify admin from the order portal.</p>
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
