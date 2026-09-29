# CLAUDE.md — BATOPS

SaaS B2B pour entreprises CVC / plomberie / électricité (1–20 techniciens). La **source de vérité produit** est le
document de cadrage BATOPS fourni par le fondateur (P0/P1/P2, Core Loop, 17 modules, seed ClimAir Pro).
En cas d'ambiguïté : cadrage > simplicité > fonctionnement réel. Ne jamais ajouter de feature hors cadrage.

## Commandes

```bash
npm run dev          # http://localhost:3000
npm run lint         # ESLint (flat config Next)
npm run typecheck    # tsc --noEmit (strict)
npm test             # Vitest (src/**/*.test.ts)
npm run build        # next build
npm run check        # les 4 à la suite — obligatoire avant de clore un sprint
```

## Contraintes absolues

- **0 € au départ** : aucune API payante, aucun service externe requis. Tout passe par `src/providers/*`
  (Mock par défaut). Un provider Live s'ajoutera derrière la même interface, sans toucher l'UI.
- **Store central unique** (`src/lib/store`) : aucune page ne doit afficher de données statiques. Toute lecture
  passe par `useData(...)`, toute mutation par une action du store.
- **Prix** : uniquement issus du catalogue (`data.catalog`). L'IA ne doit jamais inventer un prix ni un fait.
- **Technicien** (`/tech`) : aucune donnée financière (ni prix, ni marge, ni CA).
- UI **en français** métier, montants `1 450,00 €` (`formatEUR`), chiffres en `tabular`.
- Pas de migration destructive, pas de suppression de fichier sans justification.

## Architecture

| Chemin | Rôle |
| --- | --- |
| `src/types/batops.ts` | Modèle de données (snake_case = colonnes SQL). Miroir de `supabase/migrations/*.sql` (001 schéma, 002 catalogue, 003 devis/portail) — garder les deux synchronisés, migrations additives uniquement. |
| `src/lib/demo/seed.ts` | `createDemoData(now)` : jeu ClimAir Pro **déterministe et relatif à `now`** (ids lisibles, références ancrées : Bernard = `DEV-2026-0041`, Mercier = `FAC-2026-0084`). |
| `src/lib/demo/catalog.ts` | Pricebook (prix achat/vente HT, TVA, gabarits d'équipement). |
| `src/lib/store/store.ts` | `createBatopsStore()` zustand + immer + persist (`batops:data` en localStorage). Session **par onglet** (sessionStorage) + dernier profil. Option `clock` (horloge injectable pour les tests). |
| `src/lib/store/index.ts` | Hooks React : `useData`, `useActions`, `useCurrentUser`, `useNavCounters`, `useNow`. |
| `src/lib/store/mutations.ts` | Primitives partagées pour les actions métier : `takeReference` (numérotation continue), `logActivity` (timeline client). |
| `src/lib/store/actions/*` | Mutations métier pures `(draft, input, ctx)` : `crm.ts` (clients, conversion, notes, équipements), `catalog.ts` (articles, prix, archivage), `quotes.ts` (brouillon, envoi + lien portail, relance, consultation, remarque, signature → intervention préparée, refus, retour en brouillon), `interventions.ts` (planifier / déplacer / réaffecter / redimensionner via `scheduleIntervention`, retirer du planning, créer, modifier, annuler avec motif). Exposées dans `actions` du store avec validation préalable (`MutationResult`). |
| `src/lib/store/selectors.ts` | Sélecteurs purs (compteurs, interventions du jour, totaux). |
| `src/lib/store/dashboard.ts` / `crm-selectors.ts` / `quote-selectors.ts` | KPI, courbe d'encaissements, actions urgentes (dont « À planifier »), fil d'activité / lignes CRM, onglets, vue 360° / liste et KPI devis, détail, portail (jamais de brouillon côté client). |
| `src/lib/store/planning-selectors.ts` | `PlanningItem` (client, technicien, créneau, compétence frigoriste, conflits permanents, origine devis/appel/contrat), colonne « À planifier », `itemsOnDay` + `layoutLanes`, KPI planning, liste / onglets / filtres interventions, fiche (`selectInterventionDetail`), app terrain (`selectUpcomingForTechnician`, `selectScheduleNews`). |
| `src/lib/domain/planning.ts` | Horaires ouvrés (8 h – 18 h, lun.–ven.), `computeEnd` (chantier étalé sur jours ouvrés), `segmentOnDay`, compétence fluide frigorigène, `detectConflicts` (chevauchement = erreur ; compétence, passé, week-end, hors horaires, technicien inactif = avertissement), créneaux libres, charge du jour, technicien conseillé. |
| `src/lib/domain/validation.ts` | Validation + normalisation des saisies (téléphone FR, code postal, prix `1 450,50`, devis : lignes du catalogue uniquement), partagée formulaires / store. |
| `src/lib/domain/quotes.ts` / `vat.ts` / `portal.ts` / `checklists.ts` | Totaux avec remise %/€, acompte, conditions par défaut, sections, plan d'intervention à la signature / TVA recommandée (partagée IA + éditeur) / liens `/portal/[token]?devis=` / checklists types. |
| `src/lib/motion.ts` + `src/components/motion/*` | Système de mouvement (voir ci-dessous). |
| `src/lib/domain/*` | Règles pures : `computeTotals` (TVA par taux, remise, marge), statuts dérivés (`en_retard`, `expire`, `a_planifier`), formats FR, dates locales. |
| `src/lib/permissions.ts` | 4 rôles (`owner`, `dispatcher`, `technician`, `accountant`), capacités, accès routes, `ROLE_HOME`. |
| `src/lib/navigation.ts` / `src/lib/modules.ts` | Sidebar (sections, compteurs) / périmètre P0 et sprint de chaque module. |
| `src/providers/` | `ai/` (devis IA, oublis, rapport, extraction d'appel), `voice/` (Nora V0 + 3 scénarios), `notifications/`, `storage/`, `index.ts` (factory + statut). |
| `src/components/ui/` | Composants shadcn/ui écrits à la main (le registre shadcn n'est pas joignable depuis l'environnement de dev). |
| `src/components/layout/` | Shells bureau / terrain, sidebar, topbar, sélecteur de rôle, palette ⌘K (modules + clients), reset démo, garde d'accès. |
| `src/components/{dashboard,crm,catalog}/` | Blocs métier du Sprint 1 (KPI, graphique, actions urgentes ; formulaires en tiroir, timeline, parc ; prix éditables, marge). |
| `src/components/quotes/` | Espace devis : `quote-workspace` (en-tête + frise de statut, bascule éditeur ↔ document), `use-quote-editor` (copie de travail, rien n'est écrit avant « Enregistrer »), `quote-ai-assistant`, `quote-lines`, `catalog-picker`, `quote-summary` (totaux, marge), `quote-document` (A4 / compact), `a4-paper` (mise à l'échelle + `PrintRoot`), `send-quote-sheet`, `signature-pad`. |
| `src/components/portal/` + `src/app/portal/[token]` | Portail client public : consultation, signature (tracé ou générée depuis le nom), refus motivé, remarques. |
| `src/components/planning/` + `src/app/(dashboard)/planning` | Planning dispatch (`@dnd-kit/core`, 0 €) : `time-grid` (colonnes jour/technicien, aperçu de dépôt, redimensionnement), `tech-matrix` (techniciens × jours, charge), `unplanned-column`, `planning-cards` (événement, carte, aperçu soulevé), `planning-mobile` (agenda glissable, onglet À planifier, FAB). Paramètres d'URL : `vue`, `date`, `planifier=<id>` (ouvre le tiroir). |
| `src/components/interventions/` + `src/app/(dashboard)/interventions` | `plan-sheet` (technicien, jour, créneau libre, durée, conflits en direct), `intervention-form-sheet` (création / modification), `use-planning-actions` (toasts + « Annuler » qui restaure l'état), `intervention-detail` (fiche complète) + `intervention-status-track`. Liste `/interventions` (onglets, filtres, `?nouvelle=1`), fiche `/interventions/[id]`. |
| `src/app/(dashboard)/*` | Espace bureau (`/quotes`, `/quotes/new?client=`, `/quotes/[id]`, `/planning`, `/interventions`, `/interventions/[id]`). `src/app/(field)/tech` app terrain (journée, à venir 7 jours, pastilles « Nouveau » / « Horaire modifié »). `src/app/login` entrée démo. `src/app/portal/[token]` portail client (hors coquille, sans compte). |

## Conventions de code

- Dates : `ISODateTime` (instant UTC) et `ISODate` (`YYYY-MM-DD` **local**) → utiliser `toDate`, `toISODate`, `diffInCalendarDays`.
- Statuts « temporels » **dérivés, jamais stockés** : facture `en_retard`/`partiellement_payee`, devis `expire`,
  contrat `a_planifier`/`visite_planifiee` (voir `lib/domain/status.ts`). Toujours passer `now` (`useNow()`).
- Sélecteurs zustand : retourner des **références stables** (`d => d.quotes`), dériver avec `useMemo`
  (un sélecteur qui crée un tableau à chaque appel provoque une boucle de rendu).
- `useData` uniquement sous `<BatopsProvider>` (garanti pour toutes les pages). Rien n'est rendu côté serveur
  avant hydratation : pas de risque d'écart SSR.
- **Changement du modèle ou de la forme du seed** → incrémenter `DEMO_SCHEMA_VERSION` (`src/lib/demo/seed.ts`) :
  les navigateurs régénèrent alors la démo automatiquement.
- Actions métier futures (signer un devis, clôturer une intervention…) : fonction pure `(draft, payload, now)`
  testée en Vitest, qui met à jour **toutes** les entités liées + `logActivity` + `takeReference`, puis exposée
  dans `actions` du store.
- Pages : `page.tsx` serveur (metadata) qui rend un composant client connecté au store.
- Mobile terrain : boutons `size="field"` (56 px), cartes empilées, pas de tableau horizontal.
- Retour d'une mutation : jamais de proxy immer hors du `set` (les actions renvoient des ids / valeurs primitives).
  Après une mutation dans un gestionnaire d'événement, lire l'état frais via `batopsStore.getState()`.
- Devis : une ligne vient **toujours** d'un article du catalogue (`lineFromCatalogItem`, validation « aucun prix ne peut
  être inventé ») ; seul le dirigeant peut ajuster un prix de ligne (badge « Prix ajusté », retour au prix catalogue).
  L'IA passe par `getAIProvider()` (Mock par défaut) et ne fait que choisir articles et quantités.
- Actions du portail (consultation, remarque, signature, refus) : l'auteur affiché est le **client**, jamais le profil
  de démo de l'onglet. Les brouillons ne sont jamais exposés sur le portail.
- Impression / PDF : `PrintRoot` monte une copie du document sous `<body>` ; la CSS `@media print` n'imprime qu'elle.
- Planning : toute planification passe par `actions.scheduleIntervention` (jamais d'écriture directe des horaires) ; un
  conflit de chevauchement **n'empêche pas** l'enregistrement (le dispatcher décide) mais reste signalé partout
  (planning, fiche, KPI). Les conflits « passé / week-end / hors horaires » ne sont calculés qu'au moment de proposer un créneau.
  Chaque action du planning offre « Annuler » (restauration de l'instantané). Sprint 3 n'ajoute aucune colonne SQL
  (`assigned_technician_id`, `scheduled_start/end`, `duration_minutes` existent depuis 001, index compris).
- Drag & drop : identifiants `int:<id>` (glissé) et `col:<jour>:<tech?>` / `cell:<jour>:<tech>` / `unplanned` (cibles) ;
  collision `pointerWithin` ; l'heure suit le haut de la carte saisie (décalage du pointeur mesuré au début du glisser).
  Clavier : Espace saisit / dépose, Entrée ouvre la carte.

## Motion design (système, pas décoration)

- Grammaire unique dans `src/lib/motion.ts` : `EASE_OUT`, `DURATION` (≤ 400 ms hors graphiques), `SPRING`
  (`snappy` pastilles/onglets, `layout` listes, `pop` confirmations), variantes `fadeUp`, `listItem`, `insertedItem`.
- Primitives : `Reveal` / `Stagger` / `StaggerItem` (apparitions), `AnimatedNumber` (compteurs, glisse aux mises à jour),
  `Swap` (statut / compteur qui change), `ProgressBar`, `SuccessCheck`, `useFeedback()` (`flash` succès, `shake` erreur),
  `SegmentedTabs` / `SegmentedChoice` (pastille glissante `layoutId`), `EmptyState`, transitions de page via `template.tsx`.
- Listes : `AnimatePresence mode="popLayout"` + `layout` sur les `li` (création, filtre, suppression animés).
- Planning : carte soulevée qui suit le pointeur (`DragPreview`), colonnes / cellules qui s'illuminent au survol, aperçu de
  dépôt à ressort coloré selon la gravité (ok / avertissement / conflit), redimensionnement en direct, pulsation des
  créneaux en conflit + secousse du compteur, flash des cartes fraîchement déplacées, transitions directionnelles
  Jour / Semaine / Technicien et période, glisser gauche / droite sur mobile. Fiche : `InterventionStatusTrack`.
- Devis : `QuoteStatusTrack` (frise Brouillon → Envoyé → Signé), étapes d'analyse IA + résultats en cascade,
  `QuoteDocument reveal` (feuille A4 qui monte, blocs en cascade), `QuoteMargin` (jauge + halo au changement de palier),
  sceau de signature, toast d'enregistrement `showQuoteSavedToast`. Seuls temps minimaux voulus : analyse IA ≈ 1,2 s, scellement de la signature 0,35 s.
- Uniquement `transform` / `opacity` (et `pathLength` pour les graphiques). `MotionConfig reducedMotion="user"` + règle CSS
  `prefers-reduced-motion` : aucune animation ne doit porter d'information indispensable.
- Tests navigateur : attendre la fin des animations (valeurs de `AnimatedNumber`, sorties d'`AnimatePresence`).

## État des sprints

- [x] **Sprint 0** — fondations : types, seed ClimAir Pro, store, providers, shells, rôles, design system, reset.
- [x] **Sprint 1** — Dashboard, CRM (clients/prospects/équipements/timeline), catalogue & marges, relance devis, motion design.
- [x] **Sprint 2** — Devis (éditeur, IA, marge, aperçu A4, impression), envoi + relance avec lien portail, portail `/portal/[token]` (signature, refus, remarques), intervention préparée à la signature.
- [x] **Sprint 3** — Interventions (liste, fiche, création, modification, annulation) + planning/dispatch (Jour / Semaine / Technicien, glisser-déposer, durée, conflits, À planifier alimenté par les devis signés) + synchro dashboard, CRM, palette, `/tech`.
- [ ] Sprint 4 — App `/tech` + photos + rapport PDF.
- [ ] Sprint 5 — Factures, acomptes, avoirs, paiements, contrats SAV, paramètres éditables.
- [ ] Sprint 6 — Nora V0 (simulateur vocal, conversion d'appels).

P1 / P2 : ne rien construire avant que le P0 soit réellement fonctionnel.

## Fin de session

Terminer chaque réponse par la section **« RAMOS — CURRENT PRODUCT STATE »** (🟢 / 🟡 / 🔴 / ⚪ par grande
fonctionnalité, puis MODIFICATIONS, FICHIERS, VALIDATIONS, PROBLÈMES RESTANTS, NEXT STEP). Ne jamais déclarer
une fonctionnalité terminée si elle ne fonctionne pas réellement.
