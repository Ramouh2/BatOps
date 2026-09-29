"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { FileTextIcon, ReceiptTextIcon, WrenchIcon } from "lucide-react";
import type { Intervention, Invoice, MaintenanceContract, Quote, User } from "@/types/batops";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useNow } from "@/lib/store";
import { formatDate, formatEUR, formatTime } from "@/lib/domain/format";
import {
  CONTRACT_STATUS,
  INTERVENTION_STATUS,
  INTERVENTION_TYPE_LABEL,
  INVOICE_STATUS,
  INVOICE_TYPE_LABEL,
  QUOTE_STATUS,
} from "@/lib/domain/labels";
import { getContractDisplayStatus, getInvoiceDisplayStatus, getQuoteDisplayStatus, invoiceBalance } from "@/lib/domain/status";
import { fadeUp, stagger } from "@/lib/motion";

function Rows({ children }: { children: React.ReactNode }) {
  return (
    <motion.ul variants={stagger(0.04)} initial="hidden" animate="show" className="divide-y rounded-lg border">
      {children}
    </motion.ul>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <motion.li variants={fadeUp} className="relative flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-slate-50/70">
      {children}
    </motion.li>
  );
}

/** Devis (ouvrables) et factures du client (lecture ; l'édition des factures arrive au Sprint 5). */
export function ClientDocuments({ quotes, invoices, showAmounts }: { quotes: Quote[]; invoices: Invoice[]; showAmounts: boolean }) {
  const now = useNow();
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Devis ({quotes.length})</h3>
        {quotes.length === 0 ? (
          <EmptyState icon={FileTextIcon} className="rounded-lg border border-dashed py-6" title="Aucun devis pour ce client" />
        ) : (
          <Rows>
            {quotes.map((q) => (
              <Row key={q.id}>
                <span className="font-mono text-xs text-slate-500">{q.reference}</span>
                <Link
                  href={`/quotes/${q.id}`}
                  className="min-w-0 flex-1 truncate text-sm text-slate-900 outline-none after:absolute after:inset-0 after:content-[''] hover:text-primary focus-visible:after:rounded-md focus-visible:after:ring-[3px] focus-visible:after:ring-ring/40"
                >
                  {q.title}
                </Link>
                <StatusBadge meta={QUOTE_STATUS[getQuoteDisplayStatus(q, now)]} />
                {showAmounts ? <span className="w-28 text-right text-sm font-medium text-slate-900 tabular">{formatEUR(q.total_ttc)}</span> : null}
                <span className="w-24 text-right text-xs text-muted-foreground tabular">{formatDate(q.issue_date)}</span>
              </Row>
            ))}
          </Rows>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Factures ({invoices.length})</h3>
        {invoices.length === 0 ? (
          <EmptyState icon={ReceiptTextIcon} className="rounded-lg border border-dashed py-6" title="Aucune facture pour ce client" />
        ) : (
          <Rows>
            {invoices.map((inv) => {
              const balance = invoiceBalance(inv);
              return (
                <Row key={inv.id}>
                  <span className="font-mono text-xs text-slate-500">{inv.reference}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-900">
                    <Badge className="mr-2">{INVOICE_TYPE_LABEL[inv.invoice_type]}</Badge>
                    {inv.title}
                  </span>
                  <StatusBadge meta={INVOICE_STATUS[getInvoiceDisplayStatus(inv, now)]} />
                  {showAmounts ? (
                    <span className="w-28 text-right text-sm tabular">
                      <span className="font-medium text-slate-900">{formatEUR(inv.amount_due_ttc)}</span>
                      {balance > 0 && balance < inv.amount_due_ttc ? <span className="block text-xs text-amber-700">reste {formatEUR(balance)}</span> : null}
                    </span>
                  ) : null}
                  <span className="w-24 text-right text-xs text-muted-foreground tabular">éch. {formatDate(inv.due_date)}</span>
                </Row>
              );
            })}
          </Rows>
        )}
      </section>
    </div>
  );
}

export function ClientInterventions({ interventions, users }: { interventions: Intervention[]; users: User[] }) {
  if (interventions.length === 0) {
    return <EmptyState icon={WrenchIcon} className="rounded-lg border border-dashed py-8" title="Aucune intervention pour ce client" />;
  }
  return (
    <Rows>
      {interventions.map((job) => {
        const tech = users.find((u) => u.id === job.assigned_technician_id);
        const start = job.actual_start ?? job.scheduled_start;
        return (
          <Row key={job.id}>
            <span className="w-28 text-xs text-slate-500 tabular">
              {start ? (
                <>
                  {formatDate(start)}
                  <span className="block">{formatTime(start)}</span>
                </>
              ) : (
                "À planifier"
              )}
            </span>
            <span className="min-w-0 flex-1">
              <Link
                href={`/interventions/${job.id}`}
                className="block truncate text-sm font-medium text-slate-900 outline-none after:absolute after:inset-0 after:content-[''] hover:text-primary focus-visible:after:rounded-md focus-visible:after:ring-[3px] focus-visible:after:ring-ring/40"
              >
                {job.title}
              </Link>
              <span className="text-xs text-muted-foreground">
                <span className="font-mono">{job.reference}</span> · {INTERVENTION_TYPE_LABEL[job.type]}
                {job.site_label ? ` · ${job.site_label}` : ""}
              </span>
            </span>
            {tech ? <UserAvatar user={tech} /> : null}
            <StatusBadge meta={INTERVENTION_STATUS[job.status]} />
          </Row>
        );
      })}
    </Rows>
  );
}

export function ClientContracts({ contracts, interventions, showAmounts }: { contracts: MaintenanceContract[]; interventions: Intervention[]; showAmounts: boolean }) {
  const now = useNow();
  if (contracts.length === 0) {
    return <p className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">Aucun contrat d&apos;entretien.</p>;
  }
  return (
    <ul className="space-y-2">
      {contracts.map((contract) => (
        <li key={contract.id} className="rounded-lg border p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-slate-900">{contract.name}</p>
            <StatusBadge meta={CONTRACT_STATUS[getContractDisplayStatus(contract, interventions, now)]} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-mono">{contract.reference}</span>
            {showAmounts ? ` · ${formatEUR(contract.annual_price_ttc)} TTC / an` : ""}
          </p>
          <p className="mt-1 text-xs text-slate-600">Prochaine visite : {formatDate(contract.next_visit_date)}</p>
        </li>
      ))}
    </ul>
  );
}
