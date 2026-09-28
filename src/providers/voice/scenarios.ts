/** Les 3 scénarios de démonstration de Nora V0 (cadrage §6). Répliques de l'appelant, jouées pas à pas. */
export interface NoraScenario {
  id: "fuite-clim" | "devis-pac" | "entretien";
  label: string;
  description: string;
  callerLines: string[];
}

export const NORA_SCENARIOS: NoraScenario[] = [
  {
    id: "fuite-clim",
    label: "Fuite clim urgente",
    description: "Un particulier appelle : sa climatisation fuit dans le salon.",
    callerLines: [
      "Bonjour, ma climatisation Mitsubishi fuit, il y a de l'eau qui coule sous l'appareil du salon, c'est assez urgent.",
      "Julien Weber.",
      "12 rue de la Hache, 54000 Nancy.",
      "06 39 98 20 15.",
      "Oui, parfait.",
    ],
  },
  {
    id: "devis-pac",
    label: "Demande de devis PAC",
    description: "Une propriétaire veut remplacer sa chaudière fioul par une pompe à chaleur.",
    callerLines: [
      "Bonjour, je voudrais un devis pour remplacer ma vieille chaudière fioul par une pompe à chaleur air/eau.",
      "Hélène Garnier.",
      "5 allée des Tilleuls à Ludres, 54710.",
      "Au 06 39 98 44 71.",
      "Plutôt jeudi après-midi.",
    ],
  },
  {
    id: "entretien",
    label: "Entretien annuel",
    description: "Le Restaurant Le Bellevue appelle pour son entretien annuel.",
    callerLines: [
      "Bonjour, Olivier Schmitt du Restaurant Le Bellevue, c'est pour l'entretien annuel de notre climatisation.",
      "5 place Stanislas, 54000 Nancy.",
      "03 53 01 42 18.",
      "Le matin avant 10 h, avant le service.",
    ],
  },
];
