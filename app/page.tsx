"use client";

import { useState, useEffect, useCallback } from "react";
import { Product } from "@/lib/types";

const CATEGORIES = ["USP BAC", "COSMETICS", "SERUMS", "PENS", "TOPICAL RAWS"] as const;
type Category = (typeof CATEGORIES)[number];

const MOQ: Partial<Record<Category, { qty: number; unit: string }>> = {
  "USP BAC":      { qty: 100, unit: "ampoules" },
  COSMETICS:      { qty: 20,  unit: "boxes" },
  SERUMS:         { qty: 10,  unit: "kits" },
  PENS:           { qty: 10,  unit: "pens" },
  "TOPICAL RAWS": { qty: 20,  unit: "g total" },
};

const CATEGORY_META: Record<Category, { emoji: string; description: string }> = {
  "USP BAC":      { emoji: "💉", description: "Bacteriostatic water" },
  COSMETICS:      { emoji: "✨", description: "Skincare & beauty" },
  SERUMS:         { emoji: "🧪", description: "Peptide serums" },
  PENS:           { emoji: "🖊️", description: "Injection pens" },
  "TOPICAL RAWS": { emoji: "🧴", description: "Topical raw ingredients" },
};

const MULTI_ITEM_MAX = 10;
const USP_BAC_MAX = 200;
const COSMETICS_BULK_THRESHOLD = 3;
const COSMETICS_BULK_DISCOUNT = 100;

function normalizeTelegram(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

type SlotInfo = { totalVials: number; openSlots: number };

type LookupOrder = {
  id: string;
  customerName: string;
  telegramUsername: string;
  orderDate: string;
  status: string;
  items: { productName: string; category: string; qtyVials: number; pricePerVial: number; vialsPerKit: number; categoryStatus?: string }[];
  subtotal: number;
};

function pensHandlingFee(n: number) {
  if (n === 0) return 0;
  // ₱100 for 1–5 pens; +₱50 per every 5 pens after that
  return 100 + Math.floor((n - 1) / 5) * 50;
}

function uspBacHandlingFee(n: number) {
  if (n === 0) return 0;
  // ₱50 per 50 items (or part thereof): 1–50 = ₱50, 51–100 = ₱100, 101–150 = ₱150, …
  return Math.ceil(n / 50) * 50;
}

function topicalRawsHandlingFee(totalGrams: number, varietiesAt10g: number) {
  if (totalGrams === 0) return 0;
  // ₱150 base; +₱50 per variety that reaches 10g
  return 150 + varietiesAt10g * 50;
}

function formatPrice(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function maxQty(product: Product) {
  if (product.vialsPerKit > 1) return product.vialsPerKit;
  if (product.category === "USP BAC") return USP_BAC_MAX;
  if (product.category === "COSMETICS" || product.category === "PENS" || product.category === "TOPICAL RAWS") return MULTI_ITEM_MAX;
  return 1;
}

function KitBar({ qty, perKit }: { qty: number; perKit: number }) {
  if (qty === 0 || perKit <= 1) return null;
  const rem = qty % perKit;
  const full = Math.floor(qty / perKit);
  const toFill = rem === 0 ? 0 : perKit - rem;
  return (
    <div className="mt-1.5 space-y-0.5">
      <div className="flex gap-0.5 h-1">
        {Array.from({ length: perKit }).map((_, i) => (
          <div key={i} className={`flex-1 rounded-full ${i < rem || rem === 0 ? "bg-rose-400" : "bg-gray-200"}`} />
        ))}
      </div>
      <p className="text-[10px] leading-none">
        {rem === 0
          ? <span className="text-emerald-600 font-semibold">{full} full kit{full !== 1 ? "s" : ""} ✓</span>
          : <span className="text-amber-500">{rem}/{perKit} — {toFill} more to fill</span>
        }
      </p>
    </div>
  );
}

function CommunityBar({ slot, vialsPerKit }: { slot: SlotInfo | undefined; vialsPerKit: number }) {
  if (vialsPerKit <= 1) return null;

  const totalVials = slot?.totalVials ?? 0;
  const completedKits = Math.floor(totalVials / vialsPerKit);
  const partialVials = totalVials % vialsPerKit; // vials reserved in the current in-progress kit
  const openSlots = vialsPerKit - partialVials;  // always show remaining slots in current kit
  const currentKit = completedKits + 1;          // the kit currently being filled

  return (
    <div className="mt-2 space-y-1">
      {/* Completed kits row */}
      {completedKits > 0 && (
        <p className="text-[10px] text-emerald-600 font-semibold leading-none">
          ✓ {completedKits} complete kit{completedKits !== 1 ? "s" : ""} filled
        </p>
      )}

      {/* Current kit progress bar — always shown */}
      <div className="space-y-0.5">
        <p className="text-[10px] font-semibold leading-none text-amber-600">
          {partialVials === 0
            ? `Kit ${currentKit} — ${openSlots} slot${openSlots !== 1 ? "s" : ""} open`
            : `Kit ${currentKit} — ${openSlots} slot${openSlots !== 1 ? "s" : ""} left`}
        </p>
        {/* Bar: indigo = reserved, emerald = open */}
        <div className="flex gap-0.5 h-2">
          {Array.from({ length: vialsPerKit }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 rounded-full ${
                i < partialVials ? "bg-indigo-400" : "bg-emerald-200"
              }`}
            />
          ))}
        </div>
        <p className="text-[10px] leading-none">
          <span className="text-indigo-500">{partialVials} reserved</span>
          <span className="text-gray-300 mx-1">·</span>
          <span className="text-emerald-600 font-semibold">{openSlots} open</span>
        </p>
      </div>
    </div>
  );
}

export default function OrderForm() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<Category>("USP BAC");
  const [cart, setCart] = useState<Map<string, number>>(new Map());
  const [customerName, setCustomerName] = useState("");
  const [telegram, setTelegram] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [wasUpdate, setWasUpdate] = useState(false);
  const [error, setError] = useState("");
  const [showCart, setShowCart] = useState(false);
  const [categoryNotes, setCategoryNotes] = useState<Record<string, string>>({});
  const [slotMap, setSlotMap] = useState<Map<string, SlotInfo>>(new Map());
  const [showLookup, setShowLookup] = useState(false);
  const [lookupTelegram, setLookupTelegram] = useState("");
  const [lookupResult, setLookupResult] = useState<LookupOrder[] | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [payingCatKey, setPayingCatKey] = useState<string | null>(null);
  const [paidCatKeys, setPaidCatKeys] = useState<Set<string>>(new Set());
  const [activeBatchId, setActiveBatchId] = useState<string>("");
  const [categoryLocks, setCategoryLocks] = useState<Record<string, boolean>>({});
  const [autoLoadedNote, setAutoLoadedNote] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((data) => { setProducts(data.filter((p: Product) => p.active)); setLoading(false); })
      .catch(() => setLoading(false));
    fetch("/api/category-notes")
      .then((r) => r.json())
      .then(setCategoryNotes)
      .catch(() => {});
    // Fetch active batch first, then use its ID to scope consolidation slots
    fetch("/api/batches/active")
      .then((r) => r.json())
      .then((batch) => {
        const batchId = batch?.id || "";
        if (batchId) {
          setActiveBatchId(batchId);
          fetch(`/api/category-locks?batch=${encodeURIComponent(batchId)}`)
            .then((r) => r.json())
            .then(setCategoryLocks)
            .catch(() => {});
        }
        const param = batchId ? `?batch=${encodeURIComponent(batchId)}` : "";
        return fetch(`/api/consolidation${param}`);
      })
      .then((r) => r.json())
      .then((data) => {
        const m = new Map<string, SlotInfo>();
        for (const row of data.rows || []) {
          m.set(row.productName, { totalVials: row.totalVials, openSlots: row.openSlots });
        }
        setSlotMap(m);
      })
      .catch(() => {});
  }, []);

  const catMap = useCallback(() => {
    const m = new Map<string, Product[]>();
    for (const cat of CATEGORIES) m.set(cat, products.filter((p) => p.category === cat));
    return m;
  }, [products])();

  function setQty(name: string, qty: number) {
    setCart((prev) => {
      const m = new Map(prev);
      if (qty === 0) m.delete(name); else m.set(name, qty);
      return m;
    });
  }

  // ── Computed ────────────────────────────────────────────────────────────────
  const productLookup = new Map(products.map((p) => [p.productName, p]));
  const categoriesOrdered = new Set<string>();
  const itemsList: { product: Product; qty: number }[] = [];
  for (const [name, qty] of cart.entries()) {
    const p = productLookup.get(name);
    if (p && qty > 0) { itemsList.push({ product: p, qty }); categoriesOrdered.add(p.category); }
  }

  const subtotalByCat = new Map<string, number>();
  for (const { product, qty } of itemsList) {
    subtotalByCat.set(product.category, (subtotalByCat.get(product.category) || 0) + qty * product.pricePerVial);
  }

  const totalPens = itemsList.filter((i) => i.product.category === "PENS").reduce((s, i) => s + i.qty, 0);
  const totalUspBac = itemsList.filter((i) => i.product.category === "USP BAC").reduce((s, i) => s + i.qty, 0);
  const totalTopicalRaws = itemsList.filter((i) => i.product.category === "TOPICAL RAWS").reduce((s, i) => s + i.qty, 0);
  const topicalRawsVarieties10g = itemsList.filter((i) => i.product.category === "TOPICAL RAWS" && i.qty >= 10).length;
  const handlingByCat = new Map<string, number>();
  for (const cat of categoriesOrdered) {
    if (cat === "PENS") handlingByCat.set(cat, pensHandlingFee(totalPens));
    else if (cat === "USP BAC") handlingByCat.set(cat, uspBacHandlingFee(totalUspBac));
    else if (cat === "TOPICAL RAWS") handlingByCat.set(cat, topicalRawsHandlingFee(totalTopicalRaws, topicalRawsVarieties10g));
    else handlingByCat.set(cat, products.find((p) => p.category === cat)?.handlingFee || 100);
  }

  const subtotal = [...subtotalByCat.values()].reduce((a, b) => a + b, 0);
  const handlingTotal = [...handlingByCat.values()].reduce((a, b) => a + b, 0);
  const cosmeticsItems = itemsList.filter((i) => i.product.category === "COSMETICS");
  // Discount is per-product: if qty > 3 of the SAME item, ALL boxes get ₱100 off
  const cosmeticsDiscount = cosmeticsItems.reduce((s, i) => {
    return s + (i.qty > COSMETICS_BULK_THRESHOLD ? i.qty * COSMETICS_BULK_DISCOUNT : 0);
  }, 0);
  const grandTotal = subtotal + handlingTotal - cosmeticsDiscount;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!itemsList.length) { setError("Please add at least one item."); return; }
    if (!customerName.trim() || !telegram.trim()) { setError("Please fill in your name and Telegram username."); return; }
    setSubmitting(true); setError("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName.trim(),
          telegramUsername: `@${normalizeTelegram(telegram)}`,
          batchId: activeBatchId,
          items: itemsList.map(({ product, qty }) => ({
            productName: product.productName, category: product.category,
            qtyVials: qty, pricePerVial: product.pricePerVial, vialsPerKit: product.vialsPerKit,
          })),
          handlingByCat: Object.fromEntries(handlingByCat),
          grandTotal,
        }),
      });
      if (res.ok) { const data = await res.json(); setOrderId(data.orderId); setWasUpdate(isUpdating); setSubmitted(true); }
      else setError((await res.json()).error || "Failed to submit order.");
    } catch { setError("Network error. Please try again."); }
    finally { setSubmitting(false); }
  }

  async function handleLookup() {
    const t = lookupTelegram.trim();
    if (!t) return;
    setLookupLoading(true);
    setLookupResult(null);
    try {
      const res = await fetch(`/api/orders/lookup?telegram=${encodeURIComponent(normalizeTelegram(t))}`);
      if (res.ok) setLookupResult(await res.json());
      else setLookupResult([]);
    } catch { setLookupResult([]); }
    finally { setLookupLoading(false); }
  }

  async function handlePay(orderId: string, category: string) {
    const catKey = `${orderId}:${category}`;
    setPayingCatKey(catKey);
    try {
      const res = await fetch(`/api/orders/${orderId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      if (res.ok) setPaidCatKeys((prev) => new Set([...prev, catKey]));
    } finally {
      setPayingCatKey(null);
    }
  }

  async function handleTelegramBlur() {
    const t = normalizeTelegram(telegram);
    if (!t || !activeBatchId) return;
    try {
      const res = await fetch(`/api/orders/lookup?telegram=${encodeURIComponent(t)}`);
      if (!res.ok) return;
      const orders: LookupOrder[] = await res.json();
      const existing = orders.find((o) => o.status === "pending" && o.items.length > 0);
      if (!existing) return;
      // Pre-fill cart with existing order items
      const newCart = new Map<string, number>();
      for (const item of existing.items) newCart.set(item.productName, item.qtyVials);
      setCart(newCart);
      if (!customerName.trim()) setCustomerName(existing.customerName);
      setIsUpdating(true);
      setAutoLoadedNote(`Existing order #${existing.id} loaded — your changes will replace it.`);
    } catch { /* silent */ }
  }

  // ── Success ──────────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 to-pink-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-rose-100 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-5 text-3xl">{wasUpdate ? "✏️" : "🎉"}</div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">{wasUpdate ? "Order Updated!" : "Order Received!"}</h2>
          <p className="text-gray-500 text-sm mb-1">Thanks, <span className="font-semibold text-gray-700">{customerName}</span>!</p>
          <p className="text-xs text-gray-400 mb-6 font-mono">#{orderId}</p>
          <div className="bg-gray-50 rounded-xl p-4 text-left mb-6 space-y-1">
            {itemsList.map(({ product, qty }) => (
              <div key={product.productName} className="flex justify-between text-sm text-gray-600">
                <span>{product.productName}{qty > 1 ? <span className="text-gray-400 ml-1">×{qty}</span> : ""}</span>
                <span className="font-medium">₱{formatPrice(qty * product.pricePerVial)}</span>
              </div>
            ))}
            <div className="border-t border-gray-200 mt-2 pt-2 space-y-1">
              {[["Subtotal", subtotal], ["Handling", handlingTotal]].map(([l, v]) => (
                <div key={String(l)} className="flex justify-between text-sm text-gray-500">
                  <span>{l}</span><span>₱{formatPrice(Number(v))}</span>
                </div>
              ))}
              {cosmeticsDiscount > 0 && (
                <div className="flex justify-between text-sm text-emerald-600 font-medium">
                  <span>Bulk discount</span><span>−₱{formatPrice(cosmeticsDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-900 text-base pt-1">
                <span>Grand Total</span><span>₱{formatPrice(grandTotal)}</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-4">We&apos;ll reach out to you on Telegram ({telegram}).</p>
          <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 text-left">
            <p className="text-xs font-bold text-purple-800 mb-1">📲 Register for Telegram reminders</p>
            <p className="text-xs text-purple-600 leading-relaxed">
              Send <span className="font-mono font-bold bg-purple-100 px-1 rounded">/start</span> to{" "}
              <span className="font-semibold">@pephaul_bot</span> to get automatically registered for order updates and payment reminders.
            </p>
          </div>
          <button onClick={() => { setSubmitted(false); setIsUpdating(true); }} className="mt-5 text-rose-500 text-sm hover:underline font-medium">
            Update my order →
          </button>
        </div>
      </div>
    );
  }

  // ── Order panel JSX (called as function, not component) ────────────────────
  function renderOrderPanel(onClose?: () => void) {
    return (
      <>
        <div className="px-5 pt-5 pb-3 border-b border-gray-50 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-gray-900 tracking-tight">Your Order</h2>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-xl leading-none"
            >×</button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {itemsList.length === 0 ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center text-center pt-4 pb-1">
                <p className="text-3xl mb-2">🛒</p>
                <p className="text-sm font-semibold text-gray-700 mb-1">Your cart is empty</p>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Browse the catalog to add items,<br />or track an existing order below.
                </p>
              </div>
              <div className="border-t border-dashed border-gray-100 pt-4 space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Track existing order</p>
                <input
                  type="text"
                  placeholder="Your @telegram_username"
                  value={lookupTelegram}
                  onChange={(e) => setLookupTelegram(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-transparent placeholder:text-gray-300"
                />
                <button
                  type="button"
                  onClick={handleLookup}
                  disabled={lookupLoading || !lookupTelegram.trim()}
                  className="w-full text-sm font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-100 py-2.5 rounded-xl disabled:opacity-40 transition-colors"
                >
                  {lookupLoading ? "Looking up…" : "Find my orders"}
                </button>
                {lookupResult !== null && (
                  <div className="space-y-2 max-h-72 overflow-y-auto pb-1">
                    {lookupResult.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-3">No orders found for this username.</p>
                    ) : lookupResult.map((order) => {
                      const itemsByCat = new Map<string, typeof order.items>();
                      for (const item of order.items) {
                        if (!itemsByCat.has(item.category)) itemsByCat.set(item.category, []);
                        itemsByCat.get(item.category)!.push(item);
                      }
                      return (
                        <div key={order.id} className="bg-white border border-gray-100 rounded-xl p-3 text-xs shadow-sm">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-gray-700 truncate mr-2">{order.customerName}</span>
                            <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                              order.status === "waiting"   ? "bg-orange-100 text-orange-700" :
                              order.status === "confirmed" ? "bg-orange-100 text-orange-700" :
                              order.status === "paid"      ? "bg-blue-100 text-blue-700" :
                              order.status === "fulfilled" ? "bg-emerald-100 text-emerald-700" :
                              order.status === "delivered" ? "bg-emerald-100 text-emerald-700" :
                              order.status === "cancelled" ? "bg-red-100 text-red-500" :
                              "bg-amber-100 text-amber-700"
                            }`}>{order.status}</span>
                          </div>
                          <p className="text-gray-400 font-mono text-[10px] mb-2">#{order.id} · {new Date(order.orderDate).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</p>
                          {/* Per-category sections */}
                          <div className="space-y-1.5 mb-2">
                            {[...itemsByCat.entries()].map(([cat, catItems]) => {
                              const catStatus = catItems[0]?.categoryStatus || "pending";
                              const catKey = `${order.id}:${cat}`;
                              const catLocked = categoryLocks[cat];
                              const catSubtotal = catItems.reduce((s, i) => s + i.qtyVials * i.pricePerVial, 0);
                              return (
                                <div key={cat} className="bg-gray-50 rounded-lg px-2.5 py-2 border border-gray-100">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-semibold text-gray-600 text-[10px] uppercase tracking-wide">{cat}</span>
                                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                                      catStatus === "paid"    ? "bg-blue-100 text-blue-700" :
                                      catStatus === "waiting" ? "bg-orange-100 text-orange-700" :
                                      "bg-gray-200 text-gray-500"
                                    }`}>{catStatus}</span>
                                  </div>
                                  {catItems.map((item) => (
                                    <div key={item.productName} className="flex justify-between text-gray-600">
                                      <span className="truncate mr-2">{item.productName}{item.qtyVials > 1 ? <span className="text-gray-400"> ×{item.qtyVials}</span> : ""}</span>
                                      <span className="shrink-0">₱{formatPrice(item.qtyVials * item.pricePerVial)}</span>
                                    </div>
                                  ))}
                                  <div className="flex justify-between font-semibold text-gray-700 mt-1 pt-1 border-t border-gray-100 text-[10px]">
                                    <span>Subtotal</span><span>₱{formatPrice(catSubtotal)}</span>
                                  </div>
                                  {order.status !== "cancelled" && order.status !== "fulfilled" && (
                                    catStatus === "paid" ? (
                                      <div className="mt-1.5 text-center text-[10px] text-blue-600 font-semibold py-1">✅ Paid</div>
                                    ) : catStatus === "waiting" || paidCatKeys.has(catKey) ? (
                                      <div className="mt-1.5 text-center text-[10px] text-orange-600 py-1">⏳ Waiting for confirmation</div>
                                    ) : catLocked ? (
                                      <div className="mt-1.5 space-y-1">
                                        <div className="bg-purple-50 border border-purple-100 rounded-md px-2 py-1.5 text-[10px] text-purple-800">
                                          <span className="font-bold">💳 Pay via:</span> GCash · GoTyme · Maya · <span className="font-semibold">09267007491</span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => handlePay(order.id, cat)}
                                          disabled={payingCatKey === catKey}
                                          className="w-full text-[10px] font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 py-1.5 rounded-lg transition-colors"
                                        >
                                          {payingCatKey === catKey ? "Notifying…" : "✉️ I've sent payment for this"}
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="mt-1.5 text-center text-[9px] text-gray-400">🔒 Locked by admin to pay</div>
                                    )
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex justify-between font-semibold text-gray-800 border-t border-gray-100 pt-2 mb-2">
                            <span>Subtotal</span><span>₱{formatPrice(order.subtotal)}</span>
                          </div>
                          <a
                            href={`/invoice/${order.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-full text-center text-[11px] text-purple-600 font-semibold py-1.5 rounded-lg border border-purple-100 hover:bg-purple-50 transition-colors"
                          >
                            📄 View Invoice
                          </a>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {CATEGORIES.filter((c) => categoriesOrdered.has(c)).map((cat) => {
                const catItems = itemsList.filter((i) => i.product.category === cat);
                if (!catItems.length) return null;
                const catSubtotal = subtotalByCat.get(cat) || 0;
                const catHandling = handlingByCat.get(cat) || 0;
                return (
                  <div key={cat}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-xs">{CATEGORY_META[cat as Category].emoji}</span>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{cat}</p>
                    </div>
                    <div className="space-y-1">
                      {catItems.map(({ product, qty }) => {
                        const showKitHint = product.vialsPerKit > 1 && (product.category === "SERUMS" || product.category === "USP BAC");
                        const rem = qty % product.vialsPerKit;
                        const full = Math.floor(qty / product.vialsPerKit);
                        return (
                          <div key={product.productName}>
                            <div className="flex justify-between items-baseline text-sm">
                              <span className="text-gray-700 truncate mr-2 leading-tight" style={{ maxWidth: "130px" }}>
                                {product.productName}
                                {qty > 1 && <span className="text-gray-400 ml-1 text-xs">×{qty}</span>}
                              </span>
                              <span className="font-medium text-gray-800 shrink-0 text-xs">
                                ₱{formatPrice(qty * product.pricePerVial)}
                              </span>
                            </div>
                            {showKitHint && (
                              <p className="text-[10px] text-left mt-0.5">
                                {rem === 0
                                  ? <span className="text-emerald-500">{full} kit{full !== 1 ? "s" : ""} ✓</span>
                                  : <span className="text-amber-400">{rem}/{product.vialsPerKit} — {product.vialsPerKit - rem} more</span>
                                }
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 pt-2 border-t border-dashed border-gray-100 space-y-0.5">
                      <div className="flex justify-between text-[11px] text-gray-500">
                        <span>Subtotal</span>
                        <span className="font-medium">₱{formatPrice(catSubtotal)}</span>
                      </div>
                      {cat === "COSMETICS" && cosmeticsDiscount > 0 && (
                        <>
                          <div className="flex justify-between text-[11px] text-emerald-600 font-medium">
                            <span>Bulk discount</span>
                            <span>−₱{formatPrice(cosmeticsDiscount)}</span>
                          </div>
                          <div className="flex justify-between text-[11px] text-gray-700 font-semibold">
                            <span>Net</span>
                            <span>₱{formatPrice(catSubtotal - cosmeticsDiscount)}</span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between text-[11px] text-gray-400">
                        <span>
                          Handling
                          {cat === "PENS" && totalPens > 5 && (
                            <span className="text-blue-400 ml-1">
                              tier {Math.floor((totalPens - 1) / 5) + 1}
                            </span>
                          )}
                          {cat === "USP BAC" && totalUspBac > 0 && (
                            <span className="text-violet-400 ml-1">
                              {totalUspBac} vials
                            </span>
                          )}
                        </span>
                        <span>₱{formatPrice(catHandling)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 px-5 py-4 space-y-3 shrink-0">
          {itemsList.length > 0 && (
            <div className="space-y-1 pb-3 border-b border-gray-50">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Subtotal</span><span>₱{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Total handling</span><span>₱{formatPrice(handlingTotal)}</span>
              </div>
              {cosmeticsDiscount > 0 && (
                <div className="flex justify-between text-xs text-emerald-600 font-medium">
                  <span>Bulk discount</span><span>−₱{formatPrice(cosmeticsDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-900 text-sm pt-1">
                <span>Grand Total</span>
                <span className="text-purple-700">₱{formatPrice(grandTotal)}</span>
              </div>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Name</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Your full name"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-transparent placeholder:text-gray-300"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Telegram</label>
              <input
                type="text"
                value={telegram}
                onChange={(e) => { setTelegram(e.target.value); setAutoLoadedNote(null); setIsUpdating(false); }}
                onBlur={handleTelegramBlur}
                placeholder="@username"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-transparent placeholder:text-gray-300"
              />
            </div>
            {autoLoadedNote && (
              <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 text-[11px] text-teal-700 flex items-start gap-1.5">
                <span className="shrink-0">✓</span>
                <span>{autoLoadedNote}</span>
              </div>
            )}
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={submitting || !itemsList.length}
              className="w-full bg-purple-700 hover:bg-purple-800 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm shadow-purple-200 disabled:shadow-none"
            >
              {submitting
                ? (isUpdating ? "Updating order…" : "Placing order…")
                : itemsList.length
                  ? `${isUpdating ? "Update Order" : "Place Order"} · ₱${formatPrice(grandTotal)}`
                  : isUpdating ? "Update Order" : "Place Order"}
            </button>
          </form>

          {/* ── Order lookup ── */}
          <div className="pt-2 border-t border-gray-50">
            <button
              type="button"
              onClick={() => { setShowLookup(!showLookup); setLookupResult(null); }}
              className="w-full text-[11px] text-gray-400 hover:text-purple-600 text-left py-1 transition-colors"
            >
              {showLookup ? "▲ Hide" : "▾ Check an existing order"}
            </button>
            {showLookup && (
              <div className="mt-2 space-y-2">
                <input
                  type="text"
                  placeholder="@telegram_username"
                  value={lookupTelegram}
                  onChange={(e) => setLookupTelegram(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-transparent placeholder:text-gray-300"
                />
                <button
                  type="button"
                  onClick={handleLookup}
                  disabled={lookupLoading || !lookupTelegram.trim()}
                  className="w-full text-xs text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-100 py-2 rounded-lg font-medium disabled:opacity-40 transition-colors"
                >
                  {lookupLoading ? "Looking up…" : "Find my orders"}
                </button>
                {lookupResult !== null && (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {lookupResult.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-3">No orders found for this username.</p>
                    ) : lookupResult.map((order) => {
                      const itemsByCat = new Map<string, typeof order.items>();
                      for (const item of order.items) {
                        if (!itemsByCat.has(item.category)) itemsByCat.set(item.category, []);
                        itemsByCat.get(item.category)!.push(item);
                      }
                      return (
                        <div key={order.id} className="bg-gray-50 rounded-xl p-3 text-xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-gray-700 truncate mr-2">{order.customerName}</span>
                            <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                              order.status === "waiting"   ? "bg-orange-100 text-orange-700" :
                              order.status === "confirmed" ? "bg-orange-100 text-orange-700" :
                              order.status === "paid"      ? "bg-blue-100 text-blue-700" :
                              order.status === "fulfilled" ? "bg-emerald-100 text-emerald-700" :
                              order.status === "delivered" ? "bg-emerald-100 text-emerald-700" :
                              order.status === "cancelled" ? "bg-red-100 text-red-500" :
                              "bg-amber-100 text-amber-700"
                            }`}>{order.status}</span>
                          </div>
                          <p className="text-gray-400 font-mono text-[10px] mb-2">#{order.id} · {new Date(order.orderDate).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</p>
                          {/* Per-category sections */}
                          <div className="space-y-1.5 mb-2">
                            {[...itemsByCat.entries()].map(([cat, catItems]) => {
                              const catStatus = catItems[0]?.categoryStatus || "pending";
                              const catKey = `${order.id}:${cat}`;
                              const catLocked = categoryLocks[cat];
                              const catSubtotal = catItems.reduce((s, i) => s + i.qtyVials * i.pricePerVial, 0);
                              return (
                                <div key={cat} className="bg-white rounded-lg px-2.5 py-2 border border-gray-100">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-semibold text-gray-600 text-[10px] uppercase tracking-wide">{cat}</span>
                                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                                      catStatus === "paid"    ? "bg-blue-100 text-blue-700" :
                                      catStatus === "waiting" ? "bg-orange-100 text-orange-700" :
                                      "bg-gray-200 text-gray-500"
                                    }`}>{catStatus}</span>
                                  </div>
                                  {catItems.map((item) => (
                                    <div key={item.productName} className="flex justify-between text-gray-600">
                                      <span className="truncate mr-2">{item.productName}{item.qtyVials > 1 ? <span className="text-gray-400"> ×{item.qtyVials}</span> : ""}</span>
                                      <span className="shrink-0">₱{formatPrice(item.qtyVials * item.pricePerVial)}</span>
                                    </div>
                                  ))}
                                  <div className="flex justify-between font-semibold text-gray-700 mt-1 pt-1 border-t border-gray-100 text-[10px]">
                                    <span>Subtotal</span><span>₱{formatPrice(catSubtotal)}</span>
                                  </div>
                                  {order.status !== "cancelled" && order.status !== "fulfilled" && (
                                    catStatus === "paid" ? (
                                      <div className="mt-1.5 text-center text-[10px] text-blue-600 font-semibold py-1">✅ Paid</div>
                                    ) : catStatus === "waiting" || paidCatKeys.has(catKey) ? (
                                      <div className="mt-1.5 text-center text-[10px] text-orange-600 py-1">⏳ Waiting for confirmation</div>
                                    ) : catLocked ? (
                                      <div className="mt-1.5 space-y-1">
                                        <div className="bg-purple-50 border border-purple-100 rounded-md px-2 py-1.5 text-[10px] text-purple-800">
                                          <span className="font-bold">💳 Pay via:</span> GCash · GoTyme · Maya · <span className="font-semibold">09267007491</span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => handlePay(order.id, cat)}
                                          disabled={payingCatKey === catKey}
                                          className="w-full text-[10px] font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 py-1.5 rounded-lg transition-colors"
                                        >
                                          {payingCatKey === catKey ? "Notifying…" : "✉️ I've sent payment for this"}
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="mt-1.5 text-center text-[9px] text-gray-400">🔒 Locked by admin to pay</div>
                                    )
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex justify-between font-semibold text-gray-800 border-t border-gray-200 pt-2 mb-2">
                            <span>Subtotal</span><span>₱{formatPrice(order.subtotal)}</span>
                          </div>
                          <a
                            href={`/invoice/${order.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-full text-center text-[11px] text-purple-600 font-semibold py-1.5 rounded-lg border border-purple-100 hover:bg-purple-50 transition-colors"
                          >
                            📄 View Invoice
                          </a>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // ── Category-specific notices (inlined in both sidebar and mobile main) ─────
  const cosmeticsNotice = activeCategory === "COSMETICS" ? (
    <div className={`rounded-xl px-3 py-2.5 text-[11px] leading-snug ${
      cosmeticsDiscount > 0
        ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
        : "bg-amber-50 text-amber-700 border border-amber-100"
    }`}>
      {cosmeticsDiscount > 0
        ? <>✓ <strong>₱{formatPrice(cosmeticsDiscount)} discount</strong> applied!</>
        : <>Order <strong>4+ of the same item</strong> for <strong>₱100 off every box</strong></>
      }
    </div>
  ) : null;

  const pensNotice = activeCategory === "PENS" ? (
    <div className={`rounded-xl px-3 py-2.5 text-[11px] leading-snug ${
      totalPens === 0
        ? "bg-amber-50 text-amber-700 border border-amber-100"
        : "bg-blue-50 text-blue-700 border border-blue-100"
    }`}>
      {totalPens === 0 ? (
        <>Ordering <strong>more than 5 pens</strong> adds <strong>+₱50 handling</strong> per 5 pens thereafter</>
      ) : totalPens <= 5 ? (
        <>
          <strong>₱{formatPrice(pensHandlingFee(totalPens))} handling</strong> for {totalPens} pen{totalPens !== 1 ? "s" : ""}
          <br /><span className="text-blue-400">Order 6+ pens to enter next tier (+₱50 per 5)</span>
        </>
      ) : (
        <>
          <strong>₱{formatPrice(pensHandlingFee(totalPens))} handling</strong> for {totalPens} pen{totalPens !== 1 ? "s" : ""}
          <br /><span className="text-blue-400">Tier {Math.floor((totalPens - 1) / 5) + 1} · +₱50 per 5 pens above 5</span>
        </>
      )}
    </div>
  ) : null;

  const uspBacNotice = activeCategory === "USP BAC" ? (
    <div className={`rounded-xl px-3 py-2.5 text-[11px] leading-snug ${
      totalUspBac === 0
        ? "bg-amber-50 text-amber-700 border border-amber-100"
        : "bg-violet-50 text-violet-700 border border-violet-100"
    }`}>
      {totalUspBac === 0 ? (
        <>Handling fee: <strong>₱50 per 50 vials</strong> ordered</>
      ) : (
        <>
          <strong>₱{formatPrice(uspBacHandlingFee(totalUspBac))} handling</strong> for {totalUspBac} vial{totalUspBac !== 1 ? "s" : ""}
          <br /><span className="text-violet-400">+₱50 per 50 vials · next tier at {Math.ceil(totalUspBac / 50) * 50 + 1} vials</span>
        </>
      )}
    </div>
  ) : null;

  const topicalRawsNotice = activeCategory === "TOPICAL RAWS" ? (
    <div className={`rounded-xl px-3 py-2.5 text-[11px] leading-snug ${
      totalTopicalRaws === 0
        ? "bg-amber-50 text-amber-700 border border-amber-100"
        : "bg-teal-50 text-teal-700 border border-teal-100"
    }`}>
      {totalTopicalRaws === 0 ? (
        <>Handling fee: <strong>₱150 base</strong> · <strong>+₱50 per variety at 10g</strong></>
      ) : (
        <>
          <strong>₱{formatPrice(topicalRawsHandlingFee(totalTopicalRaws, topicalRawsVarieties10g))} handling</strong> for {totalTopicalRaws}g ordered
          <br /><span className={totalTopicalRaws < 20 ? "text-amber-500 font-semibold" : "text-teal-400"}>
            {totalTopicalRaws < 20
              ? `MOQ: ${20 - totalTopicalRaws}g more needed across all items`
              : topicalRawsVarieties10g > 0
                ? `${topicalRawsVarieties10g} variet${topicalRawsVarieties10g === 1 ? "y" : "ies"} at 10g · +₱50 each`
                : `+₱50 per variety at 10g`}
          </span>
        </>
      )}
    </div>
  ) : null;

  // ── Main layout ─────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#f8f7f5]">

      {/* ── Top bar ── */}
      <header className="shrink-0 bg-pink-50 border-b border-pink-100 shadow-sm z-10" style={{ background: "linear-gradient(135deg, #fdf2f8 0%, #fce7f3 50%, #f5d0fe 100%)" }}>
        <div className="flex items-center px-4 lg:px-6 gap-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl select-none">🦋</span>
            <div className="flex flex-col leading-none">
              <span className="font-extrabold tracking-tight text-purple-900" style={{ fontSize: "1.5rem", letterSpacing: "-0.02em", textShadow: "0 1px 2px rgba(88,28,135,0.12)" }}>
                Deej Hauls
              </span>
              <span className="text-[11px] text-purple-400 font-medium mt-0.5 hidden sm:block">Group Order Portal</span>
            </div>
            <span className="text-2xl select-none">🦋</span>
          </div>
          {/* Cart button — mobile only */}
          <button
            className="lg:hidden ml-auto flex items-center gap-1.5 bg-purple-600 text-white px-3 py-1.5 rounded-full text-xs font-semibold active:bg-purple-700 transition-colors shadow-sm"
            onClick={() => setShowCart(true)}
          >
            <span>🛒</span>
            {itemsList.length > 0 ? (
              <>
                <span>₱{formatPrice(grandTotal)}</span>
                <span className="bg-white text-purple-600 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">{itemsList.length}</span>
              </>
            ) : (
              <span>Cart</span>
            )}
          </button>
          {/* Desktop cart summary */}
          {itemsList.length > 0 && (
            <div className="hidden lg:flex ml-auto items-center gap-3">
              <span className="text-xs text-purple-400">{itemsList.length} product{itemsList.length !== 1 ? "s" : ""} selected</span>
              <span className="text-sm font-bold text-purple-700 bg-white/70 border border-purple-100 px-3 py-1 rounded-full">₱{formatPrice(grandTotal)}</span>
            </div>
          )}
        </div>
      </header>

      {/* ── Minimum Order Quantities Banner ── */}
      <div className="shrink-0 bg-gradient-to-r from-rose-600 to-purple-700 px-4 py-2.5 text-center z-10">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1.5">Minimum Order Requirements</p>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {(Object.entries(MOQ) as [Category, { qty: number; unit: string }][]).map(([cat, { qty, unit }]) => (
            <span key={cat} className="bg-white/20 border border-white/30 text-white px-2.5 py-0.5 rounded-full text-[11px] font-bold">
              {CATEGORY_META[cat].emoji} {cat}: <span className="font-extrabold">{qty} {unit}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Mobile: horizontal category pills ── */}
      <div className="lg:hidden bg-white border-b border-gray-100 px-4 py-2 flex gap-2 overflow-x-auto shrink-0">
        {CATEGORIES.map((cat) => {
          const catQty = (catMap.get(cat) || []).reduce((s, p) => s + (cart.get(p.productName) || 0), 0);
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                isActive ? "bg-purple-700 text-white" : "bg-gray-100 text-gray-600 active:bg-gray-200"
              }`}
            >
              <span>{CATEGORY_META[cat].emoji}</span>
              <span>{cat}</span>
              {catQty > 0 && (
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isActive ? "bg-white text-purple-700" : "bg-purple-100 text-purple-700"
                }`}>{catQty}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Category nav (desktop only) ── */}
        <aside className="hidden lg:flex w-52 shrink-0 bg-white border-r border-gray-100 flex-col overflow-y-auto">
          <div className="px-4 pt-5 pb-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-2">Categories</p>
          </div>
          <nav className="flex-1 px-2 space-y-0.5">
            {CATEGORIES.map((cat) => {
              const catProducts = catMap.get(cat) || [];
              const catQty = catProducts.reduce((s, p) => s + (cart.get(p.productName) || 0), 0);
              const isActive = activeCategory === cat;
              const meta = CATEGORY_META[cat];
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                    isActive ? "bg-purple-50 text-purple-800" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <span className="text-base leading-none">{meta.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-none ${isActive ? "text-purple-800" : "text-gray-800"}`}>{cat}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5 leading-none truncate">{meta.description}</p>
                  </div>
                  {catQty > 0 && (
                    <span className={`shrink-0 text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center ${
                      isActive ? "bg-purple-700 text-white" : "bg-purple-100 text-purple-700"
                    }`}>{catQty}</span>
                  )}
                </button>
              );
            })}
          </nav>
          {/* Category notices in sidebar */}
          {(cosmeticsNotice || pensNotice || uspBacNotice || topicalRawsNotice) && (
            <div className="px-3 pb-4 space-y-2">
              {cosmeticsNotice}
              {pensNotice}
              {uspBacNotice}
              {topicalRawsNotice}
            </div>
          )}
        </aside>

        {/* ── Middle: Product list ── */}
        <main className="flex-1 overflow-y-auto px-4 lg:px-6 py-4 lg:py-5 pb-28 lg:pb-5">
          {/* Category header */}
          <div className="mb-3 flex items-center gap-3">
            <span className="text-xl lg:text-2xl">{CATEGORY_META[activeCategory].emoji}</span>
            <div>
              <h2 className="text-base lg:text-lg font-bold tracking-tight text-gray-900 leading-none">{activeCategory}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{CATEGORY_META[activeCategory].description}</p>
            </div>
            {(() => {
              const catQty = (catMap.get(activeCategory) || []).reduce((s, p) => s + (cart.get(p.productName) || 0), 0);
              return catQty > 0 ? (
                <span className="ml-auto text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-full">
                  {catQty} selected
                </span>
              ) : null;
            })()}
          </div>

          {/* Admin category note */}
          {categoryNotes[activeCategory] && (
            <div className="mb-3 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2.5 text-xs text-sky-700 leading-relaxed">
              {categoryNotes[activeCategory]}
            </div>
          )}

          {/* Category notices (mobile only — desktop shows in sidebar) */}
          {(cosmeticsNotice || pensNotice || uspBacNotice || topicalRawsNotice) && (
            <div className="lg:hidden mb-3 space-y-2">
              {cosmeticsNotice}
              {pensNotice}
              {uspBacNotice}
              {topicalRawsNotice}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-300">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-rose-400 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm">Loading products…</p>
              </div>
            </div>
          ) : (catMap.get(activeCategory) || []).length === 0 ? (
            <p className="text-center text-gray-400 py-20 text-sm">No products in this category.</p>
          ) : (() => {
            const catProducts = catMap.get(activeCategory) || [];
            // Group by useCase while preserving insertion order
            const useCaseGroups = new Map<string, typeof catProducts>();
            for (const p of catProducts) {
              const uc = p.useCase || "";
              if (!useCaseGroups.has(uc)) useCaseGroups.set(uc, []);
              useCaseGroups.get(uc)!.push(p);
            }
            const showHeaders = useCaseGroups.size > 1 || !useCaseGroups.has("");
            return (
            <div className="space-y-4">
              {[...useCaseGroups.entries()].map(([uc, groupProducts]) => (
                <div key={uc || "__none__"}>
                  {showHeaders && uc && (
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 px-1">{uc}</p>
                  )}
                  <div className="space-y-1.5">
              {groupProducts.map((product) => {
                const qty = cart.get(product.productName) || 0;
                const max = maxQty(product);
                const useToggle = product.vialsPerKit === 1 && product.category !== "COSMETICS" && product.category !== "PENS" && product.category !== "USP BAC" && product.category !== "TOPICAL RAWS";
                const showKit = product.vialsPerKit > 1 && (product.category === "SERUMS" || product.category === "USP BAC");
                const lineTotal = qty * product.pricePerVial;

                return (
                  <div
                    key={product.productName}
                    className={`flex items-center gap-3 bg-white rounded-xl px-3 lg:px-4 py-3 border transition-all ${
                      qty > 0 ? "border-rose-200 shadow-sm shadow-rose-50" : "border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    <div className={`w-1 h-8 rounded-full shrink-0 transition-all ${qty > 0 ? "bg-rose-400" : "bg-transparent"}`} />

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold leading-tight ${qty > 0 ? "text-gray-900" : "text-gray-700"}`}>
                        {product.productName}
                      </p>
                      {product.productFunction && (
                        <p className="text-[10px] text-gray-400 leading-tight mt-0.5 italic">{product.productFunction}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-2 mt-0.5">
                        <span className="text-[11px] text-gray-400">
                          ₱{formatPrice(product.pricePerVial)}<span className="text-gray-300">/item</span>
                        </span>
                        <span className="text-[11px] text-gray-400 hidden sm:inline">
                          · ₱{formatPrice(product.pricePerKit)}<span className="text-gray-300">/box</span>
                        </span>
                        {product.vialsPerKit > 1 && (
                          <span className="text-[11px] text-gray-400 hidden sm:inline">· {product.vialsPerKit} items/kit</span>
                        )}
                      </div>
                      {showKit && <KitBar qty={qty} perKit={product.vialsPerKit} />}
                      {showKit && <CommunityBar slot={slotMap.get(product.productName)} vialsPerKit={product.vialsPerKit} />}
                    </div>

                    <div className="w-14 lg:w-20 text-right shrink-0">
                      {qty > 0 && (
                        <p className={`text-sm font-bold ${showKit && qty % product.vialsPerKit === 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          ₱{formatPrice(lineTotal)}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0">
                      {useToggle ? (
                        <button
                          onClick={() => setQty(product.productName, qty === 0 ? 1 : 0)}
                          className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all ${
                            qty > 0 ? "bg-rose-500 text-white hover:bg-rose-600" : "bg-gray-100 text-gray-500 hover:bg-rose-50 hover:text-rose-600"
                          }`}
                        >
                          {qty > 0 ? "✓" : "Add"}
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setQty(product.productName, Math.max(0, qty - 1))}
                            disabled={qty === 0}
                            className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-25 flex items-center justify-center text-gray-600 text-sm font-bold transition-colors"
                          >−</button>
                          <span className="w-5 text-center text-sm font-semibold text-gray-800 tabular-nums">
                            {qty === 0 ? <span className="text-gray-300">0</span> : qty}
                          </span>
                          <button
                            onClick={() => setQty(product.productName, Math.min(max, qty + 1))}
                            disabled={qty >= max}
                            className="w-7 h-7 rounded-lg bg-rose-100 hover:bg-rose-200 disabled:opacity-25 flex items-center justify-center text-rose-600 text-sm font-bold transition-colors"
                          >+</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
                  </div>
                </div>
              ))}
            </div>
            );
          })()}
        </main>

        {/* ── Right: Order summary (desktop only) ── */}
        <aside className="hidden lg:flex w-72 shrink-0 bg-white border-l border-gray-100 flex-col overflow-hidden">
          {renderOrderPanel()}
        </aside>

      </div>

      {/* ── Mobile: sticky bottom cart bar ── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <button
          onClick={() => setShowCart(true)}
          className="w-full bg-purple-700 text-white py-3 rounded-xl text-sm font-semibold flex items-center justify-between px-4 active:bg-purple-800 transition-colors"
        >
          <span className="flex items-center gap-2">
            🛒
            {itemsList.length > 0
              ? `${itemsList.length} item${itemsList.length !== 1 ? "s" : ""}`
              : "Your Cart"}
          </span>
          <span className="font-bold">
            {itemsList.length > 0 ? `₱${formatPrice(grandTotal)}` : "Empty"}
          </span>
        </button>
      </div>

      {/* ── Mobile: cart drawer overlay ── */}
      {showCart && (
        <div className="lg:hidden fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCart(false)} />
          <div className="relative bg-white rounded-t-2xl flex flex-col shadow-2xl" style={{ maxHeight: "88vh" }}>
            {renderOrderPanel(() => setShowCart(false))}
          </div>
        </div>
      )}

    </div>
  );
}
