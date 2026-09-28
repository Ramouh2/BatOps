import type { ModuleKey } from "@/lib/navigation";

export interface ModuleInfo {
  title: string;
  description: string;
  /** Sprint de livraison prévu (cadrage §14). */
  sprint: number;
  features: string[];
}

/** Périmètre P0 de chaque module, tel que défini par le cadrage BATOPS. */
export const MODULES: Record<ModuleKey, ModuleInfo> = {
  dashboard: {
    title: "Tableau de bord",
    description: "La météo de l'entreprise en 5 secondes, chaque matin.",
    sprint: 1,
    features: [
      "4 indicateurs : CA encaissé du mois, devis en attente, interventions du jour, factures en retard",
      "Programme de la journée avec le statut des techniciens en direct",
      "Actions urgentes : appels Nora, devis à relancer, interventions à facturer",
    ],
  },
  calls: {
    title: "Appels & Nora",
    description: "Capturer 100 % des appels entrants et les transformer en intervention ou en devis.",
    sprint: 6,
    features: [
      "Journal des appels avec transcription et résumé structuré",
      "Simulateur d'appel vocal Nora dans le navigateur (0 €)",
      "Conversion en 1 clic : prospect, devis ou intervention",
    ],
  },
  clients: {
    title: "Clients & prospects",
    description: "Le dossier 360° : coordonnées, accès chantier, parc installé et historique complet.",
    sprint: 1,
    features: [
      "Onglets Tous · Prospects à traiter · Clients · Sous contrat",
      "Registre des équipements : marque, modèle, n° de série, fluide, garantie",
      "Timeline unifiée : appels, devis, signatures, interventions, photos, factures",
      "Création d'un client en 4 champs",
    ],
  },
  quotes: {
    title: "Devis",
    description: "Créer, envoyer et faire signer un devis en moins de 2 minutes.",
    sprint: 2,
    features: [
      "Éditeur double colonne avec aperçu A4 en direct",
      "Assistant Devis IA basé sur votre catalogue — aucun prix inventé",
      "Marge nette en € et en %, multi-TVA, acompte à la signature",
      "Lien de signature électronique sur le portail client",
    ],
  },
  invoices: {
    title: "Factures & paiements",
    description: "Facturer sans erreur et suivre chaque encaissement.",
    sprint: 5,
    features: [
      "Acompte, facture finale (acompte déduit automatiquement), avoir",
      "Paiements partiels ou totaux, passage automatique « en retard »",
      "Mentions légales BTP sur le PDF : SIRET, décennale, RGE",
    ],
  },
  planning: {
    title: "Planning & dispatch",
    description: "La bonne intervention, au bon technicien, au bon créneau.",
    sprint: 3,
    features: [
      "Vues Jour, Semaine et Par technicien",
      "Colonne « À planifier » alimentée par les devis signés et les urgences",
      "Affectation en 1 clic avec détection des chevauchements",
    ],
  },
  interventions: {
    title: "Interventions",
    description: "Suivre l'exécution de chaque chantier et dépannage.",
    sprint: 3,
    features: [
      "Liste filtrable par statut, type et urgence",
      "Fiche chantier : briefing, checklist, pièces, photos, signature client",
      "Conversion en facture en 1 clic",
    ],
  },
  photos: {
    title: "Photos chantier",
    description: "Toutes les preuves visuelles de l'entreprise au même endroit.",
    sprint: 4,
    features: [
      "Galerie filtrable par client, intervention et tag (Avant, Après, Anomalie…)",
      "Horodatage et auteur de chaque photo",
      "Intégration automatique au rapport d'intervention signé",
    ],
  },
  sav: {
    title: "Maintenance & SAV",
    description: "Les contrats d'entretien annuels, source de chiffre d'affaires récurrent.",
    sprint: 5,
    features: [
      "Contrats actifs et date de la prochaine visite",
      "Alerte « Visite à planifier » à moins de 30 jours",
      "Création de la visite dans le planning en 1 clic",
    ],
  },
  catalog: {
    title: "Catalogue & tarifs",
    description: "La bibliothèque de prix qui protège votre marge sur chaque devis.",
    sprint: 1,
    features: [
      "Articles par type : main-d'œuvre, déplacement, fournitures, forfaits, contrats",
      "Prix d'achat, prix de vente et taux de marge calculé",
      "TVA par défaut 5,5 %, 10 % ou 20 %",
    ],
  },
  settings: {
    title: "Paramètres",
    description: "Identité, mentions légales BTP, équipe et mode démo.",
    sprint: 5,
    features: [
      "Coordonnées, logo et couleur des documents",
      "SIRET, assurance décennale, certifications RGE / QualiPAC",
      "Taux horaire, forfait déplacement et TVA par défaut",
    ],
  },
  tech: {
    title: "App technicien",
    description: "L'écran du technicien, utilisable à une main.",
    sprint: 4,
    features: [
      "Statut en 1 tap : En route → Sur place → Terminée",
      "Itinéraire Waze / Maps et appel client en 1 tap",
      "Photos avant/après, pièces utilisées, note reformulée par l'IA",
      "Signature du client au doigt et rapport PDF immédiat",
    ],
  },
};
