"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/domain/format";
import { parseDecimal } from "@/lib/domain/validation";
import { cn } from "@/lib/utils";

/**
 * Saisie décimale à la française (`12,5`) : chaque valeur valide est transmise immédiatement
 * (totaux et marge recalculés en direct) ; une saisie invalide reste locale et s'affiche en rouge.
 */
export function DecimalInput({
  value,
  onValueChange,
  min = 0,
  max,
  allowZero = false,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type" | "min" | "max"> & {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  allowZero?: boolean;
}) {
  const [text, setText] = useState(() => formatNumber(value).replace(/\s/g, ""));
  const [editing, setEditing] = useState(false);
  const parsed = parseDecimal(text);
  const invalid = parsed === null || parsed < min || (max !== undefined && parsed > max) || (!allowZero && parsed === 0);
  const shown = editing ? text : formatNumber(value).replace(/\s/g, "");

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={shown}
      aria-invalid={editing && invalid ? true : undefined}
      className={cn("tabular", editing && invalid && "border-rose-400 focus-visible:ring-rose-200", className)}
      onFocus={(event) => {
        setText(formatNumber(value).replace(/\s/g, ""));
        setEditing(true);
        props.onFocus?.(event);
        event.currentTarget.select();
      }}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        const n = parseDecimal(next);
        if (n !== null && n >= min && (max === undefined || n <= max) && (allowZero || n !== 0)) onValueChange(n);
      }}
      onBlur={(event) => {
        setEditing(false);
        props.onBlur?.(event);
      }}
    />
  );
}
