import type { MessageChannel } from "@/types/batops";
import { wait, type ProviderMode } from "@/providers/types";

export interface OutgoingMessage {
  channel: MessageChannel;
  to: string;
  subject?: string;
  body: string;
}

export interface SendResult {
  status: "simule" | "envoye" | "echec";
  provider_mode: ProviderMode;
  sent_at: string;
}

/** E-mails & SMS. Le résultat est journalisé par l'action du store dans `outbox` + timeline client. */
export interface NotificationProvider {
  readonly mode: ProviderMode;
  send(message: OutgoingMessage): Promise<SendResult>;
}

/** Aucun envoi réel : le message est seulement « simulé » et reste consultable dans l'application. */
export class MockNotificationProvider implements NotificationProvider {
  readonly mode = "mock" as const;

  constructor(private readonly latencyMs = 0) {}

  async send(message: OutgoingMessage): Promise<SendResult> {
    if (!message.to.trim()) return { status: "echec", provider_mode: "mock", sent_at: new Date().toISOString() };
    await wait(this.latencyMs);
    return { status: "simule", provider_mode: "mock", sent_at: new Date().toISOString() };
  }
}
