/**
 * Validation des saisies (formulaires CRM, équipements, catalogue).
 * Fonctions pures : utilisées par les formulaires (erreurs en ligne) ET par les actions du store (garde-fou).
 */
import type {
  CatalogCategory,
  CatalogItem,
  CatalogUnit,
  Civility,
  ClientSource,
  ClientType,
  EquipmentCategory,
  RefrigerantType,
  VatRate,
} from "@/types/batops";
import { formatPhone } from "./format";

export type FieldErrors<K extends string = string> = Partial<Record<K, string>>;

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Téléphone français → `06 42 18 99 10`, ou `null` s'il est invalide. Accepte +33 / espaces / points. */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+33")) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith("0033")) digits = `0${digits.slice(4)}`;
  digits = digits.replace(/\D/g, "");
  if (!/^0[1-9]\d{8}$/.test(digits)) return null;
  return formatPhone(digits);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/** Nombre saisi à la française (`1 450,50`, `68`, `24.5`) → nombre, ou `null`. */
export function parseDecimal(raw: string): number | null {
  const cleaned = raw.replace(/[\s  €]/g, "").replace(",", ".");
  if (cleaned === "" || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

const trimOrUndefined = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/* ------------------------------------------------------------------ */
/* Clients & prospects                                                 */
/* ------------------------------------------------------------------ */

export interface ClientInput {
  status: "prospect" | "client";
  type: ClientType;
  civility?: Civility;
  first_name?: string;
  last_name: string;
  company_name?: string;
  email?: string;
  phone: string;
  address: string;
  postal_code: string;
  city: string;
  access_notes?: string;
  source?: ClientSource;
  notes?: string;
  housing_over_2_years?: boolean;
}

export type ClientField = keyof ClientInput;

/** 4 informations obligatoires (cadrage) : nom, téléphone, adresse + ville, type. */
export function validateClientInput(input: ClientInput): FieldErrors<ClientField> {
  const errors: FieldErrors<ClientField> = {};
  const isCompany = input.type !== "particulier";
  if (isCompany && !input.company_name?.trim()) {
    errors.company_name = input.type === "syndic" ? "Nom du syndic requis." : "Raison sociale requise.";
  }
  if (!isCompany && !input.last_name.trim()) errors.last_name = "Nom requis.";
  if (!input.phone.trim()) errors.phone = "Téléphone requis.";
  else if (!normalizePhone(input.phone)) errors.phone = "Numéro invalide (10 chiffres, ex. 06 42 18 99 10).";
  if (input.email?.trim() && !isValidEmail(input.email)) errors.email = "Adresse e-mail invalide.";
  if (!input.address.trim()) errors.address = "Adresse requise.";
  if (!/^\d{5}$/.test(input.postal_code.trim())) errors.postal_code = "Code postal à 5 chiffres.";
  if (!input.city.trim()) errors.city = "Ville requise.";
  return errors;
}

/** Nettoie une saisie valide avant enregistrement (téléphone normalisé, champs vides retirés). */
export function normalizeClientInput(input: ClientInput): ClientInput {
  const isCompany = input.type !== "particulier";
  const company = trimOrUndefined(input.company_name);
  const lastName = input.last_name.trim() || (isCompany ? (company ?? "") : "");
  return {
    status: input.status,
    type: input.type,
    civility: input.civility,
    first_name: trimOrUndefined(input.first_name),
    last_name: lastName,
    company_name: isCompany ? company : undefined,
    email: trimOrUndefined(input.email)?.toLowerCase(),
    phone: normalizePhone(input.phone) ?? input.phone.trim(),
    address: input.address.trim(),
    postal_code: input.postal_code.trim(),
    city: input.city.trim(),
    access_notes: trimOrUndefined(input.access_notes),
    source: input.source,
    notes: trimOrUndefined(input.notes),
    housing_over_2_years: input.type === "particulier" ? input.housing_over_2_years : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Équipements                                                         */
/* ------------------------------------------------------------------ */

export interface EquipmentInput {
  category: EquipmentCategory;
  brand: string;
  model: string;
  serial_number?: string;
  refrigerant_type?: RefrigerantType;
  installation_date?: string;
  warranty_end_date?: string;
  location_in_property?: string;
  notes?: string;
}

export type EquipmentField = keyof EquipmentInput;

/** Catégories qui contiennent un fluide frigorigène (champ pertinent). */
export const REFRIGERANT_CATEGORIES: EquipmentCategory[] = ["climatisation", "pac_air_eau", "pac_air_air"];

export function validateEquipmentInput(input: EquipmentInput): FieldErrors<EquipmentField> {
  const errors: FieldErrors<EquipmentField> = {};
  if (!input.brand.trim()) errors.brand = "Marque requise.";
  if (!input.model.trim()) errors.model = "Modèle requis.";
  if (input.installation_date && input.warranty_end_date && input.warranty_end_date < input.installation_date) {
    errors.warranty_end_date = "La fin de garantie précède la date de pose.";
  }
  return errors;
}

export function normalizeEquipmentInput(input: EquipmentInput): EquipmentInput {
  return {
    category: input.category,
    brand: input.brand.trim(),
    model: input.model.trim(),
    serial_number: trimOrUndefined(input.serial_number),
    refrigerant_type: REFRIGERANT_CATEGORIES.includes(input.category) ? input.refrigerant_type : undefined,
    installation_date: trimOrUndefined(input.installation_date),
    warranty_end_date: trimOrUndefined(input.warranty_end_date),
    location_in_property: trimOrUndefined(input.location_in_property),
    notes: trimOrUndefined(input.notes),
  };
}

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

export interface CatalogItemInput {
  reference: string;
  name: string;
  description?: string;
  category: CatalogCategory;
  unit: CatalogUnit;
  buying_price_ht: number;
  selling_price_ht: number;
  vat_rate: VatRate;
  supplier_name?: string;
}

export type CatalogField = keyof CatalogItemInput;

export function validateCatalogItemInput(
  input: CatalogItemInput,
  catalog: Pick<CatalogItem, "id" | "reference">[],
  editingId?: string,
): FieldErrors<CatalogField> {
  const errors: FieldErrors<CatalogField> = {};
  const reference = input.reference.trim().toUpperCase();
  if (!reference) errors.reference = "Référence requise.";
  else if (!/^[A-Z0-9][A-Z0-9-]*$/.test(reference)) errors.reference = "Lettres, chiffres et tirets uniquement.";
  else if (catalog.some((c) => c.reference === reference && c.id !== editingId)) {
    errors.reference = "Cette référence existe déjà.";
  }
  if (!input.name.trim()) errors.name = "Désignation requise.";
  if (!Number.isFinite(input.buying_price_ht) || input.buying_price_ht < 0) errors.buying_price_ht = "Prix d'achat invalide.";
  if (!Number.isFinite(input.selling_price_ht) || input.selling_price_ht < 0) errors.selling_price_ht = "Prix de vente invalide.";
  return errors;
}

export function normalizeCatalogItemInput(input: CatalogItemInput): CatalogItemInput {
  return {
    reference: input.reference.trim().toUpperCase(),
    name: input.name.trim(),
    description: trimOrUndefined(input.description),
    category: input.category,
    unit: input.unit,
    buying_price_ht: Math.round(input.buying_price_ht * 100) / 100,
    selling_price_ht: Math.round(input.selling_price_ht * 100) / 100,
    vat_rate: input.vat_rate,
    supplier_name: trimOrUndefined(input.supplier_name),
  };
}
