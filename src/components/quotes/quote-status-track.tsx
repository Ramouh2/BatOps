"use client";

import { motion } from "motion/react";
import { CheckIcon, EyeIcon, FilePenLineIcon, FileSignatureIcon, FileXIcon, HourglassIcon, SendIcon } from "lucide-react";
import type { ISODateTime, QuoteStatus } from "@/types/batops";
import { useNow } from "@/lib/store";
import { formatRelativeTime } from "@/lib/domain/format";
import { DURATION, EASE_OUT, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface Step {
  key: string;
  label: string;
  icon: typeof SendIcon;
  at?: ISODateTime;
  tone: "done" | "current" | "todo" | "danger" | "muted";
}

const DOT_TONE: Record<Step["tone"], string> = {
  done: "bg-primary text-white ring-primary/20",
  current: "bg-white text-primary ring-primary",
  todo: "bg-white text-slate-400 ring-slate-200",
  danger: "bg-rose-600 text-white ring-rose-200",
  muted: "bg-slate-400 text-white ring-slate-200",
};

/**
 * Cycle de vie du devis : Brouillon → Envoyé → Signé (ou Refusé / Expiré).
 * Le trait se remplit et les pastilles « poppent » à chaque changement de statut.
 */
export function QuoteStatusTrack({
  status,
  sentAt,
  viewedAt,
  signedAt,
  refusedAt,
  className,
}: {
  status: QuoteStatus;
  sentAt?: ISODateTime;
  viewedAt?: ISODateTime;
  signedAt?: ISODateTime;
  refusedAt?: ISODateTime;
  className?: string;
}) {
  const now = useNow();
  const sent = status !== "brouillon";
  const final: Step =
    status === "refuse"
      ? { key: "final", label: "Refusé", icon: FileXIcon, at: refusedAt, tone: "danger" }
      : status === "expire"
        ? { key: "final", label: "Expiré", icon: HourglassIcon, tone: "muted" }
        : { key: "final", label: "Signé", icon: FileSignatureIcon, at: signedAt, tone: status === "accepte" ? "done" : "todo" };
  const steps: Step[] = [
    { key: "draft", label: "Brouillon", icon: FilePenLineIcon, tone: sent ? "done" : "current" },
    { key: "sent", label: viewedAt && status === "envoye" ? "Envoyé · consulté" : "Envoyé", icon: viewedAt && status === "envoye" ? EyeIcon : SendIcon, at: viewedAt && status === "envoye" ? viewedAt : sentAt, tone: sent ? (status === "envoye" ? "current" : "done") : "todo" },
    final,
  ];
  const progress = status === "brouillon" ? 0 : status === "envoye" ? 0.5 : 1;
  const fill = status === "refuse" ? "bg-rose-500" : status === "expire" ? "bg-slate-400" : "bg-primary";

  return (
    <div className={cn("relative", className)} data-testid="quote-status-track" data-status={status}>
      <div className="absolute top-3.5 right-[16.66%] left-[16.66%] h-0.5 rounded-full bg-slate-200" aria-hidden="true">
        <motion.div
          className={cn("h-full origin-left rounded-full transition-colors duration-500", fill)}
          initial={false}
          animate={{ scaleX: progress }}
          transition={{ duration: DURATION.slow * 1.6, ease: EASE_OUT }}
        />
      </div>
      <ol className="relative grid grid-cols-3">
        {steps.map((step) => {
          const Icon = step.tone === "done" && step.key !== "final" ? CheckIcon : step.icon;
          return (
            <li key={step.key} className="flex flex-col items-center gap-1.5 text-center" aria-current={step.tone === "current" ? "step" : undefined}>
              <motion.span
                key={`${step.key}-${step.tone}`}
                initial={{ scale: 0.6, opacity: 0.4 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={SPRING.pop}
                className={cn("relative flex size-7 items-center justify-center rounded-full ring-2", DOT_TONE[step.tone])}
              >
                {step.tone === "current" ? (
                  <motion.span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full ring-2 ring-primary/40"
                    animate={{ scale: [1, 1.45], opacity: [0.7, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                  />
                ) : null}
                <Icon className="size-3.5" strokeWidth={2.4} />
              </motion.span>
              <span className={cn("text-xs font-medium", step.tone === "todo" ? "text-slate-400" : step.tone === "danger" ? "text-rose-700" : "text-slate-800")}>
                {step.label}
              </span>
              {step.at ? <span className="-mt-1 text-[11px] text-muted-foreground">{formatRelativeTime(step.at, now)}</span> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
