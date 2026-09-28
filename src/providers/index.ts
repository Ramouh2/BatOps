/**
 * Sélection des providers.
 *
 * MVP à 0 € : seuls les MockProviders existent et sont toujours utilisés — l'application fonctionne
 * entièrement sans clé API. Chaque service réel sera ajouté après validation commerciale derrière la même
 * interface (ex. `LiveAIProvider` Gemini activé par `GEMINI_API_KEY`) sans modifier l'interface utilisateur.
 */
import type { AIProvider } from "./ai/ai.provider";
import { MockAIProvider } from "./ai/mock-ai.provider";
import type { NotificationProvider } from "./notifications/notification.provider";
import { MockNotificationProvider } from "./notifications/notification.provider";
import type { StorageProvider } from "./storage/storage.provider";
import { MockStorageProvider } from "./storage/storage.provider";
import type { VoiceProvider } from "./voice/voice.provider";
import { MockVoiceProvider } from "./voice/mock-voice.provider";
import type { ProviderInfo } from "./types";

/** Latence simulée des mocks côté interface (réaliste pour la démo). */
const DEMO_LATENCY_MS = 600;

let aiProvider: AIProvider | undefined;
let voiceProvider: VoiceProvider | undefined;
let notificationProvider: NotificationProvider | undefined;
let storageProvider: StorageProvider | undefined;

export function getAIProvider(): AIProvider {
  aiProvider ??= new MockAIProvider(DEMO_LATENCY_MS);
  return aiProvider;
}

export function getVoiceProvider(): VoiceProvider {
  voiceProvider ??= new MockVoiceProvider(DEMO_LATENCY_MS);
  return voiceProvider;
}

export function getNotificationProvider(): NotificationProvider {
  notificationProvider ??= new MockNotificationProvider(250);
  return notificationProvider;
}

export function getStorageProvider(): StorageProvider {
  storageProvider ??= new MockStorageProvider();
  return storageProvider;
}

export function getProvidersInfo(): ProviderInfo[] {
  return [
    {
      key: "ai",
      name: "IA (devis, rapports, analyse d'appels)",
      mode: getAIProvider().mode,
      description: "Moteur de règles métier CVC / plomberie local : prix exclusivement issus de votre catalogue.",
      liveOption: "Google Gemini Flash",
      liveEnvVar: "GEMINI_API_KEY",
    },
    {
      key: "voice",
      name: "Standard vocal Nora",
      mode: getVoiceProvider().mode,
      description: "Nora V0 : appels simulés dans le navigateur (voix du navigateur si disponible).",
      liveOption: "Téléphonie Twilio / Telnyx + Vapi (Nora V2)",
      liveEnvVar: "VAPI_API_KEY",
    },
    {
      key: "notifications",
      name: "E-mails & SMS",
      mode: getNotificationProvider().mode,
      description: "Aucun envoi réel : chaque message est journalisé et consultable dans BATOPS.",
      liveOption: "Resend (e-mail) + Brevo (SMS)",
      liveEnvVar: "RESEND_API_KEY",
    },
    {
      key: "storage",
      name: "Stockage des photos",
      mode: getStorageProvider().mode,
      description: "Photos compressées et conservées dans le navigateur.",
      liveOption: "Supabase Storage",
      liveEnvVar: "NEXT_PUBLIC_SUPABASE_URL",
    },
  ];
}

export type { AIProvider, NotificationProvider, StorageProvider, VoiceProvider };
