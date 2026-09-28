"use client";

import { useId, type ReactNode } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { LayoutGroup, motion } from "motion/react";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface SegmentItem<T extends string> {
  value: T;
  label: ReactNode;
  /** Élément à droite du libellé (compteur…). */
  suffix?: ReactNode;
}

/**
 * Onglets / filtres avec pastille active qui glisse d'un choix à l'autre (layoutId).
 * Accessibles au clavier (flèches) grâce à Radix Tabs.
 */
export function SegmentedTabs<T extends string>({
  value,
  onValueChange,
  items,
  label,
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  items: SegmentItem<T>[];
  label: string;
  className?: string;
}) {
  const id = useId();
  return (
    <TabsPrimitive.Root value={value} onValueChange={(v) => onValueChange(v as T)} activationMode="automatic">
      <LayoutGroup id={id}>
        <TabsPrimitive.List
          aria-label={label}
          className={cn("inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-slate-100 p-1", className)}
        >
          {items.map((item) => {
            const active = item.value === value;
            return (
              <TabsPrimitive.Trigger
                key={item.value}
                value={item.value}
                className={cn(
                  "relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap text-slate-500 transition-colors outline-none hover:text-slate-900 focus-visible:ring-[3px] focus-visible:ring-ring/40",
                  active && "text-slate-900",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="segment-pill"
                    className="absolute inset-0 rounded-md bg-white shadow-sm ring-1 ring-slate-900/5"
                    transition={SPRING.snappy}
                  />
                ) : null}
                <span className="relative">{item.label}</span>
                {item.suffix !== undefined ? <span className="relative">{item.suffix}</span> : null}
              </TabsPrimitive.Trigger>
            );
          })}
        </TabsPrimitive.List>
      </LayoutGroup>
    </TabsPrimitive.Root>
  );
}

/** Choix exclusif dans un formulaire (type de client, statut…), même pastille animée. */
export function SegmentedChoice<T extends string>({
  value,
  onValueChange,
  options,
  name,
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: string }[];
  name: string;
  className?: string;
}) {
  const id = useId();
  return (
    <LayoutGroup id={id}>
      <div role="radiogroup" aria-label={name} className={cn("grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-slate-100 p-1", className)}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onValueChange(option.value)}
              onKeyDown={(event) => {
                const index = options.findIndex((o) => o.value === value);
                if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                  event.preventDefault();
                  onValueChange(options[(index + 1) % options.length].value);
                }
                if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                  event.preventDefault();
                  onValueChange(options[(index - 1 + options.length) % options.length].value);
                }
              }}
              tabIndex={active ? 0 : -1}
              className={cn(
                "relative h-8 rounded-md px-3 text-sm font-medium text-slate-500 transition-colors outline-none hover:text-slate-900 focus-visible:ring-[3px] focus-visible:ring-ring/40",
                active && "text-slate-900",
              )}
            >
              {active ? (
                <motion.span layoutId="choice-pill" className="absolute inset-0 rounded-md bg-white shadow-sm ring-1 ring-slate-900/5" transition={SPRING.snappy} />
              ) : null}
              <span className="relative">{option.label}</span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
