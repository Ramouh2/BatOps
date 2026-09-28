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
| `src/lib/store/store.ts` | `createBatopsStore()` zustand + immer + persist (`batops:data` en localStorage). Session **par onglet** (sessionStorage) + dernier profil. |
| `src/lib/store/index.ts` | Hooks React : `useData`, `useActions`, `useCurrentUser`, `useNavCounters`, `useNow`. |
| `src/lib/store/mutations.ts` | Primitives partagées pour les actions métier : `takeReference` (numérotation continue), `logActivity` (timeline client). |
| `src/lib/store/actions/*` | Mutations métier pures `(draft, input, ctx)` : `crm.ts` (clients, conversion, notes, équipements), `catalog.ts` (articles, prix, archivage), `quotes.ts` (brouillon, envoi + lien portail, relance, consultation, remarque, signature → intervention préparée, refus, retour en brouillon). Exposées dans `actions` du store avec validation préalable (`MutationResult`). |
| `src/lib/store/selectors.ts` | Sélecteurs purs (compteurs, interventions du jour, totaux). |
| `src/lib/store/dashboard.ts` / `crm-selectors.ts` / `quote-selectors.ts` | KPI, courbe d'encaissements, actions urgentes, fil d'activité / lignes CRM, onglets, vue 360° / liste et KPI devis, détail, portail (jamais de brouillon côté client). |
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
| `src/app/(dashboard)/*` | Espace bureau (`/quotes`, `/quotes/new?client=`, `/quotes/[id]`). `src/app/(field)/tech` app terrain. `src/app/login` entrée démo. `src/app/portal/[token]` portail client (hors coquille, sans compte). |

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

## Motion design (système, pas décoration)

- Grammaire unique dans `src/lib/motion.ts` : `EASE_OUT`, `DURATION` (≤ 400 ms hors graphiques), `SPRING`
  (`snappy` pastilles/onglets, `layout` listes, `pop` confirmations), variantes `fadeUp`, `listItem`, `insertedItem`.
- Primitives : `Reveal` / `Stagger` / `StaggerItem` (apparitions), `AnimatedNumber` (compteurs, glisse aux mises à jour),
  `Swap` (statut / compteur qui change), `ProgressBar`, `SuccessCheck`, `useFeedback()` (`flash` succès, `shake` erreur),
  `SegmentedTabs` / `SegmentedChoice` (pastille glissante `layoutId`), `EmptyState`, transitions de page via `template.tsx`.
- Listes : `AnimatePresence mode="popLayout"` + `layout` sur les `li` (création, filtre, suppression animés).
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
- [ ] Sprint 3 — Interventions + planning/dispatch.
- [ ] Sprint 4 — App `/tech` + photos + rapport PDF.
- [ ] Sprint 5 — Factures, acomptes, avoirs, paiements, contrats SAV, paramètres éditables.
- [ ] Sprint 6 — Nora V0 (simulateur vocal, conversion d'appels).

P1 / P2 : ne rien construire avant que le P0 soit réellement fonctionnel.

## Fin de session

Terminer chaque réponse par la section **« RAMOS — CURRENT PRODUCT STATE »** (🟢 / 🟡 / 🔴 / ⚪ par grande
fonctionnalité, puis MODIFICATIONS, FICHIERS, VALIDATIONS, PROBLÈMES RESTANTS, NEXT STEP). Ne jamais déclarer
une fonctionnalité terminée si elle ne fonctionne pas réellement.
