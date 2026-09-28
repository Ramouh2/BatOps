"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckIcon, LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Contexte non sécurisé (démo via IP locale) : repli sur la sélection.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const done = document.execCommand("copy");
    area.remove();
    return done;
  }
}

/** Copie du lien du portail client, avec confirmation animée (icône → coche, libellé → « Lien copié »). */
export function CopyLinkButton({
  url,
  label = "Copier le lien",
  className,
  variant = "outline",
  size = "sm",
}: {
  url: string;
  label?: string;
  className?: string;
  variant?: "outline" | "ghost" | "secondary";
  size?: "sm" | "default";
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    if (!(await copyText(url))) {
      toast.error("Copie impossible", { description: url });
      return;
    }
    setCopied(true);
    toast.success("Lien du portail copié", { description: url });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={() => void copy()}
      className={cn("min-w-[8.5rem]", copied && "border-emerald-200 text-emerald-700", className)}
      data-testid="copy-portal-link"
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.span key="done" className="flex items-center gap-1.5" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={SPRING.pop}>
            <CheckIcon />
            Lien copié
          </motion.span>
        ) : (
          <motion.span key="copy" className="flex items-center gap-1.5" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
            <LinkIcon />
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </Button>
  );
}
