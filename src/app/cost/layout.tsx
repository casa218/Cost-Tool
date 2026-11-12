import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Casa 218 · Food cost",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function CostLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-border bg-surface print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/cost">
            <p className="text-xs uppercase tracking-wide text-ink-muted">Casa 218</p>
            <p className="text-lg font-semibold">Food cost</p>
          </Link>
          <nav className="flex gap-2 text-sm">
            <Link href="/cost" className="rounded-full px-3 py-2 hover:bg-brand-50">
              Dishes
            </Link>
            <Link href="/cost/suppliers" className="rounded-full px-3 py-2 hover:bg-brand-50">
              Supplier prices
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </>
  );
}
