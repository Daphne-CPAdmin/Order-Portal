"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // Don't show sidebar on login page
  if (pathname === "/admin") {
    return <>{children}</>;
  }

  const navLinks = [
    { href: "/admin/dashboard", label: "Dashboard" },
    { href: "/admin/orders", label: "Orders" },
    { href: "/admin/products", label: "Products" },
  ];
  // Note: Batch management is embedded in the Dashboard page

  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/admin");
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-6 py-5 border-b border-gray-200">
          <span className="font-bold text-lg text-rose-600">Deej Hauls</span>
          <p className="text-xs text-gray-400 mt-0.5">Admin Panel</p>
        </div>
        <nav className="flex-1 py-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`block px-6 py-2.5 text-sm font-medium transition-colors ${
                pathname.startsWith(link.href)
                  ? "bg-rose-50 text-rose-700 border-r-2 border-rose-600"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="px-6 py-4 border-t border-gray-200">
          <Link
            href="/"
            className="block text-xs text-gray-400 hover:text-gray-600 mb-2"
          >
            ← View order form
          </Link>
          <button
            onClick={handleLogout}
            className="text-xs text-red-500 hover:text-red-700"
          >
            Log out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
