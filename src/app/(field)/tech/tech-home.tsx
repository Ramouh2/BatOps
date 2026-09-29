"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarCheckIcon, CalendarClockIcon, MapPinIcon, NavigationIcon, SparklesIcon } from "lucide-react";
import type { Client, Intervention } from "@/types/batops";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Swap } from "@/components/motion/swap";
import { ModuleScopeCard } from "@/components/modules/module-roadmap";
import { useSwitchProfile } from "@/components/layout/use-switch-profile";
import { useCurrentUser, useData, useNow } from "@/lib/store";
import { selectInterventionsOfDay, selectTechnicians } from "@/lib/store/selectors";
import { selectScheduleNews, selectUpcomingForTechnician, type ScheduleNews } from "@/lib/store/planning-selectors";
import { clientDisplayName } from "@/lib/domain/clients";
import { addDays, startOfDay, toDate, toISODate } from "@/lib/domain/dates";
import { formatDateLong, formatDuration } from "@/lib/domain/format";
import { scheduleOf, segmentOnDay } from "@/lib/domain/planning";
import { INTERVENTION_STATUS, INTERVENTION_TYPE_LABEL, PRIORITY } from "@/lib/domain/labels";
import { DURATION, EASE_OUT, listItem, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Aperçu terrain pour le bureau : choisir le technicien dont on veut voir la journée. */
function FieldPreviewPicker() {
  const data = useData((d) => d);
  const now = useNow();
  const switchProfile = useSwitchProfile();
  const technicians = selectTechnicians(data);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Aperçu de l&apos;app terrain</CardTitle>
        <CardDescription>
          Choisissez le technicien dont vous voulez voir la journée. Vous pourrez revenir à votre profil depuis le menu en
          haut à droite.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {technicians.map((t) => {
          const count = selectInterventionsOfDay(data, now, t.id).length;
          return (
            <Button key={t.id} variant="outline" size="field" className="justify-start" onClick={() => switchProfile(t.id)}>
              <UserAvatar user={t} className="size-8 text-xs" />
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate">{t.full_name}</span>
                <span className="block text-sm font-normal text-muted-foreground">
                  {count} intervention{count > 1 ? "s" : ""} aujourd&apos;hui
                </span>
              </span>
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}

function NewsBadge({ news }: { news?: ScheduleNews }) {
  return (
    <AnimatePresence initial={false}>
      {news ? (
        <motion.span
          key={news}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={SPRING.pop}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
            news === "nouveau" ? "bg-primary text-white" : "bg-amber-100 text-amber-800",
          )}
          data-testid="tech-news"
        >
          <SparklesIcon className="size-3" />
          {news === "nouveau" ? "Nouveau" : "Horaire modifié"}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}

/** Créneau du jour : `08:00 – 10:00`, ou `Jour 2 · 08:00 – 18:00` pour un chantier sur plusieurs jours. */
function slotLabel(job: Intervention, day: Date): string {
  const range = scheduleOf(job);
  const segment = range ? segmentOnDay(range, day) : null;
  if (!range || !segment) return "--:--";
  const time = `${hhmm(segment.startMin)} – ${hhmm(segment.endMin)}`;
  if (!segment.continuesBefore && !segment.continuesAfter) return time;
  let index = 0;
  for (let d = startOfDay(range.start); d <= day; d = addDays(d, 1)) if (segmentOnDay(range, d)) index += 1;
  return `Jour ${index} · ${time}`;
}

function JobCard({ job, client, day, news, index }: { job: Intervention; client?: Client; day: Date; news?: ScheduleNews; index: number }) {
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${job.address}, ${job.postal_code} ${job.city}`)}`;
  return (
    <motion.li
      layout
      variants={listItem}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ ...SPRING.layout, delay: Math.min(index * 0.05, 0.3) }}
      className={cn("relative overflow-hidden rounded-xl border border-l-4 bg-card p-4 shadow-xs", news ? "border-l-primary" : "border-l-slate-300")}
      data-testid="tech-job"
      data-reference={job.reference}
    >
      {news ? (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-blue-50"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.6, delay: 0.4, ease: "easeOut" }}
        />
      ) : null}
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-lg font-semibold text-slate-900 tabular">
          <Swap swapKey={`${job.scheduled_start}-${job.scheduled_end}`}>{slotLabel(job, day)}</Swap>
        </p>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge meta={INTERVENTION_STATUS[job.status]} />
          <NewsBadge news={news} />
        </div>
      </div>
      <p className="relative mt-1 text-base font-medium text-slate-900">{job.title}</p>
      <p className="relative mt-0.5 text-sm text-muted-foreground">
        {INTERVENTION_TYPE_LABEL[job.type]} · {client ? clientDisplayName(client) : "Client"} · {formatDuration(job.duration_minutes)}
      </p>
      <p className="relative mt-2 flex items-center gap-1.5 text-sm text-slate-600">
        <MapPinIcon className="size-4 shrink-0 text-slate-400" />
        {job.site_label ? `${job.site_label}, ` : ""}
        {job.address}, {job.city}
      </p>
      {job.description ? <p className="relative mt-2 line-clamp-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{job.description}</p> : null}
      <div className="relative mt-3 flex flex-wrap items-center gap-2">
        {job.priority !== "normale" ? <StatusBadge meta={{ ...PRIORITY[job.priority], label: `Priorité ${PRIORITY[job.priority].label.toLowerCase()}` }} /> : null}
        <Button asChild variant="outline" size="field" className="ml-auto h-11 w-auto px-4">
          <a href={mapsUrl} target="_blank" rel="noreferrer">
            <NavigationIcon />
            Itinéraire
          </a>
        </Button>
      </div>
    </motion.li>
  );
}

/**
 * Journée du technicien et interventions à venir (lecture ; les actions terrain arrivent au Sprint 4).
 * Aucune donnée financière n'est lue ici : ni prix, ni pièces chiffrées, ni facture.
 */
export function TechHome() {
  const user = useCurrentUser();
  const interventions = useData((d) => d.interventions);
  const activities = useData((d) => d.activities);
  const clients = useData((d) => d.clients);
  const now = useNow();

  const jobs = useMemo(() => (user ? selectInterventionsOfDay({ interventions }, now, user.id) : []), [interventions, now, user]);
  const upcoming = useMemo(() => (user ? selectUpcomingForTechnician({ interventions }, user.id, now) : []), [interventions, now, user]);
  const news = useMemo(() => (user ? selectScheduleNews({ interventions, activities }, user.id, now) : new Map<string, ScheduleNews>()), [interventions, activities, now, user]);
  const upcomingDays = useMemo(() => {
    const groups: { key: string; day: Date; jobs: Intervention[] }[] = [];
    for (const job of upcoming) {
      const day = toDate(job.scheduled_start!);
      const key = toISODate(day);
      const group = groups.at(-1);
      if (group?.key === key) group.jobs.push(job);
      else groups.push({ key, day, jobs: [job] });
    }
    return groups;
  }, [upcoming]);

  if (!user) return null;
  if (user.role !== "technician") return <FieldPreviewPicker />;

  const firstName = user.full_name.split(" ")[0];
  const clientOf = (job: Intervention) => clients.find((c) => c.id === job.client_id);
  const newCount = [...news.keys()].length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Bonjour {firstName}</h1>
        <p className="mt-1 text-base text-muted-foreground" data-testid="tech-summary">
          <Swap swapKey={jobs.length}>
            {jobs.length === 0
              ? "Aucune intervention prévue aujourd'hui."
              : `${jobs.length} intervention${jobs.length > 1 ? "s" : ""} prévue${jobs.length > 1 ? "s" : ""} aujourd'hui.`}
          </Swap>
        </p>
        <AnimatePresence initial={false}>
          {newCount > 0 ? (
            <motion.p
              key="news"
              initial={{ opacity: 0, y: -4, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: DURATION.base, ease: EASE_OUT }}
              className="mt-2 flex items-center gap-2 overflow-hidden text-sm font-medium text-primary"
            >
              <SparklesIcon className="size-4" />
              {newCount} changement{newCount > 1 ? "s" : ""} de planning par le bureau depuis hier
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <section aria-labelledby="tech-today">
        <h2 id="tech-today" className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
          Aujourd&apos;hui
        </h2>
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed bg-card px-6 py-10 text-center">
            <CalendarCheckIcon className="size-8 text-slate-400" />
            <p className="mt-3 text-base font-medium text-slate-900">Journée libre</p>
            <p className="mt-1 text-sm text-muted-foreground">Les interventions planifiées par le bureau apparaîtront ici.</p>
          </div>
        ) : (
          <ol className="space-y-3">
            <AnimatePresence initial={false} mode="popLayout">
              {jobs.map((job, index) => (
                <JobCard key={job.id} job={job} client={clientOf(job)} day={now} news={news.get(job.id)} index={index} />
              ))}
            </AnimatePresence>
          </ol>
        )}
      </section>

      <section aria-labelledby="tech-upcoming" data-testid="tech-upcoming">
        <h2 id="tech-upcoming" className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">
          <CalendarClockIcon className="size-4" />À venir (7 jours)
          <span className="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-600 tabular">
            <Swap swapKey={upcoming.length}>{upcoming.length}</Swap>
          </span>
        </h2>
        {upcomingDays.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card px-4 py-6 text-center text-sm text-muted-foreground">Rien de planifié pour les 7 prochains jours.</p>
        ) : (
          <div className="space-y-5">
            <AnimatePresence initial={false} mode="popLayout">
              {upcomingDays.map((group) => (
                <motion.div key={group.key} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={SPRING.layout}>
                  <p className="mb-2 text-sm font-medium text-slate-700 first-letter:uppercase">{formatDateLong(group.day)}</p>
                  <ol className="space-y-3">
                    <AnimatePresence initial={false} mode="popLayout">
                      {group.jobs.map((job, index) => (
                        <JobCard key={job.id} job={job} client={clientOf(job)} day={group.day} news={news.get(job.id)} index={index} />
                      ))}
                    </AnimatePresence>
                  </ol>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      <ModuleScopeCard module="tech" />
    </div>
  );
}
