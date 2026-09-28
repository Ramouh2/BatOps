"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { EASE_OUT, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** État vide : icône, explication courte et action directe. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      className={cn("flex flex-col items-center justify-center px-6 py-10 text-center", className)}
    >
      <motion.span
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...SPRING.pop, delay: 0.05 }}
        className="flex size-11 items-center justify-center rounded-full bg-slate-100 ring-8 ring-slate-50"
      >
        <Icon className="size-5 text-slate-400" strokeWidth={1.75} />
      </motion.span>
      <p className="mt-4 text-sm font-medium text-slate-900">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </motion.div>
  );
}
