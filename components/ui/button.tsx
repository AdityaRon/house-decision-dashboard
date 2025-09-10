import * as React from "react";
export function Button({ className = "", variant = "default", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "outline" | "secondary" }) {
  const base = "inline-flex items-center justify-center px-3 py-2 rounded-2xl text-sm font-medium transition";
  const styles = { default: "bg-slate-900 text-white hover:opacity-90", outline: "border bg-white hover:bg-slate-50", secondary: "bg-slate-100 hover:bg-slate-200" }[variant];
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}
