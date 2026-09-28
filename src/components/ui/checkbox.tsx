"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

/** Case à cocher accessible (role="checkbox") dont la coche se dessine. */
function Checkbox({
  checked,
  onCheckedChange,
  className,
  tone = "primary",
  ...props
}: Omit<React.ComponentProps<"button">, "onChange"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  tone?: "primary" | "ai" | "success";
}) {
  const fill = { primary: "border-primary bg-primary", ai: "border-amber-500 bg-amber-500", success: "border-emerald-600 bg-emerald-600" }[tone];
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border border-slate-300 bg-card shadow-xs transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-50",
        checked && fill,
        className,
      )}
      {...props}
    >
      <AnimatePresence initial={false}>
        {checked ? (
          <motion.svg key="check" viewBox="0 0 16 16" className="size-3.5 text-white" initial={{ scale: 0.6 }} animate={{ scale: 1 }} exit={{ scale: 0.6, opacity: 0 }} aria-hidden="true">
            <motion.path
              d="M3.5 8.5l3 3 6-7"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            />
          </motion.svg>
        ) : null}
      </AnimatePresence>
    </button>
  );
}

export { Checkbox };
