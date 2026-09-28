"use client";

import { useMemo } from "react";
import { ArrowRightIcon, ChevronRightIcon } from "lucide-react";
import { BatopsWordmark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useSwitchProfile } from "@/components/layout/use-switch-profile";
import { useData } from "@/lib/store";
import { ROLE_LABEL } from "@/lib/domain/labels";

const CORE_LOOP = ["Appel", "Client", "Devis", "Signature", "Intervention", "Rapport photo", "Facture", "Paiement"];

export function LoginScreen() {
  const allUsers = useData((d) => d.users);
  const users = useMemo(() => allUsers.filter((u) => u.is_active), [allUsers]);
  const organization = useData((d) => d.organization);
  const switchProfile = useSwitchProfile();
  const owner = users.find((u) => u.role === "owner");

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-slate-950 p-12 text-white lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 -right-40 size-[32rem] rounded-full bg-blue-600/25 blur-3xl"
        />
        <BatopsWordmark inverted />
        <div className="relative max-w-lg">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight">
            Le logiciel des pros de la clim, du chauffage et de la plomberie.
          </h1>
          <p className="mt-4 text-base text-slate-400">
            Du premier appel au paiement, sans jamais ressaisir une information : devis IA, planning, app technicien,
            rapports photo signés et factures.
          </p>
          <ol className="mt-8 flex flex-wrap items-center gap-2 text-sm">
            {CORE_LOOP.map((step, index) => (
              <li key={step} className="flex items-center gap-2">
                <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-slate-200">{step}</span>
                {index < CORE_LOOP.length - 1 ? <ArrowRightIcon className="size-3.5 text-slate-600" /> : null}
              </li>
            ))}
          </ol>
        </div>
        <p className="relative text-xs text-slate-500">
          Démo : {organization.legal_name} · {organization.city}
          {organization.postal_code ? ` (${organization.postal_code.slice(0, 2)})` : ""}
        </p>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <BatopsWordmark className="mb-10 lg:hidden" />
          <h2 className="text-2xl font-semibold text-slate-900">Entrer dans la démo</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Aucun compte requis. Les données de {organization.name} restent dans votre navigateur.
          </p>

          {owner ? (
            <Button size="lg" className="mt-6 h-11 w-full text-base" onClick={() => switchProfile(owner.id)}>
              Entrer en démo {organization.name}
              <ArrowRightIcon />
            </Button>
          ) : null}

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            ou choisir un profil
            <span className="h-px flex-1 bg-border" />
          </div>

          <ul className="space-y-2">
            {users.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => switchProfile(u.id)}
                  className="flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left shadow-xs transition-colors outline-none hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <UserAvatar user={u} className="size-9 text-xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{u.full_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {ROLE_LABEL[u.role]} · {u.job_title}
                    </span>
                  </span>
                  <ChevronRightIcon className="size-4 text-slate-400" />
                </button>
              </li>
            ))}
          </ul>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Mode démo gratuit : IA, Nora et envois simulés localement, 0 €.
          </p>
        </div>
      </section>
    </div>
  );
}
