"use client";

import { useMemo } from "react";
import { CheckIcon, EyeIcon, MinusIcon, RotateCcwIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useData } from "@/lib/store";
import { useUi } from "@/lib/store/ui";
import { can, type Capability } from "@/lib/permissions";
import { formatDateTime, formatEUR, formatNumber, formatVatRate } from "@/lib/domain/format";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { MODULES } from "@/lib/modules";
import { getProvidersInfo } from "@/providers";
import type { UserRole } from "@/types/batops";

const ROLES: UserRole[] = ["owner", "dispatcher", "technician", "accountant"];

const PERMISSION_ROWS: { label: string; manage: Capability; read?: Capability }[] = [
  { label: "Tableau de bord", manage: "view_dashboard" },
  { label: "Marges & prix d'achat", manage: "view_margins" },
  { label: "Appels, clients & planning", manage: "manage_planning" },
  { label: "Devis", manage: "manage_quotes", read: "read_quotes" },
  { label: "Factures & paiements", manage: "manage_invoices", read: "read_invoices" },
  { label: "Catalogue", manage: "manage_catalog", read: "read_catalog" },
  { label: "Paramètres", manage: "manage_settings" },
  { label: "App terrain", manage: "use_field_app" },
];

function PermissionCell({ role, row }: { role: UserRole; row: (typeof PERMISSION_ROWS)[number] }) {
  if (can(role, row.manage)) {
    return (
      <span className="inline-flex items-center justify-center text-emerald-600" title="Accès complet">
        <CheckIcon className="size-4" />
        <span className="sr-only">Accès complet</span>
      </span>
    );
  }
  if (row.read && can(role, row.read)) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-600" title="Lecture seule">
        <EyeIcon className="size-3.5" />
        Lecture
      </span>
    );
  }
  return (
    <span className="inline-flex text-slate-300" title="Aucun accès">
      <MinusIcon className="size-4" />
      <span className="sr-only">Aucun accès</span>
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm text-slate-900">{value}</dd>
    </div>
  );
}

export function SettingsFoundation() {
  const data = useData((d) => d);
  const openReset = useUi((s) => s.setResetDialogOpen);
  const providers = useMemo(() => getProvidersInfo(), []);
  const org = data.organization;
  const sizeKb = useMemo(() => Math.round(JSON.stringify(data).length / 1024), [data]);

  return (
    <>
      <PageHeader title="Paramètres" description="Identité de l'entreprise, équipe, rôles et mode démo." />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Entreprise & mentions légales</CardTitle>
            <CardDescription>Reprises automatiquement sur les devis, rapports et factures.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <Row label="Raison sociale" value={`${org.legal_name} — capital ${org.share_capital}`} />
              <Row label="Adresse" value={`${org.address}, ${org.postal_code} ${org.city}`} />
              <Row label="Contact" value={<span className="tabular">{org.phone} · {org.email}</span>} />
              <Row label="SIRET · TVA" value={<span className="font-mono text-xs">{org.siret} · {org.tva_number}</span>} />
              <Row label="RCS" value={org.rcs} />
              <Row
                label="Assurance décennale"
                value={`${org.decennial_insurance?.insurer} — police ${org.decennial_insurance?.policy_number} (${org.decennial_insurance?.coverage_area})`}
              />
              <Row
                label="Certifications"
                value={
                  <span className="flex flex-wrap gap-1.5">
                    {org.certifications.map((c) => (
                      <Badge key={c} tone="success" className="whitespace-normal">
                        {c}
                      </Badge>
                    ))}
                  </span>
                }
              />
              <Row
                label="Tarifs par défaut"
                value={
                  <span className="tabular">
                    {formatEUR(org.default_hourly_rate)} HT/h · déplacement {formatEUR(org.default_travel_fee)} HT · TVA{" "}
                    {formatVatRate(org.default_vat_rate)}
                  </span>
                }
              />
              <Row
                label="Conditions"
                value={`Acompte ${org.default_deposit_percent} % · paiement à ${org.payment_terms_days} jours · devis valables ${org.quote_validity_days} jours`}
              />
            </dl>
          </CardContent>
          <CardFooter className="text-xs text-muted-foreground">
            Modification de ces informations : Sprint {MODULES.settings.sprint}.
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Équipe & rôles</CardTitle>
            <CardDescription>4 rôles : chacun ne voit que ce dont il a besoin.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ul className="divide-y">
              {data.users.map((u) => (
                <li key={u.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <UserAvatar user={u} className="size-8 text-xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{u.full_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {u.job_title} · {u.email}
                    </span>
                  </span>
                  <Badge tone={u.role === "owner" ? "info" : "neutral"}>{ROLE_LABEL[u.role]}</Badge>
                </li>
              ))}
            </ul>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[30rem] text-sm">
                <thead className="bg-slate-50 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      Accès
                    </th>
                    {ROLES.map((role) => (
                      <th key={role} scope="col" className="px-3 py-2 text-center font-medium">
                        {ROLE_LABEL[role]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {PERMISSION_ROWS.map((row) => (
                    <tr key={row.label}>
                      <th scope="row" className="px-3 py-2 text-left font-normal text-slate-700">
                        {row.label}
                      </th>
                      {ROLES.map((role) => (
                        <td key={role} className="px-3 py-2 text-center">
                          <PermissionCell role={role} row={row} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Services connectés</CardTitle>
            <CardDescription>
              Tout fonctionne gratuitement en mode démo. Chaque service réel se branchera derrière la même interface.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {providers.map((p) => (
                <li key={p.key} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-900">{p.name}</span>
                    <Badge tone={p.mode === "mock" ? "ai" : "success"}>{p.mode === "mock" ? "Démo gratuite" : "Service réel"}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{p.description}</p>
                  <p className="text-xs text-muted-foreground">
                    Plus tard : {p.liveOption} (<code className="font-mono">{p.liveEnvVar}</code>)
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Données de démonstration</CardTitle>
            <CardDescription>Stockées uniquement dans ce navigateur (aucun serveur).</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <Row label="Générées le" value={formatDateTime(data.seeded_at)} />
              <Row
                label="Contenu"
                value={`${data.clients.length} clients · ${data.quotes.length} devis · ${data.interventions.length} interventions · ${data.invoices.length} factures · ${data.photos.length} photos`}
              />
              <Row label="Taille" value={<span className="tabular">≈ {formatNumber(sizeKb)} Ko</span>} />
            </dl>
          </CardContent>
          <CardFooter className="justify-between gap-3">
            <p className="text-xs text-muted-foreground">Recale la démo sur aujourd&apos;hui et efface vos modifications.</p>
            <Button variant="outline" size="sm" onClick={() => openReset(true)}>
              <RotateCcwIcon />
              Réinitialiser
            </Button>
          </CardFooter>
        </Card>
      </div>
    </>
  );
}
