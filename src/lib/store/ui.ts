import { create } from "zustand";

/** État d'interface éphémère (non persisté) partagé entre la barre du haut, la sidebar et la palette. */
interface UiState {
  commandOpen: boolean;
  resetDialogOpen: boolean;
  mobileNavOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  setResetDialogOpen: (open: boolean) => void;
  setMobileNavOpen: (open: boolean) => void;
}

export const useUi = create<UiState>()((set) => ({
  commandOpen: false,
  resetDialogOpen: false,
  mobileNavOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setResetDialogOpen: (resetDialogOpen) => set({ resetDialogOpen }),
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
}));
