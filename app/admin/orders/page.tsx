"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { OrderStatus } from "@/lib/types";

interface OrderRow {
  id: string;
  customerName: string;
  telegramUsername: string;
  orderDate: string;
  status: OrderStatus;
  categories: string[];
  totalVials: number;
  subtotal: number;
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  confirmed: "bg-blue-100 text-blue-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const ALL_STATUSES: OrderStatus[] = ["pending", "confirmed", "delivered", "cancelled"];

function formatPrice(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/orders")
      .then((r) => r.json())
      .then(setOrders)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = orders.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !o.customerName.toLowerCase().includes(q) &&
        !o.telegramUsername.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">{orders.length} total orders</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <input
          type="text"
          placeholder="Search name or @username…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 w-56"
        />
        <div className="flex gap-1">
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${statusFilter === "all" ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600"}`}
          >
            All
          </button>
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize ${statusFilter === s ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-20">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-gray-400 py-20 bg-white rounded-xl border border-gray-200">
          No orders found.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-200 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium">Customer</th>
                <th className="text-left px-5 py-3 font-medium">Telegram</th>
                <th className="text-left px-5 py-3 font-medium">Date</th>
                <th className="text-left px-5 py-3 font-medium">Categories</th>
                <th className="text-right px-5 py-3 font-medium">Vials</th>
                <th className="text-right px-5 py-3 font-medium">Subtotal</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => (
                <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-800">{order.customerName}</td>
                  <td className="px-5 py-3 text-gray-500">{order.telegramUsername}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">
                    {new Date(order.orderDate).toLocaleDateString("en-PH", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {order.categories?.map((c) => (
                        <span key={c} className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded-full text-xs font-medium">
                          {c}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right text-gray-600">{order.totalVials}</td>
                  <td className="px-5 py-3 text-right text-gray-600">₱{formatPrice(order.subtotal)}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[order.status]}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="text-rose-600 text-xs font-medium hover:underline"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
