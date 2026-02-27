"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { OrderStatus, OrderItem } from "@/lib/types";

const STATUS_OPTIONS: OrderStatus[] = ["pending", "confirmed", "delivered", "cancelled"];

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  confirmed: "bg-blue-100 text-blue-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
};

function formatPrice(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface OrderDetail {
  id: string;
  customerName: string;
  telegramUsername: string;
  orderDate: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Editable fields
  const [customerName, setCustomerName] = useState("");
  const [telegram, setTelegram] = useState("");
  const [status, setStatus] = useState<OrderStatus>("pending");
  const [itemQtys, setItemQtys] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch(`/api/orders/${orderId}`)
      .then((r) => r.json())
      .then((data) => {
        setOrder(data);
        setCustomerName(data.customerName);
        setTelegram(data.telegramUsername);
        setStatus(data.status);
        const qtys: Record<string, number> = {};
        for (const item of data.items) {
          qtys[item.id] = item.qtyVials;
        }
        setItemQtys(qtys);
      })
      .catch(() => setError("Failed to load order."))
      .finally(() => setLoading(false));
  }, [orderId]);

  // Compute totals
  const categories = new Set(order?.items.map((i) => i.category) || []);
  const subtotal = order?.items.reduce(
    (sum, item) => sum + (itemQtys[item.id] ?? item.qtyVials) * item.pricePerVial,
    0
  ) || 0;

  // Handling fee per category (from first product of that category)
  // We'll just track unique categories
  const handlingTotal = categories.size * 100; // Approximate — exact fee in sheets

  async function handleSave() {
    if (!order) return;
    setSaving(true);
    setError("");
    setSuccess("");

    const updatedItems = order.items.map((item) => ({
      productName: item.productName,
      category: item.category,
      qtyVials: itemQtys[item.id] ?? item.qtyVials,
      pricePerVial: item.pricePerVial,
      vialsPerKit: item.vialsPerKit,
    }));

    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          telegramUsername: telegram,
          status,
          items: updatedItems,
        }),
      });

      if (res.ok) {
        setSuccess("Order saved successfully.");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to save.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/admin/orders");
      } else {
        setError("Failed to delete order.");
        setDeleting(false);
      }
    } catch {
      setError("Network error.");
      setDeleting(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Loading…</div>;
  }

  if (!order) {
    return (
      <div className="p-8 text-center text-gray-400">
        Order not found. <Link href="/admin/orders" className="text-rose-600">Back to orders</Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/orders" className="text-gray-400 hover:text-gray-600 text-sm">
          ← Orders
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-600 font-mono">{orderId}</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Order Detail</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm mb-4">
          {success}
        </div>
      )}

      {/* Customer info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="font-semibold text-gray-800 mb-4">Customer Info</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Telegram</label>
            <input
              value={telegram}
              onChange={(e) => setTelegram(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
            />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
          <div className="flex gap-2 flex-wrap">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-all ${
                  status === s
                    ? STATUS_COLORS[s] + " ring-2 ring-offset-1 ring-current"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 text-xs text-gray-400">
          Placed: {new Date(order.orderDate).toLocaleString("en-PH")}
        </div>
      </div>

      {/* Order items */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="font-semibold text-gray-800 mb-4">Items</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-100">
              <th className="text-left pb-2 font-medium">Product</th>
              <th className="text-left pb-2 font-medium">Category</th>
              <th className="text-right pb-2 font-medium">Price/Vial</th>
              <th className="text-right pb-2 font-medium">Qty (Vials)</th>
              <th className="text-right pb-2 font-medium">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => {
              const qty = itemQtys[item.id] ?? item.qtyVials;
              return (
                <tr key={item.id} className="border-b border-gray-50">
                  <td className="py-2.5 font-medium text-gray-800">{item.productName}</td>
                  <td className="py-2.5 text-gray-500">{item.category}</td>
                  <td className="py-2.5 text-right text-gray-500">₱{formatPrice(item.pricePerVial)}</td>
                  <td className="py-2.5 text-right">
                    <input
                      type="number"
                      min={0}
                      max={item.vialsPerKit}
                      value={qty}
                      onChange={(e) =>
                        setItemQtys((prev) => ({
                          ...prev,
                          [item.id]: Math.min(
                            item.vialsPerKit,
                            Math.max(0, parseInt(e.target.value) || 0)
                          ),
                        }))
                      }
                      className="w-16 px-2 py-1 border border-gray-200 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-rose-400"
                    />
                  </td>
                  <td className="py-2.5 text-right font-medium text-gray-800">
                    ₱{formatPrice(qty * item.pricePerVial)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-1 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span>₱{formatPrice(subtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-400 text-xs">
            <span>Est. handling ({categories.size} categor{categories.size !== 1 ? "ies" : "y"} × ₱100)</span>
            <span>₱{formatPrice(handlingTotal)}</span>
          </div>
          <div className="flex justify-between font-bold text-gray-900 text-base pt-1">
            <span>Est. Grand Total</span>
            <span>₱{formatPrice(subtotal + handlingTotal)}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="px-4 py-2 text-red-600 border border-red-200 rounded-lg text-sm hover:bg-red-50 transition-colors"
        >
          Delete Order
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-rose-600 text-white rounded-lg text-sm font-semibold hover:bg-rose-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {/* Delete confirm dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="font-bold text-gray-900 text-lg mb-2">Delete this order?</h3>
            <p className="text-sm text-gray-500 mb-6">
              This will permanently delete the order for <strong>{order.customerName}</strong> and all its items. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
