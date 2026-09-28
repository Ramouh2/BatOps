import type {
  CallIntent,
  CallStatus,
  CatalogCategory,
  CatalogUnit,
  ClientSource,
  ClientStatus,
  ClientType,
  EquipmentCategory,
  InterventionPriority,
  InterventionStatus,
  InterventionType,
  InvoiceType,
  PaymentMethod,
  PhotoCategory,
  QuoteStatus,
  Urgency,
  UserRole,
} from "@/types/batops";
import type { ContractDisplayStatus, InvoiceDisplayStatus } from "./status";

/** Tons sémantiques du design system (cf. cadrage §12). */
export type Tone = "success" | "info" | "warning" | "danger" | "neutral" | "ai";

export interface StatusMeta {
  label: string;
  tone: Tone;
}

export const QUOTE_STATUS: Record<QuoteStatus, StatusMeta> = {
  brouillon: { label: "Brouillon", tone: "neutral" },
  envoye: { label: "Envoyé", tone: "info" },
  accepte: { label: "Signé", tone: "success" },
  refuse: { label: "Refusé", tone: "danger" },
  expire: { label: "Expiré", tone: "neutral" },
};

export const INTERVENTION_STATUS: Record<InterventionStatus, StatusMeta> = {
  nouvelle: { label: "À planifier", tone: "warning" },
  planifiee: { label: "Planifiée", tone: "info" },
  en_route: { label: "En route", tone: "warning" },
  sur_place: { label: "Sur place", tone: "info" },
  en_cours: { label: "En cours", tone: "info" },
  terminee: { label: "Terminée", tone: "success" },
  annulee: { label: "Annulée", tone: "neutral" },
};

export const INVOICE_STATUS: Record<InvoiceDisplayStatus, StatusMeta> = {
  brouillon: { label: "Brouillon", tone: "neutral" },
  emise: { label: "Émise", tone: "info" },
  partiellement_payee: { label: "Paiement partiel", tone: "warning" },
  payee: { label: "Payée", tone: "success" },
  en_retard: { label: "En retard", tone: "danger" },
  annulee: { label: "Annulée", tone: "neutral" },
};

export const CONTRACT_STATUS: Record<ContractDisplayStatus, StatusMeta> = {
  actif: { label: "Actif", tone: "success" },
  a_planifier: { label: "Visite à planifier", tone: "warning" },
  visite_planifiee: { label: "Visite planifiée", tone: "info" },
  visite_en_retard: { label: "Visite en retard", tone: "danger" },
  expire: { label: "Expiré", tone: "neutral" },
};

export const CALL_STATUS: Record<CallStatus, StatusMeta> = {
  qualifie_ia: { label: "Qualifié par Nora", tone: "ai" },
  a_rappeler: { label: "À rappeler", tone: "warning" },
  converti: { label: "Converti", tone: "success" },
};

export const PRIORITY: Record<InterventionPriority, StatusMeta> = {
  normale: { label: "Normale", tone: "neutral" },
  haute: { label: "Haute", tone: "warning" },
  urgente: { label: "Urgente", tone: "danger" },
};

export const URGENCY: Record<Urgency, StatusMeta> = {
  basse: { label: "Basse", tone: "neutral" },
  normale: { label: "Normale", tone: "neutral" },
  haute: { label: "Haute", tone: "warning" },
  urgente: { label: "Urgente", tone: "danger" },
};

export const CLIENT_STATUS: Record<ClientStatus, StatusMeta> = {
  prospect: { label: "Prospect", tone: "info" },
  client: { label: "Client", tone: "neutral" },
};

export const CLIENT_TYPE_LABEL: Record<ClientType, string> = {
  particulier: "Particulier",
  professionnel: "Professionnel",
  syndic: "Syndic",
};

export const CLIENT_SOURCE_LABEL: Record<ClientSource, string> = {
  nora_ia: "Appel Nora",
  telephone: "Téléphone bureau",
  recommandation: "Bouche-à-oreille",
  site_web: "Site web",
};

export const INTERVENTION_TYPE_LABEL: Record<InterventionType, string> = {
  installation: "Installation",
  depannage: "Dépannage",
  maintenance: "Maintenance",
  sav: "SAV",
};

export const CALL_INTENT_LABEL: Record<CallIntent, string> = {
  depannage: "Dépannage",
  devis_installation: "Demande de devis",
  entretien: "Entretien",
  information: "Information",
};

export const INVOICE_TYPE_LABEL: Record<InvoiceType, string> = {
  acompte: "Acompte",
  facture: "Facture",
  avoir: "Avoir",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  virement: "Virement",
  cb: "Carte bancaire",
  cheque: "Chèque",
  especes: "Espèces",
  prelevement: "Prélèvement",
};

export const PHOTO_CATEGORY_LABEL: Record<PhotoCategory, string> = {
  avant: "Avant",
  pendant: "Pendant",
  apres: "Après",
  anomalie: "Anomalie",
  plaque_materiel: "Plaque / Matériel",
};

export const EQUIPMENT_CATEGORY_LABEL: Record<EquipmentCategory, string> = {
  climatisation: "Climatisation",
  pac_air_eau: "PAC Air/Eau",
  pac_air_air: "PAC Air/Air (multi-split)",
  chaudiere: "Chaudière",
  ballon_ecs: "Ballon ECS",
  vmc: "VMC",
  tableau_elec: "Tableau électrique",
  autre: "Autre",
};

export const CATALOG_CATEGORY_LABEL: Record<CatalogCategory, string> = {
  main_oeuvre: "Main-d'œuvre",
  deplacement: "Déplacement",
  fourniture: "Fourniture",
  forfait: "Forfait",
  maintenance: "Contrat maintenance",
};

export const UNIT_LABEL: Record<CatalogUnit, string> = {
  u: "u",
  h: "h",
  m: "m",
  forfait: "forfait",
};

export const ROLE_LABEL: Record<UserRole, string> = {
  owner: "Dirigeant",
  dispatcher: "Secrétariat",
  technician: "Technicien",
  accountant: "Comptable",
};
