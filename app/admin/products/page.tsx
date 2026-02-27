"use client";

import { useState, useEffect } from "react";
import { Product } from "@/lib/types";

const CATEGORY_OPTIONS = ["USP BAC", "COSMETICS", "SERUMS", "PENS"];

function formatPrice(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const EMPTY_FORM = {
  category: "COSMETICS",
  productName: "",
  pricePerKit: "",
  pricePerVial: "",
  vialsPerKit: "10",
  handlingFee: "100",
  active: true,
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Category Notes state
  const [categoryNotes, setCategoryNotes] = useState<Record<string, string>>({});
  const [notesSaving, setNotesSaving] = useState<Record<string, boolean>>({});
  const [notesSaved, setNotesSaved] = useState<Record<string, boolean>>({});

  async function fetchProducts() {
    setLoading(true);
    try {
      const res = await fetch("/api/products");
      setProducts(await res.json());
    } catch {
      setError("Failed to load products.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchCategoryNotes() {
    try {
      const res = await fetch("/api/category-notes");
      if (res.ok) {
        setCategoryNotes(await res.json());
      }
    } catch {
      // silently ignore
    }
  }

  async function saveCategoryNote(category: string) {
    setNotesSaving((prev) => ({ ...prev, [category]: true }));
    try {
      const res = await fetch("/api/category-notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, note: categoryNotes[category] ?? "" }),
      });
      if (res.ok) {
        setNotesSaved((prev) => ({ ...prev, [category]: true }));
        setTimeout(() => {
          setNotesSaved((prev) => ({ ...prev, [category]: false }));
        }, 2000);
      }
    } catch {
      // silently ignore
    } finally {
      setNotesSaving((prev) => ({ ...prev, [category]: false }));
    }
  }

  useEffect(() => {
    fetchProducts();
    fetchCategoryNotes();
  }, []);

  function openAdd() {
    setEditingProduct(null);
    setForm(EMPTY_FORM);
    setError("");
    setSuccess("");
    setShowModal(true);
  }

  function openEdit(product: Product) {
    setEditingProduct(product);
    setForm({
      category: product.category,
      productName: product.productName,
      pricePerKit: String(product.pricePerKit),
      pricePerVial: String(product.pricePerVial),
      vialsPerKit: String(product.vialsPerKit),
      handlingFee: String(product.handlingFee),
      active: product.active,
    });
    setError("");
    setSuccess("");
    setShowModal(true);
  }

  async function handleSave() {
    setSaving(true);
    setError("");

    const payload = {
      category: form.category,
      productName: form.productName.trim(),
      pricePerKit: parseFloat(form.pricePerKit) || 0,
      pricePerVial: parseFloat(form.pricePerVial) || 0,
      vialsPerKit: parseInt(form.vialsPerKit) || 1,
      handlingFee: parseFloat(form.handlingFee) || 100,
      active: form.active,
    };

    if (!payload.productName) {
      setError("Product name is required.");
      setSaving(false);
      return;
    }

    try {
      let res;
      if (editingProduct) {
        res = await fetch(`/api/products/${editingProduct.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        setShowModal(false);
        await fetchProducts();
        setSuccess(editingProduct ? "Product updated." : "Product added.");
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

  async function handleDelete(product: Product) {
    try {
      const res = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteConfirm(null);
        await fetchProducts();
      } else {
        setError("Failed to delete product.");
      }
    } catch {
      setError("Network error.");
    }
  }

  async function handleToggleActive(product: Product) {
    try {
      await fetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...product, active: !product.active }),
      });
      await fetchProducts();
    } catch {
      setError("Failed to toggle product.");
    }
  }

  const byCategory = CATEGORY_OPTIONS.map((cat) => ({
    cat,
    items: products.filter((p) => p.category === cat),
  }));

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-sm text-gray-500 mt-0.5">{products.length} products in Pricelist</p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 bg-rose-600 text-white text-sm rounded-lg hover:bg-rose-700 transition-colors font-medium"
        >
          + Add Product
        </button>
      </div>

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

      {/* Category Notes card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="font-semibold text-gray-700">Category Notes</h2>
          <p className="text-xs text-gray-400 mt-0.5">Internal notes per category, visible on the consolidation page.</p>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CATEGORY_OPTIONS.map((cat) => (
            <div key={cat}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{cat}</label>
              <div className="flex gap-2 items-start">
                <textarea
                  rows={2}
                  value={categoryNotes[cat] ?? ""}
                  onChange={(e) =>
                    setCategoryNotes((prev) => ({ ...prev, [cat]: e.target.value }))
                  }
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 resize-none"
                  placeholder={`Notes for ${cat}…`}
                />
                <button
                  onClick={() => saveCategoryNote(cat)}
                  disabled={notesSaving[cat]}
                  className="px-3 py-2 bg-rose-600 text-white text-xs rounded-lg hover:bg-rose-700 disabled:opacity-50 transition-colors font-medium whitespace-nowrap"
                >
                  {notesSaving[cat] ? "Saving…" : "Save"}
                </button>
                {notesSaved[cat] && (
                  <span className="text-green-600 text-sm self-center" title="Saved">&#10003;</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-20">Loading…</div>
      ) : (
        <div className="space-y-6">
          {byCategory.map(({ cat, items }) => (
            <div key={cat} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <h2 className="font-semibold text-gray-700">{cat}</h2>
                <span className="text-xs text-gray-400">{items.length} products</span>
              </div>
              {items.length === 0 ? (
                <p className="px-5 py-4 text-sm text-gray-400">No products in this category.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100">
                      <th className="text-left px-5 py-2 font-medium">Product Name</th>
                      <th className="text-right px-5 py-2 font-medium">Price/Kit</th>
                      <th className="text-right px-5 py-2 font-medium">Price/Vial</th>
                      <th className="text-right px-5 py-2 font-medium">Vials/Kit</th>
                      <th className="text-right px-5 py-2 font-medium">Handling</th>
                      <th className="text-center px-5 py-2 font-medium">Active</th>
                      <th className="px-5 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((product) => (
                      <tr
                        key={product.id}
                        className={`border-b border-gray-50 ${!product.active ? "opacity-50" : ""}`}
                      >
                        <td className="px-5 py-3 font-medium text-gray-800">{product.productName}</td>
                        <td className="px-5 py-3 text-right text-gray-600">₱{formatPrice(product.pricePerKit)}</td>
                        <td className="px-5 py-3 text-right text-gray-600">₱{formatPrice(product.pricePerVial)}</td>
                        <td className="px-5 py-3 text-right text-gray-600">{product.vialsPerKit}</td>
                        <td className="px-5 py-3 text-right text-gray-600">₱{formatPrice(product.handlingFee)}</td>
                        <td className="px-5 py-3 text-center">
                          <button
                            onClick={() => handleToggleActive(product)}
                            className={`w-10 h-5 rounded-full transition-colors relative ${
                              product.active ? "bg-green-400" : "bg-gray-200"
                            }`}
                          >
                            <span
                              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                product.active ? "translate-x-5" : "translate-x-0.5"
                              }`}
                            />
                          </button>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => openEdit(product)}
                            className="text-blue-600 text-xs font-medium hover:underline mr-3"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(product)}
                            className="text-red-500 text-xs font-medium hover:underline"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full mx-4 shadow-xl">
            <h3 className="font-bold text-gray-900 text-lg mb-5">
              {editingProduct ? "Edit Product" : "Add Product"}
            </h3>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-4">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Vials/Kit</label>
                  <input
                    type="number"
                    min={1}
                    value={form.vialsPerKit}
                    onChange={(e) => setForm({ ...form, vialsPerKit: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Product Name</label>
                <input
                  type="text"
                  value={form.productName}
                  onChange={(e) => setForm({ ...form, productName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                  placeholder="e.g. Semaglutide 5mg"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Price/Kit (₱)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.pricePerKit}
                    onChange={(e) => setForm({ ...form, pricePerKit: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Price/Vial (₱)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.pricePerVial}
                    onChange={(e) => setForm({ ...form, pricePerVial: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Handling Fee (₱)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.handlingFee}
                    onChange={(e) => setForm({ ...form, handlingFee: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="rounded"
                />
                Active (visible in customer form)
              </label>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-semibold hover:bg-rose-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : editingProduct ? "Save Changes" : "Add Product"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="font-bold text-gray-900 text-lg mb-2">Delete product?</h3>
            <p className="text-sm text-gray-500 mb-6">
              This will permanently delete <strong>{deleteConfirm.productName}</strong> from the Pricelist. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
