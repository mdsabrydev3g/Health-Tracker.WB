/**
 * Minimal RTL-aware UI primitives.
 *
 * Hand-rolled instead of pulling the shadcn CLI so the component set stays
 * small, dependency-light, and guaranteed to build inside Capacitor's webview.
 * Every interactive element respects the 48dp minimum touch target (§14).
 */

import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "md" | "lg" | "xl";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800",
  secondary:
    "bg-white text-brand-700 border-2 border-brand-200 hover:bg-brand-50",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100",
};

const sizes: Record<ButtonSize, string> = {
  md: "min-h-touch px-4 text-base",
  lg: "min-h-touch-lg px-6 text-lg",
  xl: "min-h-[88px] px-8 text-2xl font-bold",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

type BadgeTone = "ok" | "warn" | "danger" | "muted" | "info";

const tones: Record<BadgeTone, string> = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warn: "bg-amber-50 text-amber-800 border-amber-200",
  danger: "bg-rose-50 text-rose-700 border-rose-200",
  muted: "bg-slate-100 text-slate-600 border-slate-200",
  info: "bg-brand-50 text-brand-700 border-brand-200",
};

export function Badge({
  tone = "muted",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "info",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: BadgeTone;
}) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-3xl font-bold tabular-nums">{value}</span>
      {hint ? <span className={cn("text-xs", tone === "danger" ? "text-rose-600" : "text-slate-500")}>{hint}</span> : null}
    </Card>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-lg font-bold text-slate-800">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <Card className="text-center text-slate-500 py-10">{children}</Card>
  );
}
