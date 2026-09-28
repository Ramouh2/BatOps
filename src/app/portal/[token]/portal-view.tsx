"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  CalendarCheckIcon,
  CheckIcon,
  FileSignatureIcon,
  FileXIcon,
  HourglassIcon,
  LinkIcon,
  LockIcon,
  MailIcon,
  MessageSquareTextIcon,
  PhoneIcon,
  PrinterIcon,
  SendIcon,
  WrenchIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { Quote } from "@/types/batops";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SuccessCheck } from "@/components/motion/success-check";
import { Swap } from "@/components/motion/swap";
import { useFeedback } from "@/components/motion/use-flash";
import { A4Paper, PrintRoot, printDocument } from "@/components/quotes/a4-paper";
import { QuoteDocument, type QuoteDocumentData } from "@/components/quotes/quote-document";
import { SignQuoteDialog } from "@/components/portal/sign-quote-dialog";
import { RefuseQuoteDialog } from "@/components/portal/refuse-quote-dialog";
import { useActions, useData, useNow } from "@/lib/store";
import { COMMENT_MAX_LENGTH } from "@/lib/store/actions/quotes";
import { selectComments, selectPortal, selectPortalFocus } from "@/lib/store/quote-selectors";
import { diffInCalendarDays, toDate } from "@/lib/domain/dates";
import { formatDate, formatDateTime, formatEUR, formatNumber, formatRelativeTime, initials } from "@/lib/domain/format";
import { QUOTE_STATUS } from "@/lib/domain/labels";
import { depositAmount, computeQuoteTotals } from "@/lib/domain/quotes";
import { getQuoteDisplayStatus } from "@/lib/domain/status";
import { DURATION, EASE_OUT, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

function toDoc(quote: Quote, now: Date): QuoteDocumentData {
  return {
    reference: quote.reference,
    title: quote.title,
    status: getQuoteDisplayStatus(quote, now),
    issue_date: quote.issue_date,
    valid_until: quote.valid_until,
    site_address: quote.site_address,
    site_postal_code: quote.site_postal_code,
    site_city: quote.site_city,
    items: quote.items,
    totals: computeQuoteTotals(quote.items, quote),
    deposit_percent: quote.deposit_percent,
    conditions: quote.conditions,
    notes: quote.notes,
    signed_at: quote.signed_at,
    signed_by_name: quote.signed_by_name,
    signature_data_url: quote.signature_data_url,
    refused_at: quote.refused_at,
  };
}

const NEXT_STEPS = [
  { icon: FileSignatureIcon, label: "Devis signé" },
  { icon: CalendarCheckIcon, label: "Planification de l'intervention" },
  { icon: WrenchIcon, label: "Intervention et rapport photo" },
];

/** Espace client public : consultation, signature, refus et remarques sur les devis transmis. */
export function PortalView({ token }: { token: string }) {
  const data = useData((d) => d);
  const now = useNow();
  const params = useSearchParams();
  const { markQuoteViewed, addQuoteComment } = useActions();
  const view = useMemo(() => selectPortal(data, token), [data, token]);
  const [selected, setSelected] = useState<string | null>(params.get("devis"));
  const focus = view ? selectPortalFocus(view, selected, now) : undefined;
  const [signOpen, setSignOpen] = useState(false);
  const [refuseOpen, setRefuseOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [commentSent, setCommentSent] = useState(false);
  const { scope: commentScope, shake } = useFeedback<HTMLFormElement>();
  const org = data.organization;

  // Première consultation d'un devis envoyé → « consulté » côté bureau.
  const focusId = focus?.id;
  const focusStatus = focus?.status;
  useEffect(() => {
    if (focusId && focusStatus === "envoye") markQuoteViewed(focusId);
  }, [focusId, focusStatus, markQuoteViewed]);

  if (!view) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-sm text-center" data-testid="portal-invalid">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-slate-100">
            <LinkIcon className="size-5 text-slate-500" />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-slate-900">Lien invalide ou expiré</h1>
          <p className="mt-1 text-sm text-muted-foreground">Ce lien d&apos;espace client ne correspond à aucun dossier. Contactez {org.name} au {org.phone}.</p>
        </motion.div>
      </div>
    );
  }

  const { client, contactName } = view;
  const status = focus ? getQuoteDisplayStatus(focus, now) : undefined;
  const doc = focus ? toDoc(focus, now) : undefined;
  const deposit = focus && focus.deposit_percent > 0 ? depositAmount(focus.total_ttc, focus.deposit_percent) : 0;
  const daysLeft = focus ? diffInCalendarDays(now, toDate(focus.valid_until)) : 0;
  const comments = focus ? selectComments(data, focus.id) : [];
  const signer = [client.first_name, client.last_name].filter(Boolean).join(" ") || contactName;
  const equipment = focus?.equipment_id ? data.equipment.find((e) => e.id === focus.equipment_id) : undefined;

  const sendComment = (event: React.FormEvent) => {
    event.preventDefault();
    if (!focus || !addQuoteComment(focus.id, comment)) {
      shake();
      return;
    }
    setComment("");
    setCommentSent(true);
    window.setTimeout(() => setCommentSent(false), 2200);
    toast.success("Remarque transmise", { description: `${org.name} vous répond rapidement.` });
  };

  return (
    <div className="min-h-dvh bg-slate-50 pb-28 lg:pb-12">
      {/* Bandeau entreprise */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: DURATION.slow, ease: EASE_OUT }}
        className="border-b bg-white"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <span className="flex size-9 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ backgroundColor: org.brand_color }} aria-hidden="true">
            {initials(org.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{org.name}</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <LockIcon className="size-3" /> Espace client sécurisé
            </p>
          </div>
          {org.phone ? (
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${org.phone.replace(/\s/g, "")}`}>
                <PhoneIcon />
                <span className="hidden sm:inline">{org.phone}</span>
                <span className="sm:hidden">Appeler</span>
              </a>
            </Button>
          ) : null}
        </div>
      </motion.header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DURATION.slow, ease: EASE_OUT, delay: 0.08 }}>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl" data-testid="portal-greeting">
            Bonjour {contactName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {view.quotes.length === 0
              ? "Aucun document n'est disponible pour le moment."
              : view.quotes.length === 1
                ? "Voici votre devis. Vous pouvez le consulter, le signer en ligne ou nous poser une question."
                : `Vous avez ${view.quotes.length} devis dans votre espace.`}
          </p>
        </motion.div>

        {view.quotes.length > 1 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.14 }} className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Vos devis">
            {view.quotes.map((q) => {
              const active = q.id === focus?.id;
              const meta = QUOTE_STATUS[getQuoteDisplayStatus(q, now)];
              return (
                <button
                  key={q.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelected(q.reference)}
                  className={cn(
                    "relative shrink-0 rounded-lg border bg-white px-3 py-2 text-left text-sm transition-colors",
                    active ? "border-slate-900" : "hover:border-slate-300",
                  )}
                >
                  <span className="block font-mono text-xs text-slate-500">{q.reference}</span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className="max-w-[14rem] truncate font-medium text-slate-900">{q.title}</span>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </span>
                </button>
              );
            })}
          </motion.div>
        ) : null}

        {focus && doc && status ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            {/* Document */}
            <motion.div
              key={focus.id}
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.12 }}
              className="min-w-0"
            >
              <div className="rounded-xl border bg-white p-4 shadow-xs md:hidden">
                <QuoteDocument doc={doc} organization={org} client={client} equipment={equipment} layout="compact" />
              </div>
              <div className="hidden md:block">
                <A4Paper>
                  <QuoteDocument doc={doc} organization={org} client={client} equipment={equipment} reveal />
                </A4Paper>
              </div>
            </motion.div>

            {/* Réponse du client */}
            <motion.aside
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: DURATION.slow, ease: EASE_OUT, delay: 0.24 }}
              className="space-y-4 lg:sticky lg:top-6 lg:self-start"
              aria-label="Votre réponse"
            >
              <section className="overflow-hidden rounded-xl border bg-white shadow-xs" data-testid="portal-status-card" data-status={status}>
                <div className="border-b px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-slate-500">{focus.reference}</span>
                    <Badge tone={QUOTE_STATUS[status].tone} data-testid="portal-status">
                      <Swap swapKey={status}>{QUOTE_STATUS[status].label}</Swap>
                    </Badge>
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-slate-900 tabular">{formatEUR(focus.total_ttc)}</p>
                  <p className="text-xs text-muted-foreground">TTC · {formatEUR(focus.total_ht)} HT</p>
                </div>

                <AnimatePresence mode="wait" initial={false}>
                  {status === "envoye" ? (
                    <motion.div key="pending" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: DURATION.base, ease: EASE_OUT }} className="space-y-3 px-4 py-4">
                      <dl className="space-y-1.5 text-sm">
                        {deposit > 0 ? (
                          <div className="flex justify-between gap-2">
                            <dt className="text-muted-foreground">Acompte à la signature</dt>
                            <dd className="font-medium text-slate-900 tabular">
                              {formatEUR(deposit)} <span className="text-xs font-normal text-muted-foreground">({formatNumber(focus.deposit_percent)} %)</span>
                            </dd>
                          </div>
                        ) : null}
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Valable jusqu&apos;au</dt>
                          <dd className={cn("font-medium tabular", daysLeft <= 5 ? "text-amber-700" : "text-slate-900")}>
                            {formatDate(focus.valid_until)} {daysLeft <= 5 ? `(${daysLeft} j)` : ""}
                          </dd>
                        </div>
                      </dl>
                      <div className="hidden gap-2 lg:grid">
                        <Button size="lg" className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => setSignOpen(true)} data-testid="accept-quote">
                          <FileSignatureIcon />
                          Accepter et signer
                        </Button>
                        <Button variant="outline" className="w-full" onClick={() => setRefuseOpen(true)} data-testid="refuse-quote">
                          Refuser le devis
                        </Button>
                      </div>
                    </motion.div>
                  ) : status === "accepte" ? (
                    <motion.div key="signed" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={SPRING.pop} className="bg-emerald-50/50 px-4 py-4" data-testid="portal-signed">
                      <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                        <SuccessCheck className="size-5" />
                        Signé le {focus.signed_at ? formatDateTime(focus.signed_at) : ""}
                      </p>
                      <p className="mt-1 text-xs text-emerald-900/80">par {focus.signed_by_name} · signature électronique</p>
                      <ol className="mt-4 space-y-2.5">
                        {NEXT_STEPS.map((step, index) => (
                          <motion.li
                            key={step.label}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 + index * 0.1, duration: DURATION.base }}
                            className="flex items-center gap-2.5 text-sm"
                          >
                            <span className={cn("flex size-6 items-center justify-center rounded-full", index === 0 ? "bg-emerald-500 text-white" : "bg-white text-slate-400 ring-1 ring-slate-200")}>
                              {index === 0 ? <CheckIcon className="size-3.5" strokeWidth={3} /> : <step.icon className="size-3.5" />}
                            </span>
                            <span className={index === 0 ? "font-medium text-slate-900" : "text-slate-600"}>{step.label}</span>
                          </motion.li>
                        ))}
                      </ol>
                      <p className="mt-3 text-xs text-slate-600">{org.name} vous contacte pour fixer la date de l&apos;intervention.</p>
                    </motion.div>
                  ) : status === "refuse" ? (
                    <motion.div key="refused" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="px-4 py-4 text-sm" data-testid="portal-refused">
                      <p className="flex items-center gap-2 font-medium text-slate-900">
                        <FileXIcon className="size-4 text-slate-400" />
                        Vous avez décliné ce devis
                      </p>
                      <p className="mt-1 text-slate-600">{focus.refusal_reason}</p>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Vous changez d&apos;avis ou souhaitez une autre proposition ? Écrivez-nous ci-dessous ou appelez le {org.phone}.
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div key="expired" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 py-4 text-sm">
                      <p className="flex items-center gap-2 font-medium text-slate-900">
                        <HourglassIcon className="size-4 text-slate-400" />
                        Ce devis a expiré le {formatDate(focus.valid_until)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">Demandez-nous une mise à jour avec le formulaire ci-dessous.</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>

              {/* Remarques */}
              <section className="rounded-xl border bg-white p-4 shadow-xs" aria-labelledby="comments-title">
                <h2 id="comments-title" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <MessageSquareTextIcon className="size-4 text-slate-400" />
                  Une question, une remarque ?
                </h2>
                <ul className="mt-3 space-y-2" data-testid="portal-comments">
                  <AnimatePresence initial={false}>
                    {comments.map((c) => (
                      <motion.li
                        key={c.id}
                        layout
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={SPRING.pop}
                        className="rounded-lg bg-slate-50 px-3 py-2 text-sm"
                      >
                        <p className="whitespace-pre-line text-slate-800">{c.description}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">Envoyée {formatRelativeTime(c.created_at, now)}</p>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
                <form ref={commentScope} onSubmit={sendComment} className="mt-3">
                  <label htmlFor="portal-comment" className="sr-only">
                    Votre message
                  </label>
                  <Textarea
                    id="portal-comment"
                    rows={3}
                    maxLength={COMMENT_MAX_LENGTH}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Ex. Est-il possible d'intervenir un mardi ?"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <AnimatePresence>
                      {commentSent ? (
                        <motion.span initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                          <SuccessCheck /> Transmise
                        </motion.span>
                      ) : (
                        <span />
                      )}
                    </AnimatePresence>
                    <Button type="submit" size="sm" variant="outline" disabled={!comment.trim()}>
                      <SendIcon />
                      Envoyer la remarque
                    </Button>
                  </div>
                </form>
              </section>

              <Button variant="ghost" size="sm" className="w-full" onClick={printDocument}>
                <PrinterIcon />
                Imprimer / enregistrer en PDF
              </Button>
            </motion.aside>
          </div>
        ) : null}

        <footer className="mt-10 border-t pt-4 text-center text-[11px] text-slate-400">
          <p>
            {org.legal_name} · {org.address}, {org.postal_code} {org.city}
            {org.siret ? ` · SIRET ${org.siret}` : ""}
          </p>
          {org.email ? (
            <p className="mt-0.5 flex items-center justify-center gap-1">
              <MailIcon className="size-3" /> {org.email}
            </p>
          ) : null}
          <p className="mt-1">Espace client propulsé par BATOPS</p>
        </footer>
      </main>

      {/* Barre d'action mobile (pouce) */}
      <AnimatePresence>
        {focus && status === "envoye" ? (
          <motion.div
            key="mobile-actions"
            initial={{ y: 80 }}
            animate={{ y: 0 }}
            exit={{ y: 80 }}
            transition={{ ...SPRING.layout, delay: 0.3 }}
            className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden"
          >
            <div className="mx-auto grid max-w-md grid-cols-[1fr_auto] gap-2">
              <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setSignOpen(true)}>
                <FileSignatureIcon />
                Accepter et signer
              </Button>
              <Button size="lg" variant="outline" onClick={() => setRefuseOpen(true)}>
                Refuser
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {focus ? (
        <>
          <SignQuoteDialog key={`sign-${focus.id}`} open={signOpen} onOpenChange={setSignOpen} quote={focus} defaultSigner={signer} companyName={org.name} />
          <RefuseQuoteDialog
            key={`refuse-${focus.id}`}
            open={refuseOpen}
            onOpenChange={setRefuseOpen}
            quote={focus}
            onRefused={() => toast("Votre réponse a bien été transmise", { description: `${org.name} en est informé. Merci pour votre retour.` })}
          />
        </>
      ) : null}

      {focus && doc ? (
        <PrintRoot>
          <QuoteDocument doc={doc} organization={org} client={client} equipment={equipment} />
        </PrintRoot>
      ) : null}
    </div>
  );
}
