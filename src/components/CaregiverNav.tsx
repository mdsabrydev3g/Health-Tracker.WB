"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, LayoutDashboard, Package, Pill } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "اليوم", Icon: LayoutDashboard },
  { href: "/medications", label: "الأدوية", Icon: Pill },
  { href: "/inventory", label: "المخزون", Icon: Package },
  { href: "/reports", label: "التقارير", Icon: CalendarDays },
];

export function CaregiverNav() {
  const pathname = usePathname();

  return (
    <nav className="safe-bottom fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur">
      <ul className="mx-auto flex max-w-3xl">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-touch-lg flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                  active ? "text-brand-700" : "text-slate-500",
                )}
              >
                <Icon size={24} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
