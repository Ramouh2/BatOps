"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const NowContext = createContext<Date | null>(null);

/** Horloge partagée (rafraîchie chaque minute) pour les statuts dépendant du temps (retards, échéances…). */
export function NowProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return <NowContext.Provider value={now}>{children}</NowContext.Provider>;
}

export function useNow(): Date {
  const now = useContext(NowContext);
  if (!now) throw new Error("useNow() doit être utilisé sous <NowProvider>.");
  return now;
}
