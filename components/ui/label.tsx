import * as React from "react";

export function Label({ className = "", ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={`block text-xs uppercase tracking-wide text-slate-600 mb-1 ${className}`} {...props} />;
}
