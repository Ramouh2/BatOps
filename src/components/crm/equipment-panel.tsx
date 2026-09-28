"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MoreHorizontalIcon, PackageOpenIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import type { BatopsData, Equipment } from "@/types/batops";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { EquipmentIcon } from "@/components/crm/equipment-icon";
import { EquipmentFormSheet } from "@/components/crm/equipment-form-sheet";
import { useActions, useNow } from "@/lib/store";
import { equipmentUsage } from "@/lib/store/actions/crm";
import { EQUIPMENT_CATEGORY_LABEL } from "@/lib/domain/labels";
import { warrantyStatus } from "@/lib/domain/equipment";
import { formatDate } from "@/lib/domain/format";
import { insertedItem, SPRING } from "@/lib/motion";

/** Parc installé du client : registre des machines, garanties, ajout / modification / retrait. */
export function EquipmentPanel({
  clientId,
  clientName,
  equipment,
  data,
}: {
  clientId: string;
  clientName: string;
  equipment: Equipment[];
  data: Pick<BatopsData, "interventions" | "contracts">;
}) {
  const now = useNow();
  const { removeEquipment } = useActions();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | undefined>();
  const [removing, setRemoving] = useState<Equipment | null>(null);

  const openForm = (item?: Equipment) => {
    setEditing(item);
    setFormOpen(true);
  };

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Parc installé</h2>
        <Button size="sm" variant="outline" onClick={() => openForm()} aria-label="Ajouter un équipement">
          <PlusIcon />
          Ajouter
        </Button>
      </div>

      {equipment.length === 0 ? (
        <EmptyState
          icon={PackageOpenIcon}
          className="rounded-lg border border-dashed py-8"
          title="Aucun équipement enregistré"
          description="Enregistrez la PAC, la clim ou la chaudière du client pour préparer ses entretiens."
        />
      ) : (
        <motion.ul layout className="space-y-2">
          <AnimatePresence initial={false} mode="popLayout">
            {equipment.map((item) => {
              const usage = equipmentUsage(data, item.id);
              const locked = usage.interventions + usage.contracts > 0;
              const warranty = warrantyStatus(item, now);
              return (
                <motion.li
                  key={item.id}
                  layout
                  variants={insertedItem}
                  initial="initial"
                  animate="animate"
                  exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
                  transition={SPRING.layout}
                  className="flex gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-slate-300"
                  data-testid="equipment-item"
                >
                  <EquipmentIcon category={item.category} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">
                      {item.brand} {item.model}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {EQUIPMENT_CATEGORY_LABEL[item.category]}
                      {item.location_in_property ? ` · ${item.location_in_property}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {item.refrigerant_type ? <Badge tone="info">{item.refrigerant_type}</Badge> : null}
                      {item.serial_number ? <Badge className="font-mono">S/N {item.serial_number}</Badge> : null}
                      {item.installation_date ? <Badge>Posé le {formatDate(item.installation_date)}</Badge> : null}
                      {warranty ? <Badge tone={warranty.tone}>{warranty.label}</Badge> : null}
                    </div>
                    {locked ? (
                      <p className="mt-1.5 text-[11px] text-slate-400">
                        Lié à {usage.interventions > 0 ? `${usage.interventions} intervention${usage.interventions > 1 ? "s" : ""}` : ""}
                        {usage.interventions > 0 && usage.contracts > 0 ? " et " : ""}
                        {usage.contracts > 0 ? `${usage.contracts} contrat${usage.contracts > 1 ? "s" : ""}` : ""} — conservé dans l&apos;historique.
                      </p>
                    ) : null}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${item.brand} ${item.model}`}>
                        <MoreHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => openForm(item)}>
                        <PencilIcon />
                        Modifier
                      </DropdownMenuItem>
                      {!locked ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(item)}>
                            <Trash2Icon />
                            Retirer du parc
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </motion.ul>
      )}

      <EquipmentFormSheet open={formOpen} onOpenChange={setFormOpen} clientId={clientId} clientName={clientName} equipment={editing} />

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer cet équipement du parc ?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing ? `${removing.brand} ${removing.model}` : ""} sera retiré du parc de {clientName}. Le retrait est noté dans la timeline.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (removing && removeEquipment(removing.id)) {
                  toast.success("Équipement retiré du parc", { description: `${removing.brand} ${removing.model}` });
                }
                setRemoving(null);
              }}
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
