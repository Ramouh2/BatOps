"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BookOpenIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SearchXIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { CatalogCategory, CatalogItem } from "@/types/batops";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SegmentedTabs } from "@/components/ui/segmented";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { ProgressBar } from "@/components/motion/progress-bar";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/reveal";
import { Swap } from "@/components/motion/swap";
import { MarginIndicator } from "@/components/catalog/margin-indicator";
import { PriceCell } from "@/components/catalog/price-cell";
import { CatalogItemSheet } from "@/components/catalog/catalog-item-sheet";
import { useActions, useCurrentUser, useData, useNow } from "@/lib/store";
import { catalogItemUsage } from "@/lib/store/actions/catalog";
import { can } from "@/lib/permissions";
import { CATALOG_CATEGORY_LABEL, UNIT_LABEL } from "@/lib/domain/labels";
import { formatPercent, formatRelativeTime, formatVatRate } from "@/lib/domain/format";
import { catalogMargin, round2 } from "@/lib/domain/money";
import type { CatalogItemInput } from "@/lib/domain/validation";
import { normalize } from "@/providers/text";
import { listItem, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

type CategoryTab = "all" | CatalogCategory;
const CATEGORY_ORDER: CatalogCategory[] = ["main_oeuvre", "deplacement", "fourniture", "forfait", "maintenance"];
const CATEGORY_TABS: { value: CategoryTab; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "main_oeuvre", label: "Main-d'œuvre" },
  { value: "deplacement", label: "Déplacement" },
  { value: "fourniture", label: "Fournitures" },
  { value: "forfait", label: "Forfaits" },
  { value: "maintenance", label: "Contrats" },
];

const GRID_OWNER = "md:grid-cols-[7.5rem_minmax(0,2.4fr)_3.5rem_7.5rem_7.5rem_minmax(14rem,1.6fr)_3.5rem_2.25rem]";
const GRID_READER = "md:grid-cols-[7.5rem_minmax(0,2.4fr)_3.5rem_8rem_4rem]";

function inputFrom(item: CatalogItem): CatalogItemInput {
  return {
    reference: item.reference,
    name: item.name,
    description: item.description,
    category: item.category,
    unit: item.unit,
    buying_price_ht: item.buying_price_ht,
    selling_price_ht: item.selling_price_ht,
    vat_rate: item.vat_rate,
    supplier_name: item.supplier_name,
  };
}

export function CatalogView() {
  const data = useData((d) => d);
  const now = useNow();
  const user = useCurrentUser();
  const { updateCatalogItem, setCatalogItemActive, deleteCatalogItem } = useActions();
  const canManage = user ? can(user.role, "manage_catalog") : false;
  const showMargins = user ? can(user.role, "view_margins") : false;

  const [tab, setTab] = useState<CategoryTab>("all");
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | undefined>();
  const [deleting, setDeleting] = useState<CatalogItem | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...data.catalog].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)),
    [data.catalog],
  );
  const active = useMemo(() => sorted.filter((c) => c.is_active), [sorted]);
  const pool = showArchived ? sorted : active;
  const counts = useMemo(() => {
    const result: Record<CategoryTab, number> = { all: pool.length, main_oeuvre: 0, deplacement: 0, fourniture: 0, forfait: 0, maintenance: 0 };
    for (const item of pool) result[item.category] += 1;
    return result;
  }, [pool]);
  const visible = useMemo(() => {
    const q = normalize(query);
    return pool.filter(
      (item) =>
        (tab === "all" || item.category === tab) &&
        (!q || normalize(`${item.reference} ${item.name} ${item.supplier_name ?? ""} ${item.description ?? ""}`).includes(q)),
    );
  }, [pool, tab, query]);

  const stats = useMemo(() => {
    const margins = active.map((c) => catalogMargin(c).margin_percent);
    const average = margins.length ? round2(margins.reduce((s, m) => s + m, 0) / margins.length) : 0;
    const low = active.filter((c) => {
      const m = catalogMargin(c);
      return m.margin_ht < 0 || m.margin_percent < 25;
    }).length;
    const lastUpdate = data.catalog.reduce<string | undefined>((max, c) => (c.updated_at && (!max || c.updated_at > max) ? c.updated_at : max), undefined);
    return { average, low, lastUpdate, archived: data.catalog.length - active.length };
  }, [active, data.catalog]);

  const updatePrice = (item: CatalogItem, field: "buying_price_ht" | "selling_price_ht", value: number) => {
    const before = catalogMargin(item).margin_percent;
    const next = { ...inputFrom(item), [field]: value };
    const result = updateCatalogItem(item.id, next);
    if (!result.ok) {
      toast.error(Object.values(result.errors)[0] ?? "Prix refusé.");
      return false;
    }
    const after = catalogMargin(next).margin_percent;
    setHighlightId(item.id);
    toast.success(`${field === "selling_price_ht" ? "Prix de vente" : "Prix d'achat"} mis à jour — ${item.reference}`, {
      description: `Marge ${formatPercent(before)} → ${formatPercent(after)}. Les prochains devis utiliseront ce tarif.`,
    });
    return true;
  };

  const toggleArchive = (item: CatalogItem) => {
    if (!setCatalogItemActive(item.id, !item.is_active)) return;
    toast.success(item.is_active ? "Article archivé" : "Article réactivé", {
      description: item.is_active ? `${item.reference} n'est plus proposé dans les nouveaux devis.` : `${item.reference} est de nouveau proposé.`,
    });
  };

  const openSheet = (item?: CatalogItem) => {
    setEditing(item);
    setSheetOpen(true);
  };

  const grid = showMargins ? GRID_OWNER : GRID_READER;

  return (
    <>
      <Reveal>
        <PageHeader
          title="Catalogue & tarifs"
          description="La bibliothèque de prix utilisée par vos devis et par l'assistant IA."
          actions={
            canManage ? (
              <Button onClick={() => openSheet()}>
                <PlusIcon />
                Nouvel article
              </Button>
            ) : null
          }
        />
      </Reveal>

      <Stagger className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" delay={0.05}>
        <StaggerItem className="rounded-lg border bg-card px-4 py-3 shadow-xs">
          <p className="text-xs text-muted-foreground">Articles actifs</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            <AnimatedNumber value={active.length} />
          </p>
        </StaggerItem>
        {showMargins ? (
          <>
            <StaggerItem className="rounded-lg border bg-card px-4 py-3 shadow-xs" data-testid="catalog-average-margin">
              <p className="text-xs text-muted-foreground">Marge moyenne</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                <AnimatedNumber value={stats.average} format={formatPercent} />
              </p>
              <ProgressBar value={stats.average} tone={stats.average >= 40 ? "success" : stats.average >= 25 ? "info" : "warning"} label="Marge moyenne" className="mt-2" />
            </StaggerItem>
            <StaggerItem className="rounded-lg border bg-card px-4 py-3 shadow-xs">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TriangleAlertIcon className={cn("size-3.5", stats.low > 0 ? "text-amber-500" : "text-slate-300")} />
                Marge faible (&lt; 25 %)
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                <AnimatedNumber value={stats.low} />
              </p>
            </StaggerItem>
          </>
        ) : (
          <>
            <StaggerItem className="rounded-lg border bg-card px-4 py-3 shadow-xs">
              <p className="text-xs text-muted-foreground">Fournitures</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                <AnimatedNumber value={active.filter((c) => c.category === "fourniture").length} />
              </p>
            </StaggerItem>
            <StaggerItem className="rounded-lg border bg-card px-4 py-3 shadow-xs">
              <p className="text-xs text-muted-foreground">Main-d&apos;œuvre & forfaits</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                <AnimatedNumber value={active.filter((c) => c.category !== "fourniture").length} />
              </p>
            </StaggerItem>
          </>
        )}
        <StaggerItem className="rounded-lg border bg-card px-4 py-3 shadow-xs">
          <p className="text-xs text-muted-foreground">Dernière mise à jour</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            <Swap swapKey={stats.lastUpdate ?? "none"}>{stats.lastUpdate ? formatRelativeTime(stats.lastUpdate, now) : "—"}</Swap>
          </p>
        </StaggerItem>
      </Stagger>

      <Reveal delay={0.1} className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <SegmentedTabs
          label="Filtrer par type"
          value={tab}
          onValueChange={setTab}
          items={CATEGORY_TABS.map((t) => ({
            value: t.value,
            label: t.label,
            suffix: (
              <span className="rounded-full bg-slate-200/70 px-1.5 text-[11px] font-semibold text-slate-600 tabular">
                <Swap swapKey={counts[t.value]}>{counts[t.value]}</Swap>
              </span>
            ),
          }))}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {stats.archived > 0 ? (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <Switch checked={showArchived} onCheckedChange={setShowArchived} aria-label="Afficher les articles archivés" />
              Archivés ({stats.archived})
            </label>
          ) : null}
          <div className="relative w-full sm:w-64">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Référence, désignation, marque…" aria-label="Rechercher un article" className="pl-9" />
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.16}>
        <section className="overflow-hidden rounded-lg border bg-card shadow-xs" aria-label="Articles du catalogue">
          <div className={cn("hidden gap-4 border-b bg-slate-50/70 px-4 py-2 text-xs font-medium text-muted-foreground md:grid", grid)} aria-hidden="true">
            <span>Référence</span>
            <span>Désignation</span>
            <span>Unité</span>
            {showMargins ? <span>Achat HT</span> : null}
            <span>Vente HT</span>
            {showMargins ? <span>Marge</span> : null}
            <span>TVA</span>
            {showMargins ? <span /> : null}
          </div>
          {visible.length === 0 ? (
            <EmptyState
              icon={query ? SearchXIcon : BookOpenIcon}
              title={query ? `Aucun article pour « ${query} »` : "Aucun article dans cette catégorie"}
              action={
                query ? (
                  <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                    Effacer la recherche
                  </Button>
                ) : canManage ? (
                  <Button size="sm" onClick={() => openSheet()}>
                    <PlusIcon />
                    Nouvel article
                  </Button>
                ) : undefined
              }
            />
          ) : null}
          <motion.ul layout className="divide-y">
            <AnimatePresence mode="popLayout" initial={false}>
              {visible.map((item) => {
                const usage = catalogItemUsage(data, item.id);
                return (
                  <motion.li
                    key={item.id}
                    layout
                    variants={listItem}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={SPRING.layout}
                    className={cn(
                      "relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-slate-50/70",
                      grid,
                      !item.is_active && "opacity-60",
                    )}
                    data-testid={`catalog-row-${item.reference}`}
                  >
                    {item.id === highlightId ? (
                      <motion.span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-emerald-50"
                        initial={{ opacity: 1 }}
                        animate={{ opacity: 0 }}
                        transition={{ duration: 1.8, ease: "easeOut", delay: 0.2 }}
                      />
                    ) : null}
                    <span className="relative hidden font-mono text-xs text-slate-500 md:block">{item.reference}</span>
                    <div className="relative min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900" title={item.name}>
                        {item.name}
                      </p>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="font-mono md:hidden">{item.reference}</span>
                        {CATALOG_CATEGORY_LABEL[item.category]}
                        {item.supplier_name ? ` · ${item.supplier_name}` : ""}
                        {!item.is_active ? <Badge>Archivé</Badge> : null}
                      </p>
                    </div>
                    <span className="relative hidden text-sm text-slate-600 md:block">{UNIT_LABEL[item.unit]}</span>
                    {showMargins ? (
                      <div className="relative hidden md:block">
                        <PriceCell
                          value={item.buying_price_ht}
                          label={`Prix d'achat HT de ${item.reference}`}
                          editable={canManage}
                          onCommit={(v) => updatePrice(item, "buying_price_ht", v)}
                        />
                      </div>
                    ) : null}
                    <div className="relative justify-self-end md:justify-self-start">
                      <PriceCell
                        value={item.selling_price_ht}
                        label={`Prix de vente HT de ${item.reference}`}
                        editable={canManage}
                        onCommit={(v) => updatePrice(item, "selling_price_ht", v)}
                        className="font-medium"
                      />
                    </div>
                    {showMargins ? <MarginIndicator item={item} className="relative col-span-2 md:col-span-1" /> : null}
                    <span className="relative hidden text-sm text-slate-600 tabular md:block">{formatVatRate(item.vat_rate)}</span>
                    {canManage ? (
                      <div className="relative col-span-2 flex justify-end md:col-span-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${item.reference}`}>
                              <MoreHorizontalIcon />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openSheet(item)}>
                              <PencilIcon />
                              Modifier l&apos;article
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => toggleArchive(item)}>
                              {item.is_active ? <ArchiveIcon /> : <ArchiveRestoreIcon />}
                              {item.is_active ? "Archiver" : "Réactiver"}
                            </DropdownMenuItem>
                            {usage.total === 0 ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(item)}>
                                  <Trash2Icon />
                                  Supprimer
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ) : null}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </motion.ul>
        </section>
      </Reveal>

      {canManage ? (
        <CatalogItemSheet open={sheetOpen} onOpenChange={setSheetOpen} item={editing} data={data} onSaved={(id) => setHighlightId(id)} />
      ) : null}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer définitivement cet article ?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `${deleting.reference} · ${deleting.name}` : ""} n&apos;est utilisé dans aucun document. Il sera retiré du catalogue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting && deleteCatalogItem(deleting.id)) toast.success("Article supprimé", { description: deleting.reference });
                setDeleting(null);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
