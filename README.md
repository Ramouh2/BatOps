# BATOPS

Le logiciel des entreprises de **climatisation, chauffage, plomberie et électricité** (1 à 20 techniciens) :
du premier appel au paiement, sans ressaisie.

`Appel → Client → Devis → Signature → Intervention → Planning → Technicien → Photos/Rapport → Facture → Paiement`

Démo livrée avec l'entreprise fictive **ClimAir Pro** (Laxou, 54), données interconnectées et recalées sur la date du jour.

## Démarrer (0 €, aucune clé API)

```bash
npm install
npm run dev
# http://localhost:3000 → « Entrer en démo ClimAir Pro »
```

Aucun service externe n'est nécessaire : les données vivent dans le navigateur (localStorage) et l'IA, Nora,
les e-mails/SMS et le stockage photo sont simulés par des *MockProviders* déterministes.

Profils de démo (sélecteur en haut à droite, ou palette `Ctrl/⌘ K`) :

| Profil | Rôle | Espace |
| --- | --- | --- |
| Marc Ouhadda | Dirigeant | Bureau complet, marges, paramètres |
| Sophie Laurent | Secrétariat | Appels, clients, devis, planning, factures (sans marges) |
| Lucas Morel / Karim Benali | Technicien | App terrain `/tech` uniquement, aucune donnée financière |
| Cabinet Fiduciaire Lorraine | Comptable | Devis et factures en lecture seule |

« Réinitialiser les données de démo » (menu de l'espace, menu profil ou `/settings`) remet la démo à neuf.

Déjà utilisable : tableau de bord du lundi matin (KPI, programme du jour, relance de devis en 1 clic, encaissements),
CRM (prospects, conversion, fiche 360°, parc d'équipements, timeline, notes), catalogue (prix d'achat / vente,
marge recalculée en direct) et **devis** : éditeur avec aperçu A4 en direct, assistant IA (lignes du catalogue expliquées,
oublis détectés, aucun prix inventé), remise, TVA par ligne, marge en temps réel, impression / PDF navigateur, envoi
simulé avec lien vers le **portail client** `/portal/[token]` où le client consulte, signe (au doigt), refuse ou laisse
une remarque. La signature prépare automatiquement l'intervention à planifier.

**Planning & interventions** : la colonne « À planifier » se remplit à la signature d'un devis (ou d'un appel converti) ;
un glisser-déposer affecte le technicien, la date et l'heure (vues Jour, Semaine, Par technicien), la poignée du bas
ajuste la durée, et les chevauchements ou compétences manquantes (fluide frigorigène) s'affichent avant même de
déposer. Chaque action est annulable depuis la notification. La fiche intervention réunit créneau, briefing, checklist,
pièces, rapport, photos, signature et historique ; le technicien voit sa journée et ses prochains jours dans `/tech`
(pastille « Nouveau » quand le bureau lui affecte un chantier), sans aucune donnée financière.

> Démo 0 € : le portail lit les données du navigateur. Ouvrez le lien d'un devis envoyé dans le même navigateur
> (nouvel onglet) : la signature met à jour le bureau en direct. Un vrai client sur un autre appareil nécessitera le
> backend (Supabase), prévu derrière la même architecture.

Les autres modules affichent leur périmètre et leurs données réelles en attendant leur sprint.

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript strict (`tsc --noEmit`) |
| `npm test` | Tests unitaires (Vitest) : seed, store, permissions, providers, parcours CRM / catalogue / devis / planning |
| `npm run build` | Build de production |
| `npm run check` | Les quatre vérifications à la suite |

## Architecture

- **Next.js 15** (App Router) · **TypeScript strict** · **Tailwind CSS 4** · composants **shadcn/ui** (Radix) · **Lucide** · **Motion**
- `src/types/batops.ts` — modèle de données (miroir de `supabase/migrations/*.sql`, migrations additives)
- `src/lib/demo/` — jeu de démo ClimAir Pro (catalogue, équipe, clients, devis, interventions, factures…)
- `src/lib/store/` — store central unique (zustand + immer, persisté) : toutes les vues lisent le même état
- `src/lib/domain/` — règles métier pures : totaux HT/TVA/TTC et marge, statuts dérivés, horaires et conflits de planning, formats FR
- `src/lib/permissions.ts` — matrice des 4 rôles et accès aux routes
- `src/providers/` — interfaces AI / Voice / Notifications / Storage + implémentations Mock gratuites
- `src/app/(dashboard)` espace bureau · `src/app/(field)/tech` app terrain · `src/app/portal/[token]` portail client · `src/app/login` entrée démo

Voir `CLAUDE.md` pour les conventions de développement et l'état des sprints.
