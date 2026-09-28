export type ProviderMode = "mock" | "live";
export type ProviderKey = "ai" | "voice" | "notifications" | "storage";

export interface ProviderInfo {
  key: ProviderKey;
  name: string;
  mode: ProviderMode;
  /** Ce que fait le provider actif. */
  description: string;
  /** Service réel prévu et variable d'environnement qui l'activera (après validation commerciale). */
  liveOption: string;
  liveEnvVar: string;
}

/** Latence simulée pour que la démo ressemble à un vrai appel réseau (0 en test). */
export function wait(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}
