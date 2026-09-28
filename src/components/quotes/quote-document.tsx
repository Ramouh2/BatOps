"use client";

import { AnimatePresence, motion } from "motion/react";
import type { Client, DocumentLine, Equipment, ISODate, ISODateTime, Organization, QuoteStatus } from "@/types/batops";
import { clientContactName, clientDisplayName } from "@/lib/domain/clients";
import { formatDate, formatDateTime, formatEUR, formatNumber, formatVatRate, initials } from "@/lib/domain/format";
import { EQUIPMENT_CATEGORY_LABEL, UNIT_LABEL } from "@/lib/domain/labels";
import type { DocumentTotals } from "@/lib/domain/money";
import { depositAmount, groupLinesBySection } from "@/lib/domain/quotes";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Données imprimées : un devis enregistré OU la copie de travail de l'éditeur. */
export interface QuoteDocumentData {
  reference: string;
  title: string;
  status: QuoteStatus;
  issue_date: ISODate;
  valid_until: ISODate;
  site_address: string;
  site_postal_code: string;
  site_city: string;
  items: DocumentLine[];
  totals: DocumentTotals;
  deposit_percent: number;
  conditions?: string;
  notes?: string;
  signed_at?: ISODateTime;
  signed_by_name?: string;
  signature_data_url?: string;
  refused_at?: ISODateTime;
}

/** Largeur d'une page A4 à 96 dpi (210 mm). */
export const A4_WIDTH_PX = 794;
export const A4_HEIGHT_PX = 1123;

const block = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE_OUT } },
};

function Stamp({ tone, children }: { tone: "success" | "danger"; children: string }) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 1.4, rotate: -14 }}
      animate={{ opacity: 1, scale: 1, rotate: -8 }}
      transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.2 }}
      className={cn(
        "inline-block rounded-md border-2 px-3 py-1 text-sm font-bold tracking-[0.2em] uppercase",
        tone === "success" ? "border-emerald-600/70 text-emerald-700" : "border-rose-600/70 text-rose-700",
      )}
    >
      {children}
    </motion.span>
  );
}

/**
 * Devis au format A4, avec les mentions d'une entreprise du bâtiment (SIRET, décennale, RGE).
 * `layout="paper"` : page A4 (aperçu, impression) · `layout="compact"` : lecture sur téléphone (portail).
 */
export function QuoteDocument({
  doc,
  organization,
  client,
  equipment,
  layout = "paper",
  reveal = false,
  className,
}: {
  doc: QuoteDocumentData;
  organization: Organization;
  client: Client;
  equipment?: Equipment;
  layout?: "paper" | "compact";
  /** Apparition progressive des blocs (génération de l'aperçu). */
  reveal?: boolean;
  className?: string;
}) {
  const sections = groupLinesBySection(doc.items);
  const { totals } = doc;
  const deposit = doc.deposit_percent > 0 ? depositAmount(totals.total_ttc, doc.deposit_percent) : 0;
  const siteDiffers =
    doc.site_address !== client.address || doc.site_postal_code !== client.postal_code || doc.site_city !== client.city;
  const compact = layout === "compact";
  const brand = organization.brand_color;
  const Block = motion.div;
  const blockProps = reveal ? { variants: block } : {};
  const insurance = organization.decennial_insurance;

  return (
    <motion.article
      initial={reveal ? "hidden" : false}
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
      className={cn("quote-document relative bg-white text-slate-800", compact ? "text-[13px]" : "text-[11.5px] leading-[1.45]", className)}
      data-testid="quote-document"
      aria-label={`Devis ${doc.reference}`}
    >
      {doc.status === "brouillon" && !compact ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-[38%] left-1/2 -translate-x-1/2 -rotate-[24deg] text-[64px] font-black tracking-[0.25em] whitespace-nowrap text-slate-900/[0.035] uppercase select-none print:hidden"
        >
          Brouillon
        </span>
      ) : null}

      {/* En-tête : entreprise + références du document */}
      <Block {...blockProps} className={cn("flex gap-6", compact ? "flex-col" : "items-start justify-between")}>
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: brand }}
            aria-hidden="true"
          >
            {initials(organization.name)}
          </span>
          <div className="min-w-0">
            <p className="text-base font-semibold text-slate-900">{organization.name}</p>
            <p className="text-slate-500">{organization.legal_name}</p>
            <p className="mt-1 text-slate-600">
              {organization.address}
              <br />
              {organization.postal_code} {organization.city}
            </p>
            <p className="text-slate-600">
              {[organization.phone, organization.email].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className={cn("shrink-0", compact ? "" : "text-right")}>
          <p className="text-2xl font-semibold tracking-tight" style={{ color: brand }}>
            DEVIS
          </p>
          <p className="mt-1 font-mono text-[12px] font-medium text-slate-900">{doc.reference}</p>
          <dl className={cn("mt-2 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-slate-600", compact ? "" : "justify-end")}>
            <dt>Date</dt>
            <dd className="tabular text-slate-900">{formatDate(doc.issue_date)}</dd>
            <dt>Validité</dt>
            <dd className="tabular text-slate-900">jusqu&apos;au {formatDate(doc.valid_until)}</dd>
          </dl>
        </div>
      </Block>

      {/* Client, chantier, équipement */}
      <Block {...blockProps} className={cn("mt-7 grid gap-4", compact ? "grid-cols-1" : "grid-cols-2")}>
        <div className="rounded-md bg-slate-50 p-3">
          <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Client</p>
          <p className="mt-1 font-semibold text-slate-900">{clientDisplayName(client)}</p>
          {client.company_name && clientContactName(client) ? <p className="text-slate-600">À l&apos;attention de {clientContactName(client)}</p> : null}
          <p className="text-slate-600">
            {client.address}
            <br />
            {client.postal_code} {client.city}
          </p>
          <p className="text-slate-600">{[client.phone, client.email].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Chantier</p>
          <p className="mt-1 text-slate-900">
            {siteDiffers ? (
              <>
                {doc.site_address}
                <br />
                {doc.site_postal_code} {doc.site_city}
              </>
            ) : (
              "À l'adresse du client"
            )}
          </p>
          {equipment ? (
            <p className="mt-1.5 text-slate-600">
              Équipement concerné : {equipment.brand} {equipment.model} ({EQUIPMENT_CATEGORY_LABEL[equipment.category]}
              {equipment.serial_number ? `, n° ${equipment.serial_number}` : ""})
            </p>
          ) : null}
        </div>
      </Block>

      <Block {...blockProps} className="mt-6">
        <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Objet</p>
        <p className={cn("mt-0.5 font-semibold text-slate-900", compact ? "text-base" : "text-[14px]")}>{doc.title || "Devis sans objet"}</p>
      </Block>

      {/* Lignes */}
      <Block {...blockProps} className="mt-4">
        {doc.items.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 py-8 text-center text-slate-400">Les lignes du devis apparaîtront ici.</p>
        ) : compact ? (
          <div className="space-y-4">
            {sections.map((section) => (
              <section key={section.title}>
                <p className="mb-1.5 flex items-baseline justify-between border-b pb-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                  {section.title}
                  <span className="tabular normal-case">{formatEUR(section.total_ht)} HT</span>
                </p>
                <ul className="divide-y divide-slate-100">
                  {section.lines.map((line) => (
                    <li key={line.id} className="flex items-start justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{line.name}</p>
                        <p className="text-[12px] text-slate-500 tabular">
                          {formatNumber(line.qty)} {UNIT_LABEL[line.unit]} × {formatEUR(line.unit_price_ht)} HT · TVA {formatVatRate(line.vat_rate)}
                        </p>
                      </div>
                      <p className="shrink-0 font-medium text-slate-900 tabular">{formatEUR(line.total_ht)}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 text-left text-[10px] tracking-wider text-slate-500 uppercase" style={{ borderColor: brand }}>
                <th className="py-1.5 pr-2 font-semibold">Désignation</th>
                <th className="w-[52px] py-1.5 pr-2 text-right font-semibold">Qté</th>
                <th className="w-[46px] py-1.5 pr-2 font-semibold">Unité</th>
                <th className="w-[84px] py-1.5 pr-2 text-right font-semibold">PU HT</th>
                <th className="w-[46px] py-1.5 pr-2 text-right font-semibold">TVA</th>
                <th className="w-[92px] py-1.5 text-right font-semibold">Total HT</th>
              </tr>
            </thead>
            {sections.map((section) => (
              <tbody key={section.title} className="break-inside-avoid">
                <tr>
                  <td colSpan={6} className="pt-3 pb-1 text-[10.5px] font-semibold tracking-wide text-slate-500 uppercase">
                    {section.title}
                  </td>
                </tr>
                <AnimatePresence initial={false}>
                  {section.lines.map((line) => (
                    <motion.tr
                      key={line.id}
                      initial={{ opacity: 0, backgroundColor: "rgba(37, 99, 235, 0.10)" }}
                      animate={{ opacity: 1, backgroundColor: "rgba(37, 99, 235, 0)" }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.9, ease: EASE_OUT }}
                      className="border-b border-slate-100 align-top"
                    >
                      <td className="py-1.5 pr-2">
                        <p className="font-medium text-slate-900">{line.name}</p>
                        {line.description ? <p className="text-[10.5px] text-slate-500">{line.description}</p> : null}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular">{formatNumber(line.qty)}</td>
                      <td className="py-1.5 pr-2 text-slate-500">{UNIT_LABEL[line.unit]}</td>
                      <td className="py-1.5 pr-2 text-right tabular">{formatEUR(line.unit_price_ht)}</td>
                      <td className="py-1.5 pr-2 text-right text-slate-500 tabular">{formatVatRate(line.vat_rate)}</td>
                      <td className="py-1.5 text-right font-medium text-slate-900 tabular">{formatEUR(line.total_ht)}</td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            ))}
          </table>
        )}
      </Block>

      {/* Totaux */}
      <Block {...blockProps} className={cn("mt-5 flex gap-6 break-inside-avoid", compact ? "flex-col" : "items-start justify-between")}>
        <div className="min-w-0 flex-1 space-y-3">
          {doc.notes ? (
            <div>
              <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Précisions</p>
              <p className="mt-0.5 whitespace-pre-line text-slate-700">{doc.notes}</p>
            </div>
          ) : null}
        </div>
        <dl className={cn("shrink-0 space-y-1 tabular", compact ? "w-full" : "w-[270px]")} data-testid="document-totals">
          {totals.discount_amount_ht > 0 ? (
            <>
              <div className="flex justify-between text-slate-600">
                <dt>Sous-total HT</dt>
                <dd>{formatEUR(totals.subtotal_ht)}</dd>
              </div>
              <div className="flex justify-between text-slate-600">
                <dt>Remise</dt>
                <dd>− {formatEUR(totals.discount_amount_ht)}</dd>
              </div>
            </>
          ) : null}
          <div className="flex justify-between font-medium text-slate-900">
            <dt>Total HT</dt>
            <dd>{formatEUR(totals.total_ht)}</dd>
          </div>
          {totals.vat_breakdown.map((row) => (
            <div key={row.rate} className="flex justify-between text-slate-600">
              <dt>
                TVA {formatVatRate(row.rate)} <span className="text-slate-400">sur {formatEUR(row.base_ht)}</span>
              </dt>
              <dd>{formatEUR(row.tva)}</dd>
            </div>
          ))}
          <div className="mt-1.5 flex items-baseline justify-between rounded-md px-2.5 py-2 text-white" style={{ backgroundColor: brand }}>
            <dt className="font-medium">Total TTC</dt>
            <dd className="text-[15px] font-semibold">{formatEUR(totals.total_ttc)}</dd>
          </div>
          {deposit > 0 ? (
            <div className="flex justify-between gap-2 px-2.5 pt-1 text-slate-700">
              <dt className="whitespace-nowrap">Acompte à la signature ({formatNumber(doc.deposit_percent)} %)</dt>
              <dd className="font-medium">{formatEUR(deposit)}</dd>
            </div>
          ) : null}
        </dl>
      </Block>

      {/* Conditions & signature */}
      <Block {...blockProps} className="mt-6 break-inside-avoid">
        {doc.conditions ? (
          <div>
            <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Conditions</p>
            <p className="mt-0.5 text-slate-600">{doc.conditions}</p>
          </div>
        ) : null}
        <div className={cn("mt-5 grid gap-4", compact ? "grid-cols-1" : "grid-cols-2")}>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Pour l&apos;entreprise</p>
            <p className="mt-1 text-slate-700">{organization.name}</p>
          </div>
          <div
            className={cn(
              "relative min-h-[96px] rounded-md border p-3",
              doc.signed_at ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200",
            )}
            data-testid="document-signature"
          >
            <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Bon pour accord — le client</p>
            {doc.signed_at && doc.signature_data_url ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- signature en data-URL locale */}
                <img src={doc.signature_data_url} alt={`Signature de ${doc.signed_by_name ?? "client"}`} className="mt-1 h-14 max-w-[70%] object-contain object-left" />
                <p className="text-slate-600">
                  Signé électroniquement par <span className="font-medium text-slate-900">{doc.signed_by_name}</span>
                  <br />
                  le {formatDateTime(doc.signed_at)}
                </p>
                <span className="absolute top-3 right-3">
                  <Stamp tone="success">Signé</Stamp>
                </span>
              </>
            ) : doc.status === "refuse" ? (
              <span className="absolute top-3 right-3">
                <Stamp tone="danger">Refusé</Stamp>
              </span>
            ) : (
              <p className="mt-1 text-slate-400">Date, nom et signature précédés de la mention « Bon pour accord ».</p>
            )}
          </div>
        </div>
      </Block>

      {/* Mentions légales */}
      <Block {...blockProps} className="mt-7 border-t border-slate-200 pt-3 text-[9.5px] leading-snug text-slate-500">
        <p>
          {organization.legal_name}
          {organization.share_capital ? ` — SAS au capital de ${organization.share_capital}` : ""}
          {organization.siret ? ` — SIRET ${organization.siret}` : ""}
          {organization.rcs ? ` — ${organization.rcs}` : ""}
          {organization.tva_number ? ` — TVA intracommunautaire ${organization.tva_number}` : ""}
        </p>
        {insurance ? (
          <p>
            Assurance décennale : {insurance.insurer}, contrat n° {insurance.policy_number}, couverture {insurance.coverage_area}.
          </p>
        ) : null}
        {organization.certifications.length > 0 || organization.rge_number ? (
          <p>
            {organization.certifications.length > 0 ? `Qualifications : ${organization.certifications.join(" · ")}` : ""}
            {organization.rge_number ? ` — ${organization.rge_number}` : ""}
          </p>
        ) : null}
      </Block>
    </motion.article>
  );
}
