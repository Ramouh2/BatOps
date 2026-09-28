/** Checklists types des interventions (seed de démo + interventions préparées à la signature d'un devis). */
export const CHECKLISTS = {
  installClim: ["Tirage au vide (< 500 microns)", "Test d'étanchéité à l'azote", "Contrôle des pressions et intensités", "Explications d'utilisation au client"],
  installPac: ["Désembouage et rinçage du réseau", "Remplissage et purge du circuit", "Paramétrage de la loi d'eau", "Contrôle de l'appoint électrique", "Explications d'utilisation au client"],
  installCet: ["Raccordement du groupe de sécurité", "Remplissage et purge", "Mise en service et paramétrage", "Explications d'utilisation au client"],
  installChaudiere: ["Contrôle d'étanchéité gaz", "Analyse de combustion", "Réglage des températures", "Explications d'utilisation au client"],
  installVmc: ["Pose et fixation du caisson", "Raccordement électrique et protection", "Mesure des débits et dépressions", "Explications d'utilisation au client"],
  installRideau: ["Fixation et mise à niveau", "Raccordement électrique et protection", "Réglage des vitesses et de la température", "Explications d'utilisation au client"],
  depannageClim: ["Contrôle de l'évacuation des condensats", "Contrôle des filtres et de l'échangeur", "Mesure de la température de soufflage", "Test de fonctionnement froid / chaud"],
  depannageEcs: ["Diagnostic de la production d'eau chaude", "Contrôle brûleur et échangeur", "Remise en service", "Information du gardien"],
  plomberie: ["Isolement du réseau", "Remplacement des pièces défectueuses", "Remise en eau et purge", "Contrôle d'étanchéité"],
  maintenanceVmc: ["Nettoyage des bouches d'extraction (échantillon)", "Contrôle courroie et roulements du caisson", "Mesure des débits et dépressions", "Contrôle des pressostats", "Compte-rendu au syndic"],
  maintenance: ["Nettoyage des filtres et échangeurs", "Contrôle des pressions et de l'étanchéité", "Contrôle électrique et des sécurités", "Compte-rendu au client"],
  generic: ["Vérification du chantier et des accès", "Réalisation des travaux du devis", "Contrôle de fonctionnement", "Explications au client"],
} as const satisfies Record<string, readonly string[]>;
