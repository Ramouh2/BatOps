"use client";

import { motion } from "motion/react";
import { BanIcon, CalendarCheckIcon, CheckIcon, FlagIcon, InboxIcon, NavigationIcon, WrenchIcon } from "lucide-react";
import type { Intervention } from "@/types/batops";
import { useNow } from "@/lib/store";
import { formatRelativeTime } from "@/lib/domain/format";
import { DURATION, EASE_OUT, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Tone = "done" | "current" | "todo" | "danger";

const DOT_TONE: Record<Tone, string> = {
  done: "bg-primary text-white ring-primary/20",
  current: "bg-white text-primary ring-primary",
  todo: "bg-white text-slate-400 ring-slate-200",
  danger: "bg-slate-500 text-white ring-slate-200",
};

const FIELD_LABEL = { en_route: "En route", sur_place: "Sur place", en_cours: "En cours" } as const;

/**
 * Cycle de vie : À planifier → Planifiée → Sur le terrain → Terminée (ou Annulée).
 * Le trait se remplit et la pastille active « pulse » ; chaque changement de statut rejoue le pop.
 */
export function InterventionStatusTrack({ intervention, className }: { intervention: Intervention; className?: string }) {
  const now = useNow();
  const { status } = intervention;
  const rank = { nouvelle: 0, planifiee: 1, en_route: 2, sur_place: 2, en_cours: 2, terminee: 3, annulee: -1 }[status];
  const cancelled = status === "annulee";
  const tone = (index: number): Tone => (cancelled ? (index === 3 ? "danger" : "todo") : index < rank || (index === 3 && rank === 3) ? "done" : index === rank ? "current" : "todo");
  const fieldLabel = status in FIELD_LABEL ? FIELD_LABEL[status as keyof typeof FIELD_LABEL] : "Sur le terrain";
  const steps = [
    { key: "new", label: "À planifier", icon: InboxIcon, at: intervention.created_at },
    { key: "planned", label: "Planifiée", icon: CalendarCheckIcon, at: rank >= 1 ? intervention.scheduled_start : undefined },
    { key: "field", label: fieldLabel, icon: status === "en_route" ? NavigationIcon : WrenchIcon, at: intervention.actual_start ?? intervention.en_route_at },
    cancelled
      ? { key: "final", label: "Annulée", icon: BanIcon, at: undefined }
      : { key: "final", label: "Terminée", icon: FlagIcon, at: intervention.actual_end },
  ];
  const progress = cancelled ? 0 : Math.max(rank, 0) / 3;

  return (
    <div className={cn("relative", className)} data-testid="intervention-status-track" data-status={status}>
      <div className="absolute top-3.5 right-[12.5%] left-[12.5%] h-0.5 rounded-full bg-slate-200" aria-hidden="true">
        <motion.div
          className="h-full origin-left rounded-full bg-primary"
          initial={false}
          animate={{ scaleX: progress }}
          transition={{ duration: DURATION.slow * 1.6, ease: EASE_OUT }}
        />
      </div>
      <ol className="relative grid grid-cols-4">
        {steps.map((step, index) => {
          const t = tone(index);
          const Icon = t === "done" && step.key !== "final" ? CheckIcon : step.icon;
          return (
            <li key={step.key} className="flex flex-col items-center gap-1.5 text-center" aria-current={t === "current" ? "step" : undefined}>
              <motion.span
                key={`${step.key}-${t}-${step.label}`}
                initial={{ scale: 0.6, opacity: 0.4 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={SPRING.pop}
                className={cn("relative flex size-7 items-center justify-center rounded-full ring-2", DOT_TONE[t])}
              >
                {t === "current" ? (
                  <motion.span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full ring-2 ring-primary/40"
                    animate={{ scale: [1, 1.45], opacity: [0.7, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                  />
                ) : null}
                <Icon className="size-3.5" strokeWidth={2.4} />
              </motion.span>
              <span className={cn("text-xs font-medium", t === "todo" ? "text-slate-400" : "text-slate-800")}>{step.label}</span>
              {step.at && t !== "todo" ? <span className="-mt-1 text-[11px] text-muted-foreground">{formatRelativeTime(step.at, now)}</span> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
