"use client";

import { useMemo } from "react";
import { CalendarCheckIcon, MapPinIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ModuleScopeCard } from "@/components/modules/module-roadmap";
import { useSwitchProfile } from "@/components/layout/use-switch-profile";
import { useCurrentUser, useData, useNow } from "@/lib/store";
import { selectInterventionsOfDay, selectTechnicians } from "@/lib/store/selectors";
import { clientDisplayName } from "@/lib/domain/clients";
import { formatTime } from "@/lib/domain/format";
import { INTERVENTION_STATUS, INTERVENTION_TYPE_LABEL, PRIORITY } from "@/lib/domain/labels";

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

/**
 * Journée du technicien (Sprint 0 : lecture seule). Aucune donnée financière n'est lue ici.
 * Les actions terrain (statuts, photos, signature) arrivent au Sprint 4.
 */
export function TechHome() {
  const user = useCurrentUser();
  const interventions = useData((d) => d.interventions);
  const clients = useData((d) => d.clients);
  const now = useNow();

  const jobs = useMemo(() => {
    if (!user) return [];
    return selectInterventionsOfDay({ interventions }, now, user.id);
  }, [interventions, now, user]);

  if (!user) return null;
  if (user.role !== "technician") return <FieldPreviewPicker />;

  const firstName = user.full_name.split(" ")[0];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Bonjour {firstName}</h1>
        <p className="mt-1 text-base text-muted-foreground">
          {jobs.length === 0
            ? "Aucune intervention prévue aujourd'hui."
            : `${jobs.length} intervention${jobs.length > 1 ? "s" : ""} prévue${jobs.length > 1 ? "s" : ""} aujourd'hui.`}
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed bg-card px-6 py-10 text-center">
          <CalendarCheckIcon className="size-8 text-slate-400" />
          <p className="mt-3 text-base font-medium text-slate-900">Journée libre</p>
          <p className="mt-1 text-sm text-muted-foreground">Les interventions planifiées par le bureau apparaîtront ici.</p>
        </div>
      ) : (
        <ol className="space-y-3">
          {jobs.map((job) => {
            const client = clients.find((c) => c.id === job.client_id);
            return (
              <li key={job.id} className="rounded-xl border border-l-4 border-l-primary bg-card p-4 shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-lg font-semibold text-slate-900 tabular">
                    {job.scheduled_start ? formatTime(job.scheduled_start) : "--:--"}
                    {job.scheduled_end ? ` – ${formatTime(job.scheduled_end)}` : ""}
                  </p>
                  <StatusBadge meta={INTERVENTION_STATUS[job.status]} />
                </div>
                <p className="mt-1 text-base font-medium text-slate-900">{job.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {INTERVENTION_TYPE_LABEL[job.type]} · {client ? clientDisplayName(client) : "Client"}
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
                  <MapPinIcon className="size-4 shrink-0 text-slate-400" />
                  {job.site_label ? `${job.site_label}, ` : ""}
                  {job.city}
                </p>
                {job.priority !== "normale" ? (
                  <StatusBadge meta={{ ...PRIORITY[job.priority], label: `Priorité ${PRIORITY[job.priority].label.toLowerCase()}` }} className="mt-3" />
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      <ModuleScopeCard module="tech" />
    </div>
  );
}
