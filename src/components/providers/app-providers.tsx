"use client";

import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ResetDemoDialog } from "@/components/layout/reset-demo-dialog";
import { BatopsProvider } from "./batops-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <BatopsProvider>
        {children}
        <ResetDemoDialog />
      </BatopsProvider>
      <Toaster />
    </TooltipProvider>
  );
}
