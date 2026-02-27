"use client";

import { useState, useEffect, useCallback } from "react";
import { ConsolidationReport } from "@/lib/types";

function formatPrice(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function Dashboard() {
  const [report, setReport] = useState<ConsolidationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/consolidation");
      if (!res.ok) throw new Error("Failed to fetch");
      setReport(await res.json());
    } catch {
      setError("Failed to load consolidation data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Group rows by category
  const byCategory = new Map<string, ConsolidationReport["rows"]>();
  if (report) {
    for (const row of report.rows) {
      if (!byCategory.has(row.category)) byCategory.set(row.category, []);
      byCategory.get(row.category)!.push(row);
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Consolidation Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Aggregated view of all pending + confirmed orders
          </p>
        </div>
        <button
          onClick={fetchReport}
          disabled={loading}
          className="px-4 py-2 bg-rose-600 text-white text-sm rounded-lg hover:bg-rose-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-6">
          {error}
        </div>
      )}

      {loading && !report && (
        <div className="text-center text-gray-400 py-20">Loading…</div>
      )}

      {report && (
        <>
          {report.rows.length === 0 ? (
            <div className="text-center text-gray-400 py-20 bg-white rounded-xl border border-gray-200">
              No active orders yet.
            </div>
          ) : (
            <div className="space-y-6">
              {Array.from(byCategory.entries()).map(([category, rows]) => (
                <div key={category} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <h2 className="font-semibold text-gray-700">{category}</h2>
                    <span className="text-xs text-gray-400">
                      Handling fee: ₱{formatPrice(report.categoryFees[category] || 0)}
                    </span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 border-b border-gray-100">
                        <th className="text-left px-5 py-2 font-medium">Product</th>
                        <th className="text-right px-5 py-2 font-medium">Total Vials</th>
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
                          <td className="px-5 py-3 text-right text-gray-400">{row.openSlots}</td>
                          <td className="px-5 py-3 text-right text-gray-600">₱{formatPrice(row.pricePerKit)}</td>
                          <td className="px-5 py-3 text-right font-medium text-gray-800">₱{formatPrice(row.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              {/* Grand total */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-6 text-sm text-gray-600">
                      <span>Total Kits: <strong className="text-gray-900">{report.totalKits}</strong></span>
                      <span>Total Handling: <strong className="text-gray-900">₱{formatPrice(report.totalHandling)}</strong></span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400 mb-0.5">Grand Total (products + handling)</p>
                    <p className="text-2xl font-bold text-rose-600">
                      ₱{formatPrice(report.totalCost + report.totalHandling)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
