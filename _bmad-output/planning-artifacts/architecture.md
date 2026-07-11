---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9]
inputDocuments:
  - "BlueMargin_PRD_CRM_Lite_V1.1.md"
  - "BlueMargin_PRD_MVP.md"
  - "../dicta magic/contexte.md"
  - "../dicta magic/architecture_unifiee.md"
workflowType: 'architecture'
project_name: 'BlueMargin'
user_name: 'Dimitri'
date: '2026-07-11T15:35:00+02:00'
lastStep: 9
status: 'complete'
completedAt: '2026-07-11T15:40:00+02:00'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
- Rapprochement sémantique des articles de commandes WhatsApp avec la table `products` en s'appuyant sur la table `catalog_synonyms`.
- Calcul automatique du volume réel en kg à partir du calibre et du nombre de pièces (ex : Sole 2 = 450g unitaire).
- Calcul du chiffre d'affaires estimé basé sur la priorité tarifaire : Prix Spécifique Client (`product_sales_prices`) ➔ Règle de Marge client (`margin_rules`) ➔ Prix de base catalogue.
- Affichage analytique du CA cumulé et répartition par catégories de produits dans le CRM.

**Non-Functional Requirements:**
- Temps de réponse de la fiche client < 300ms (traitement et persistance des volumes et prix directement lors de l'insertion de la commande).
- Rétrocompatibilité et mise à jour de l'historique des anciennes commandes.

### Technical Constraints & Dependencies
- Utilisation de la table `products` (catalogue de 812 articles).
- Dépendance vers les tables de prix `product_sales_prices` et `margin_rules`.
- Gestion des approximations textuelles WhatsApp via IA + table de synonymes.

## Collaborative Design Decisions (Party Mode)

### 1. Hybride : Déterministe + IA
Pour éliminer les coûts de traitement récurrents de l'IA et garantir une exécution à 100% automatisée et sans friction :
- **Règles déterministes (Regex/Dictionnaire local)** : Le code intercepte directement les motifs ultra-classiques (ex: `sole [1-7]`) pour leur associer directement le calibre de marée et le poids correspondant, sans solliciter l'IA.
- **Rapprochement IA autonome** : En cas de produit inconnu, l'IA (modèle économique `gpt-4o-mini` ou `gemini-3.1-flash`) propose une correspondance avec un **score de confiance**.
  - **Confiance >= 80** : L'association est apprise et écrite automatiquement dans la table `catalog_synonyms` sans action humaine.
  - **Confiance < 80** : Le système applique un fallback sur un produit de secours par défaut (ex: `"Sole calibre inconnu"`) pour maintenir la cohérence des chiffres d'affaires et volumes globaux sans bloquer le processus.

### 2. Human-in-the-loop (CRM)
- Une interface d'édition optionnelle est disponible dans le CRM pour corriger les synonymes si besoin (ex: ré-associer manuellement un article mal catégorisé). La validation met à jour rétroactivement les commandes historiques associées à ce synonyme.

## Starter Template & Existing Technical Foundations

### Primary Technology Domain
- **Front-end / CRM** : Application Web Next.js (App Router) en TypeScript.
- **Back-end / Webhook** : API REST Node.js (Express) en TypeScript.
- **Base de Données** : Supabase (PostgreSQL relationnel) avec Row Level Security (RLS) active.

### Technical Stack & Decided Frameworks

**Language & Runtime:**
- TypeScript pour l'intégralité du codebase (Next.js et Node.js).
- Node.js v24+ en exécution.

**Styling & UI (CRM):**
- Tailwind CSS pour l'architecture des styles.
- Composants UI basés sur Radix UI / Shadcn UI.

**Database & ORM:**
- Supabase Client pour les requêtes asynchrones en temps réel.
- Base de données PostgreSQL centralisée.

**Integrations & AI:**
- OpenAI API / OpenRouter (modèles `gemini-3.1-flash`, `gpt-4o-mini`).
- Webhook d'intégration WhatsApp via Evolution API.

## Core Architectural Decisions

### Data Architecture & Pricing Persistence

**Decision: Hybrid Calculation (Dynamic Volumes & Frozen Prices)**
* **Volume (kg)** : Calculé dynamiquement dans le CRM par expressions régulières sur le nom de l'article (ex: Sole 2 = 450g). Les calibres de marée restent flexibles et modifiables dans le dictionnaire du code Next.js du CRM.
* **Prix de vente (Figer à l'instant T)** : Calculé par le webhook WhatsApp lors de la création de la commande (priorité : prix spécifique client `product_sales_prices` ➔ marge client `margin_rules` ➔ prix catalogue de base `products`) et enregistré définitivement dans la colonne `order_items.price_applied`.
* **Rationale** : Assure que le chiffre d'affaires historique du client reste stable et fidèle aux factures réelles de l'instant T (inchangé lors des fluctuations de grilles tarifaires futures), tout en gardant une base de données performante et sans calculs à la volée du prix historique.

## Implementation Patterns & Consistency Rules

### Naming & Database Patterns
- **Database Fields** : Tout nouveau champ SQL doit utiliser le format `snake_case` (ex : `price_applied`).
- **Foreign Keys** : Les relations vers des entités existantes doivent utiliser le nom de l'entité suivi de `_id` (ex : `product_id`).
- **Types Financiers** : Tous les montants en euros (prix, CA) et volumes (kg) doivent être typés en `NUMERIC` (ou `decimal`) dans PostgreSQL et manipulés sous forme de `number` ou `Big` en JavaScript, pour éliminer les erreurs d'arrondis des nombres à virgule flottante (`float`).

### Code Organization & Placement
- **Dictionnaire de Calibres (CRM)** :
  - Création d'un module utilitaire unique : `src/utils/caliberHelper.ts`.
  - Ce module contient la fonction pure `extractWeightFromArticleName(productName: string): number` qui applique le parsing par expressions régulières (Regex) et le dictionnaire statique pour les soles/homards.
  - Tout composant de statistiques ou d'analyses doit obligatoirement importer cet utilitaire pour calculer le poids. Il est formellement interdit de réécrire la Regex localement dans un composant.
- **Service de Prix (Backend WhatsApp)** :
  - Création de `backend/src/services/pricingService.ts` pour encapsuler la cascade de récupération de prix client.
  - La logique du webhook WhatsApp appelle ce service de manière unique avant l'insertion dans `order_items`.

### Rules for Non-Regression & Development Quality (Lessons Learned)
- **Strict DB Schema Verification** : Tout agent ou développeur doit impérativement vérifier le schéma physique réel de la table Supabase concernée (via une requête SQL ou la lecture des types générés) avant d'écrire ou de modifier une requête d'insertion (`insert`) ou de mise à jour (`update`). Il est interdit d'assumer l'existence d'une colonne (ex: `created_by`).
- **Robust Identity Matching** : Lors d'une corrélation sémantique de noms ou d'identités (matching de clients ou de produits), les algorithmes doivent systématiquement être tolérants aux variations : passage en minuscules (`.toLowerCase()`), suppression des espaces inutiles (`.trim()`) et comparaison de toutes les propriétés d'identité existantes (à la fois `name`, `legal_name` et `trade_name`).
- **Input Data Atomicity** : Toute donnée textuelle multi-articles provenant de WhatsApp doit obligatoirement transiter par un utilitaire de découpage (split par virgules `,` et retours à la ligne `\n`) avant insertion dans la table `order_items`. Aucun article composite ne doit être inséré brut.

### Anti-Patterns à Éviter
- **Duplication de logique** : Ne pas parser les calibres à la volée dans les composants UI sans passer par `caliberHelper.ts`.
- **Calcul de CA à la volée historique** : Ne jamais recalculer dynamiquement le CA des commandes passées avec les tarifs actuels des tables `product_sales_prices` ou `products`. Utiliser uniquement `order_items.price_applied` enregistré à la création.

## Project Structure & Boundaries

### Complete Project Directory Structure

Notre logique s'organise sur les deux projets unifiés :

```text
C:/Users/Dimitri/
├── bluemargin/                         # application CRM (Next.js)
│   └── src/
│       ├── app/
│       │   └── (app)/[orgSlug]/customers/[id]/
│       │       ├── page.tsx            # Chargement des données commandes
│       │       └── CustomerDetailsClient.tsx # Onglet Analyses & Recommandations
│       └── utils/
│           └── caliberHelper.ts        # [NOUVEAU] Calcul des calibres & Regex Poids
│
└── dicta magic/                        # application Backend WhatsApp (Node.js)
    └── backend/src/
        ├── controllers/
        │   └── evolutionController.ts  # Webhook de réception des commandes temps réel
        └── services/
            ├── yesterdayImporter.ts    # Importateur d'historique de commandes
            └── pricingService.ts       # [NOUVEAU] Calcul de la cascade de prix client
```

### Architectural & Component Boundaries

**API & Data Boundaries:**
* **Supabase (`order_items`)** : Contient le champ `price_applied` persisté en base de données. L'écriture se fait exclusivement depuis le backend WhatsApp (`dicta magic`). Le CRM (`bluemargin`) n'y accède qu'en lecture seule pour l'affichage statistique.
* **Pricing Boundary (`pricingService.ts`)** : Encapsule la recherche de prix à l'instant T dans les tables `product_sales_prices` et `margin_rules`.

**Component Boundaries:**
* **Caliber Boundary (`caliberHelper.ts`)** : Contient le dictionnaire unitaire de poids par calibre (Sole 1-7, Homard, Huîtres). Il isole la logique de parsing Regex afin de simplifier sa maintenance ou son évolution future.

## Architecture Validation Results

### Coherence & Compatibility Validation ✅
- **Compatibilité des décisions** : Les choix techniques de traitement hybride (Calcul dynamique du poids à l'affichage dans le CRM + Persistance du prix unitaire à l'instant T par le webhook WhatsApp) éliminent tout risque d'incohérence comptable ou de dégradation des performances.
- **Alignement structurel** : Les nouveaux composants s'insèrent proprement dans la structure existante (Next.js côté CRM et Express côté backend).

### Requirements Coverage Validation ✅
- **Volume et Calibre** : Totalement couverts par le module utilitaire `caliberHelper.ts` (Regex Sole 1-7, Homard, Huîtres).
- **Intégrité Historique du CA** : Totalement couverte par le stockage de `order_items.price_applied` à l'instant T.
- **Performance (NFR)** : Totalement couverte (zéro calcul de prix à l'affichage, rendu Next.js instantané).

### Gap Analysis & Action Plan
- Aucun bloqueur détecté.
- **Action Future (MVP+)** : Mettre en place un outil de visualisation et de gestion des alias (`catalog_synonyms`) directement dans les paramètres d'administration du CRM pour faciliter d'éventuels ajustements.

## 9. Portail Client B2B & Gestion Dynamique des Stocks avec Cut-off de Commande

### A. Spécifications du Modèle de Données (PostgreSQL)
Afin de gérer la disponibilité différenciée des articles, la table `products` de Supabase est enrichie de deux colonnes booléennes :
* `is_available` (booléen, défaut `true`) : Représente la disponibilité générale du produit au catalogue (avant l'heure limite).
* `in_stock_ghlin` (booléen, défaut `false`) : Désigne la présence physique réelle de l'article dans la poissonnerie de Ghlin pour les commandes de dernière minute.

### B. Algorithme du Cut-off de Commande Dynamique
Le catalogue de produits renvoyé par l'API au client (portail web ou assistant WhatsApp) applique un filtrage temporel basé sur le fuseau horaire de Bruxelles (`Europe/Brussels`) :
1. **Entrée** : Date de livraison souhaitée ($D_{livraison}$) et heure système de la requête ($T_{requete}$).
2. **Jours Interdits** : Si le jour de la semaine de $D_{livraison}$ est un **Lundi** ou un **Dimanche**, la commande est formellement bloquée.
3. **Évaluation de l'Heure Limite (Cut-off à 14h30)** :
   * Si $D_{livraison} = D_{demain}$ (livraison demandée pour le lendemain) ET $T_{requete} \ge 14h30$ :
     * Le catalogue filtre et n'affiche que les produits répondant à la condition : `in_stock_ghlin = true`. Les autres produits sont marqués *"Indisponible (Limite de 14h30 dépassée)"*.
   * Dans tous les autres cas (ex: livraison demandée pour après-demain ou plus tard, ou commande passée avant 14h30) :
     * Le catalogue affiche l'ensemble des produits répondant à la condition : `is_available = true`.

### C. Administration CRM (BlueMargin)
L'équipe de Ghlin dispose d'un écran dédié au sein du CRM :
* Une vue simplifiée listant les produits actifs du catalogue, munis d'interrupteurs (toggle switches) permettant de modifier instantanément l'état de `in_stock_ghlin`.
* Une tâche planifiée (cron job) s'exécute automatiquement chaque matin à 08h00 pour réinitialiser la colonne `in_stock_ghlin` à sa valeur par défaut (`false`) afin d'éviter tout oubli d'une veille sur l'autre.

---

### Architecture Completeness Checklist

- [x] Analyse du contexte du projet effectuée
- [x] Décisions architecturales figées avec cascade de tarification
- [x] Rapprochement sémantique et autonomie de l'IA spécifiés
- [x] Structure de dossiers et fichiers cible cartographiée
- [x] Règles de non-régression (lessons learned) rédigées

### Architecture Readiness Assessment

- **Overall Status** : READY FOR IMPLEMENTATION (Prêt pour implémentation)
- **Confidence Level** : HIGH (Élevé)
