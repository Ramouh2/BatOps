"use client";

import { toast } from "sonner";
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
import { useActions } from "@/lib/store";
import { useUi } from "@/lib/store/ui";

/** Confirmation unique de réinitialisation, ouvrable depuis la sidebar, la palette, le bandeau ou les paramètres. */
export function ResetDemoDialog() {
  const open = useUi((s) => s.resetDialogOpen);
  const setOpen = useUi((s) => s.setResetDialogOpen);
  const { resetDemo } = useActions();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Réinitialiser la démo ClimAir Pro ?</AlertDialogTitle>
          <AlertDialogDescription>
            Toutes les modifications faites pendant la démo (devis, signatures, interventions, paiements…) seront
            effacées. Les données d&apos;origine sont régénérées et recalées sur aujourd&apos;hui.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              resetDemo();
              toast.success("Démo réinitialisée", { description: "Les données ClimAir Pro sont recalées sur aujourd'hui." });
            }}
          >
            Réinitialiser
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
