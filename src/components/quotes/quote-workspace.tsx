"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  FilePenLineIcon,
  FileSearchIcon,
  FileXIcon,
  MoreHorizontalIcon,
  PrinterIcon,
  SendIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import type { BatopsData } from "@/types/batops";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { Reveal } from "@/components/motion/reveal";
import { Swap } from "@/components/motion/swap";
import { useFeedback } from "@/components/motion/use-flash";
import { batopsStore, useActions, useCurrentUser, useData, useNow } from "@/lib/store";
import { quoteToInput } from "@/lib/store/actions/quotes";
import { openQuoteRequest, selectQuoteDetail } from "@/lib/store/quote-selectors";
import { can } from "@/lib/permissions";
import { clientDisplayName } from "@/lib/domain/clients";
import { addDays, toDate, toISODate } from "@/lib/domain/dates";
import { formatEUR } from "@/lib/domain/format";
import { formatReference } from "@/lib/domain/ids";
import { QUOTE_STATUS } from "@/lib/domain/labels";
import { portalUrl } from "@/lib/domain/portal";
import { computeQuoteTotals } from "@/lib/domain/quotes";
import { getQuoteDisplayStatus } from "@/lib/domain/status";
import { validateQuoteInput, type FieldErrors, type QuoteInput } from "@/lib/domain/validation";
import { ENERGY_RENOVATION_REFS, recommendVat } from "@/lib/domain/vat";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { PrintRoot, printDocument } from "./a4-paper";
import { QuoteDetailBody } from "./quote-detail";
import { QuoteDocument, type QuoteDocumentData } from "./quote-document";
import { QuoteEditorBody } from "./quote-editor";
import { QuotePreviewDialog } from "./quote-preview-dialog";
import { QuoteStatusTrack } from "./quote-status-track";
import { showQuoteSavedToast } from "./saved-toast";
import { SendQuoteSheet } from "./send-quote-sheet";
import { useQuoteEditor } from "./use-quote-editor";

function blankInput(data: BatopsData, clientId?: string): QuoteInput {
  const client = clientId ? data.clients.find((c) => c.id === clientId) : undefined;
  return {
    call_log_id: client ? openQuoteRequest(data, client.id)?.id : undefined,
    client_id: client?.id ?? "",
    title: "",
    site_address: client?.address ?? "",
    site_postal_code: client?.postal_code ?? "",
    site_city: client?.city ?? "",
    items: [],
    discount_amount_ht: 0,
    deposit_percent: data.organization.default_deposit_percent,
    validity_days: data.organization.quote_validity_days,
    ai_generated: false,
  };
}

/** Ordre de focus des erreurs de saisie. */
const ERROR_TARGETS: [string, string][] = [
  ["title", "quote-title"],
  ["client_id", "quote-client"],
  ["site_address", "site-address"],
  ["site_postal_code", "site-cp"],
  ["site_city", "site-city"],
  ["items", "catalog-search"],
  ["discount", "quote-discount"],
  ["deposit_percent", "quote-deposit"],
  ["validity_days", "quote-validity"],
];

/**
 * Espace de travail d'un devis : éditeur (brouillon) ou document (envoyé, signé, refusé),
 * avec le même en-tête et la même frise de statut pour que chaque passage d'étape s'anime sur place.
 */
export function QuoteWorkspace({ quoteId: initialId, initialClientId }: { quoteId?: string; initialClientId?: string }) {
  const data = useData((d) => d);
  const user = useCurrentUser();
  const now = useNow();
  const actions = useActions();
  const router = useRouter();
  const [quoteId, setQuoteId] = useState(initialId);
  const [leaving, setLeaving] = useState(false);
  const quote = quoteId ? data.quotes.find((q) => q.id === quoteId) : undefined;
  const detail = useMemo(() => (quoteId ? selectQuoteDetail(data, quoteId) : null), [data, quoteId]);

  const role = user?.role ?? "accountant";
  const canManage = can(role, "manage_quotes");
  const showMargins = can(role, "view_margins");
  const editing = canManage && (!quote || quote.status === "brouillon");

  const [initialInput] = useState<QuoteInput>(() => (quote ? quoteToInput(quote) : blankInput(data, initialClientId)));
  const editor = useQuoteEditor(initialInput);
  // Après un premier enregistrement refusé, les erreurs suivent la saisie en direct (elles disparaissent une fois corrigées).
  const [attempted, setAttempted] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirm, setConfirm] = useState<"reopen" | "delete" | null>(null);
  const [reminding, setReminding] = useState(false);
  const { scope: headerScope, shake, flash } = useFeedback<HTMLDivElement>();

  // Un devis repassé en brouillon (ici ou dans un autre onglet) recharge l'éditeur.
  const previousStatus = useRef(quote?.status);
  const resetEditor = editor.reset;
  useEffect(() => {
    const previous = previousStatus.current;
    previousStatus.current = quote?.status;
    if (quote && previous && previous !== "brouillon" && quote.status === "brouillon") resetEditor(quoteToInput(quote));
  }, [quote, resetEditor]);

  const client = data.clients.find((c) => c.id === (quote?.client_id ?? editor.input.client_id));
  const energy = editor.input.items.some((l) => ENERGY_RENOVATION_REFS.includes(data.catalog.find((c) => c.id === l.catalog_item_id)?.reference ?? ""));
  const recommendation = client ? recommendVat({ clientType: client.type, housingOver2Years: client.housing_over_2_years, energyRenovation: energy }) : undefined;
  const lineVats = [...new Set(editor.input.items.map((l) => l.vat_rate))];
  const defaultVat = lineVats.length === 1 ? lineVats[0] : (recommendation?.rate ?? data.organization.default_vat_rate);

  const reference = quote?.reference ?? formatReference("quote", now.getFullYear(), data.sequences.quote);
  const issueDate = quote?.issue_date ?? toISODate(now);
  const workingDoc: QuoteDocumentData = {
    reference,
    title: editor.input.title,
    status: "brouillon",
    issue_date: issueDate,
    valid_until: toISODate(addDays(toDate(issueDate), editor.input.validity_days)),
    site_address: editor.input.site_address,
    site_postal_code: editor.input.site_postal_code,
    site_city: editor.input.site_city,
    items: editor.input.items,
    totals: editor.totals,
    deposit_percent: editor.input.deposit_percent,
    conditions: editor.conditions,
    notes: editor.input.notes,
  };
  const savedTotals = useMemo(() => (quote ? computeQuoteTotals(quote.items, quote) : null), [quote]);
  const savedDoc: QuoteDocumentData | null =
    quote && savedTotals
      ? {
          reference: quote.reference,
          title: quote.title,
          status: getQuoteDisplayStatus(quote, now),
          issue_date: quote.issue_date,
          valid_until: quote.valid_until,
          site_address: quote.site_address,
          site_postal_code: quote.site_postal_code,
          site_city: quote.site_city,
          items: quote.items,
          totals: savedTotals,
          deposit_percent: quote.deposit_percent,
          conditions: quote.conditions,
          notes: quote.notes,
          signed_at: quote.signed_at,
          signed_by_name: quote.signed_by_name,
          signature_data_url: quote.signature_data_url,
          refused_at: quote.refused_at,
        }
      : null;
  const doc = editing ? workingDoc : (savedDoc ?? workingDoc);
  const portalLink = client && quote ? portalUrl(window.location.origin, client.portal_token, quote.reference) : "";

  const resolvedInput = editor.resolved;
  const errors: FieldErrors = useMemo(
    () => (attempted ? validateQuoteInput({ ...resolvedInput, client_id: quote?.client_id ?? resolvedInput.client_id }, data) : {}),
    [attempted, resolvedInput, quote, data],
  );

  const save = useCallback((): string | null => {
    const input = editor.resolved;
    const result = quote ? actions.updateQuote(quote.id, input) : actions.createQuote(input);
    if (!result.ok) {
      setAttempted(true);
      shake();
      const first = ERROR_TARGETS.find(([key]) => result.errors[key]);
      const lineError = Object.entries(result.errors).find(([key]) => key.startsWith("line:"));
      toast.error("Le devis n'est pas complet", { description: (first ? result.errors[first[0]] : lineError?.[1]) ?? "Vérifiez les champs signalés." });
      if (first) window.setTimeout(() => document.getElementById(first[1])?.focus(), 50);
      return null;
    }
    setAttempted(false);
    editor.markSaved(input);
    const id = quote ? quote.id : String(result.value);
    const stored = batopsStore.getState().data?.quotes.find((q) => q.id === id);
    if (!quote) {
      setQuoteId(id);
      window.history.replaceState(null, "", `/quotes/${id}`);
    }
    flash("rgba(16, 185, 129, 0.10)");
    showQuoteSavedToast({
      reference: stored?.reference ?? reference,
      created: !quote,
      totalTtc: editor.totals.total_ttc,
      marginPercent: showMargins ? editor.totals.margin_percent : undefined,
    });
    return id;
  }, [actions, editor, quote, reference, shake, flash, showMargins]);

  // Ctrl / ⌘ + S : enregistrer le brouillon.
  useEffect(() => {
    if (!editing) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, save]);

  // Alerte avant de quitter la page avec des modifications non enregistrées.
  useEffect(() => {
    if (!editing || !editor.dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [editing, editor.dirty]);

  const openSend = () => {
    if (!quote || editor.dirty) {
      if (!save()) return;
    }
    setSendOpen(true);
  };

  const remind = async () => {
    if (!quote) return;
    setReminding(true);
    const result = await actions.sendQuoteReminder(quote.id);
    setReminding(false);
    if (result.ok) {
      toast.success(`Relance envoyée — ${quote.reference}`, {
        description: `${result.channel === "email" ? "E-mail" : "SMS"} à ${result.to} avec le lien du portail · simulation (mode démo)`,
      });
    } else toast.error("La relance n'a pas pu être envoyée.");
  };

  if (leaving) return null;
  if (initialId && (!quote || !detail)) {
    return (
      <EmptyState
        icon={FileSearchIcon}
        title="Devis introuvable"
        description="Ce devis n'existe pas ou la démo a été réinitialisée."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/quotes">
              <ArrowLeftIcon />
              Retour aux devis
            </Link>
          </Button>
        }
      />
    );
  }

  const status = quote ? getQuoteDisplayStatus(quote, now) : "brouillon";
  const statusMeta = QUOTE_STATUS[status];

  return (
    <div className="space-y-5">
      <Reveal>
        <Link href="/quotes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-slate-900">
          <ArrowLeftIcon className="size-4" />
          Devis
        </Link>
      </Reveal>

      {/* En-tête commun */}
      <Reveal delay={0.04}>
        <div ref={headerScope} className="-m-2 grid gap-5 rounded-xl p-2 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-slate-500" data-testid="quote-reference">
                {reference}
              </span>
              <Badge tone={statusMeta.tone} data-testid="quote-status">
                <Swap swapKey={status}>{quote ? statusMeta.label : "Nouveau brouillon"}</Swap>
              </Badge>
              {quote?.ai_generated || editor.input.ai_generated ? (
                <Badge tone="ai">
                  <SparklesIcon /> Préparé avec l&apos;IA
                </Badge>
              ) : null}
              {!quote ? <span className="text-xs text-muted-foreground">Numéro attribué à l&apos;enregistrement</span> : null}
            </div>
            {editing ? (
              <div className="mt-1.5">
                <label htmlFor="quote-title" className="sr-only">
                  Objet du devis
                </label>
                <input
                  id="quote-title"
                  value={editor.input.title}
                  onChange={(e) => editor.setField("title", e.target.value)}
                  placeholder="Objet du devis (ex. Installation PAC air/eau 8 kW)"
                  aria-invalid={errors.title ? true : undefined}
                  className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 -ml-1.5 text-xl font-semibold text-slate-900 transition-colors outline-none placeholder:text-slate-300 hover:border-slate-200 focus:border-ring focus:ring-[3px] focus:ring-ring/20 sm:text-2xl"
                />
                <AnimatePresence initial={false}>
                  {errors.title ? (
                    <motion.p role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs font-medium text-rose-600">
                      {errors.title}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </div>
            ) : (
              <h1 className="mt-1.5 text-xl font-semibold text-slate-900 sm:text-2xl">{quote?.title}</h1>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              {client ? (
                <Link href={`/clients/${client.id}`} className="font-medium text-slate-700 hover:text-primary">
                  {clientDisplayName(client)}
                </Link>
              ) : (
                "Choisissez un client"
              )}
              {detail?.authorName ? ` · par ${detail.authorName}` : ""}
              {quote && !editing ? ` · ${formatEUR(quote.total_ttc)} TTC` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} data-testid="open-preview">
                <FileSearchIcon />
                Aperçu A4
              </Button>
              {!editing ? (
                <Button variant="outline" size="sm" onClick={printDocument}>
                  <PrinterIcon />
                  Imprimer / PDF
                </Button>
              ) : null}
              {quote && status !== "brouillon" && portalLink ? (
                <Button asChild variant="outline" size="sm">
                  <a href={portalLink} target="_blank" rel="noreferrer" data-testid="header-open-portal">
                    <ExternalLinkIcon />
                    Portail client
                  </a>
                </Button>
              ) : null}
              {canManage && quote?.status === "envoye" ? (
                <Button variant="outline" size="sm" onClick={() => setConfirm("reopen")} data-testid="reopen-quote">
                  <FilePenLineIcon />
                  Modifier
                </Button>
              ) : null}
              {editing && quote && !quote.sent_at ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Plus d'actions">
                      <MoreHorizontalIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}>
                      <Trash2Icon />
                      Supprimer le brouillon
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </div>
          <div className="rounded-lg border bg-card px-3 pt-3 pb-2 shadow-xs">
            <QuoteStatusTrack
              status={status}
              sentAt={quote?.sent_at}
              viewedAt={quote?.viewed_at}
              signedAt={quote?.signed_at}
              refusedAt={quote?.refused_at}
            />
          </div>
        </div>
      </Reveal>

      <AnimatePresence mode="wait" initial={false}>
        {editing ? (
          <motion.div key="edit" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: DURATION.slow, ease: EASE_OUT }}>
            <QuoteEditorBody
              editor={editor}
              data={data}
              client={client}
              saved={!!quote}
              doc={workingDoc}
              errors={errors}
              showMargins={showMargins}
              canEditPrice={showMargins}
              canManageCatalog={can(role, "manage_catalog")}
              defaultVat={defaultVat}
              recommendation={recommendation}
              onSave={() => void save()}
              onSend={openSend}
            />
          </motion.div>
        ) : quote && detail && savedDoc && savedTotals ? (
          <motion.div key={`view-${quote.status}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: DURATION.slow, ease: EASE_OUT }}>
            <QuoteDetailBody
              quote={quote}
              client={detail.client}
              equipment={detail.equipment}
              intervention={detail.intervention}
              activities={detail.activities}
              comments={detail.comments}
              data={data}
              doc={savedDoc}
              totals={savedTotals}
              showMargins={showMargins}
              canManage={canManage}
              portalLink={portalLink}
              reminding={reminding}
              onRemind={() => void remind()}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {quote ? <SendQuoteSheet open={sendOpen} onOpenChange={setSendOpen} quote={quote} /> : null}

      <QuotePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        reference={reference}
        actions={
          editing ? (
            <Button
              size="sm"
              onClick={() => {
                setPreviewOpen(false);
                openSend();
              }}
            >
              <SendIcon />
              Envoyer
            </Button>
          ) : null
        }
      >
        {client ? <QuoteDocument doc={doc} organization={data.organization} client={client} equipment={data.equipment.find((e) => e.id === (editing ? editor.input.equipment_id : quote?.equipment_id))} reveal /> : null}
      </QuotePreviewDialog>

      {client ? (
        <PrintRoot>
          <QuoteDocument doc={doc} organization={data.organization} client={client} equipment={data.equipment.find((e) => e.id === (editing ? editor.input.equipment_id : quote?.equipment_id))} />
        </PrintRoot>
      ) : null}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "delete" ? "Supprimer ce brouillon ?" : "Repasser le devis en brouillon ?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? `${reference} n'a jamais été envoyé : il sera supprimé. La suppression est notée dans la timeline du client.`
                : "Le client ne pourra plus le signer tant que vous ne l'aurez pas renvoyé. Son lien affichera la nouvelle version après l'envoi."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "delete" ? "destructive" : "default"}
              onClick={() => {
                if (!quote) return;
                if (confirm === "delete") {
                  if (actions.deleteQuoteDraft(quote.id)) {
                    toast.success("Brouillon supprimé", { description: reference });
                    setLeaving(true);
                    router.push("/quotes");
                  }
                } else if (actions.reopenQuote(quote.id)) {
                  toast.success("Devis repassé en brouillon", { description: "Modifiez-le puis renvoyez-le au client." });
                }
                setConfirm(null);
              }}
            >
              {confirm === "delete" ? (
                <>
                  <FileXIcon />
                  Supprimer
                </>
              ) : (
                "Modifier le devis"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
