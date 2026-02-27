"use client";

import { useState, useEffect, useCallback } from "react";
import { Product } from "@/lib/types";

const CATEGORIES = ["USP BAC", "COSMETICS", "SERUMS", "PENS"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_META: Record<Category, { emoji: string; description: string }> = {
  "USP BAC": { emoji: "💉", description: "Bacteriostatic water" },
  COSMETICS:  { emoji: "✨", description: "Skincare & beauty" },
  SERUMS:     { emoji: "🧪", description: "Peptide serums" },
  PENS:       { emoji: "🖊️", description: "Injection pens" },
};

const MULTI_ITEM_MAX = 10;
const USP_BAC_MAX = 200;
const COSMETICS_BULK_THRESHOLD = 3;
const COSMETICS_BULK_DISCOUNT = 100;

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

function formatPrice(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function maxQty(product: Product) {
  if (product.vialsPerKit > 1) return product.vialsPerKit;
  if (product.category === "USP BAC") return USP_BAC_MAX;
  if (product.category === "COSMETICS" || product.category === "PENS") return MULTI_ITEM_MAX;
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
  const [error, setError] = useState("");
  const [showCart, setShowCart] = useState(false);
  const [categoryNotes, setCategoryNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((data) => { setProducts(data.filter((p: Product) => p.active)); setLoading(false); })
      .catch(() => setLoading(false));
    fetch("/api/category-notes")
      .then((r) => r.json())
      .then(setCategoryNotes)
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
  const handlingByCat = new Map<string, number>();
  for (const cat of categoriesOrdered) {
    if (cat === "PENS") handlingByCat.set(cat, pensHandlingFee(totalPens));
    else if (cat === "USP BAC") handlingByCat.set(cat, uspBacHandlingFee(totalUspBac));
    else handlingByCat.set(cat, products.find((p) => p.category === cat)?.handlingFee || 100);
  }

  const subtotal = [...subtotalByCat.values()].reduce((a, b) => a + b, 0);
  const handlingTotal = [...handlingByCat.values()].reduce((a, b) => a + b, 0);
  const cosmeticsItems = itemsList.filter((i) => i.product.category === "COSMETICS");
  // Discount is per-product: ₱100 off for each unit beyond the first 3 of the SAME item
  const cosmeticsDiscount = cosmeticsItems.reduce((s, i) => {
    return s + Math.max(0, i.qty - COSMETICS_BULK_THRESHOLD) * COSMETICS_BULK_DISCOUNT;
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
          telegramUsername: telegram.startsWith("@") ? telegram.trim() : `@${telegram.trim()}`,
          items: itemsList.map(({ product, qty }) => ({
            productName: product.productName, category: product.category,
            qtyVials: qty, pricePerVial: product.pricePerVial, vialsPerKit: product.vialsPerKit,
          })),
        }),
      });
      if (res.ok) { setOrderId((await res.json()).orderId); setSubmitted(true); }
      else setError((await res.json()).error || "Failed to submit order.");
    } catch { setError("Network error. Please try again."); }
    finally { setSubmitting(false); }
  }

  // ── Success ──────────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 to-pink-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-rose-100 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-5 text-3xl">🎉</div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">Order Received!</h2>
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
          <p className="text-xs text-gray-400">We&apos;ll reach out to you on Telegram ({telegram}).</p>
          <button onClick={() => { setSubmitted(false); setCart(new Map()); setCustomerName(""); setTelegram(""); }} className="mt-5 text-rose-500 text-sm hover:underline font-medium">
            Place another order →
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
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <p className="text-2xl mb-2">🛒</p>
              <p className="text-xs text-gray-400 leading-relaxed">Select items from the<br />catalog to get started.</p>
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
                        const showKitHint = product.vialsPerKit > 1 && product.category === "SERUMS";
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
                <span className="text-rose-600">₱{formatPrice(grandTotal)}</span>
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
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent placeholder:text-gray-300"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Telegram</label>
              <input
                type="text"
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
                placeholder="@username"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent placeholder:text-gray-300"
              />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={submitting || !itemsList.length}
              className="w-full bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm shadow-rose-200 disabled:shadow-none"
            >
              {submitting ? "Placing order…" : itemsList.length ? `Place Order · ₱${formatPrice(grandTotal)}` : "Place Order"}
            </button>
          </form>
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
        : <>Order &gt;3 of the <strong>same item</strong> for <strong>₱100/box off</strong> each extra</>
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

  // ── Main layout ─────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#f8f7f5]">

      {/* ── Top bar ── */}
      <header className="h-14 shrink-0 bg-white border-b border-gray-100 flex items-center px-4 lg:px-6 gap-4 shadow-sm z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-rose-500 flex items-center justify-center text-white text-xs font-bold tracking-tight">DH</div>
          <span className="font-semibold text-gray-900 tracking-tight">Deej Hauls</span>
          <span className="text-gray-300 text-sm hidden sm:inline">·</span>
          <span className="text-xs text-gray-400 font-medium hidden sm:inline">Group Order Portal</span>
        </div>
        {/* Cart button — mobile only */}
        <button
          className="lg:hidden ml-auto flex items-center gap-1.5 bg-rose-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold active:bg-rose-600 transition-colors"
          onClick={() => setShowCart(true)}
        >
          <span>🛒</span>
          {itemsList.length > 0 ? (
            <>
              <span>₱{formatPrice(grandTotal)}</span>
              <span className="bg-white text-rose-500 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">{itemsList.length}</span>
            </>
          ) : (
            <span>Cart</span>
          )}
        </button>
        {/* Desktop cart summary */}
        {itemsList.length > 0 && (
          <div className="hidden lg:flex ml-auto items-center gap-3">
            <span className="text-xs text-gray-400">{itemsList.length} product{itemsList.length !== 1 ? "s" : ""} selected</span>
            <span className="text-sm font-bold text-rose-600 bg-rose-50 px-3 py-1 rounded-full">₱{formatPrice(grandTotal)}</span>
          </div>
        )}
      </header>

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
                isActive ? "bg-rose-500 text-white" : "bg-gray-100 text-gray-600 active:bg-gray-200"
              }`}
            >
              <span>{CATEGORY_META[cat].emoji}</span>
              <span>{cat}</span>
              {catQty > 0 && (
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isActive ? "bg-white text-rose-500" : "bg-rose-100 text-rose-600"
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
                    isActive ? "bg-rose-50 text-rose-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <span className="text-base leading-none">{meta.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-none ${isActive ? "text-rose-700" : "text-gray-800"}`}>{cat}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5 leading-none truncate">{meta.description}</p>
                  </div>
                  {catQty > 0 && (
                    <span className={`shrink-0 text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center ${
                      isActive ? "bg-rose-500 text-white" : "bg-rose-100 text-rose-600"
                    }`}>{catQty}</span>
                  )}
                </button>
              );
            })}
          </nav>
          {/* Category notices in sidebar */}
          {(cosmeticsNotice || pensNotice || uspBacNotice) && (
            <div className="px-3 pb-4 space-y-2">
              {cosmeticsNotice}
              {pensNotice}
              {uspBacNotice}
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
          {(cosmeticsNotice || pensNotice || uspBacNotice) && (
            <div className="lg:hidden mb-3 space-y-2">
              {cosmeticsNotice}
              {pensNotice}
              {uspBacNotice}
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
          ) : (
            <div className="space-y-1.5">
              {(catMap.get(activeCategory) || []).map((product) => {
                const qty = cart.get(product.productName) || 0;
                const max = maxQty(product);
                const useToggle = product.vialsPerKit === 1 && product.category !== "COSMETICS" && product.category !== "PENS" && product.category !== "USP BAC";
                const showKit = product.vialsPerKit > 1 && product.category === "SERUMS";
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
          )}
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
          className="w-full bg-rose-500 text-white py-3 rounded-xl text-sm font-semibold flex items-center justify-between px-4 active:bg-rose-600 transition-colors"
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
