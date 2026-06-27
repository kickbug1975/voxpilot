# BlueMargin MVP Progress Tracker

## Phase 0 - Initialisation
- [x] Next.js App Router project in TypeScript strict
- [x] Tailwind CSS configuration with custom brand palette
- [x] shadcn/ui integration (`components.json`, utilities, button component)
- [x] Vitest, PG, Testing Library setup for tests
- [x] Supabase Auth SSR helper configuration (`src/lib/supabase/`)
- [x] Environment variable verification service using Zod (`src/lib/env.ts`)
- [x] Template `.env.example`
- [x] README file for 20-minute local launch

## Phase 1 - Base et Sécurité
- [x] Postgres migrations for all tables under `supabase/migrations/`
- [x] Active pgcrypto, citext, and pg_trgm extensions
- [x] `updated_at` trigger helper and triggers on all tables
- [x] Permissions functions: `is_org_member`, `has_org_role`, `can_view_costs`, `current_user_role`
- [x] Row Level Security (RLS) policies on all tenant tables
- [x] Minimal database seed (`supabase/seed.sql`)
- [x] Tenant isolation test suite (`tests/rls-isolation.test.ts`)
- [x] Multi-tenant isolation verification proof

## Phase 2 - Catalogue
- [x] CRUD Supplier
- [x] CRUD Customer
- [x] CRUD Categories and Products
- [x] Supplier-Product references matching

## Phase 3 - Pricing Engine
- [x] Decimal calculation library integration
- [x] Deterministic pricing engine functions (`PricingEngine`)
- [x] 20+ unit tests for calculating costs and margin rates
- [x] Margin rules hierarchy resolver
- [x] Margins list page / dashboard table

## Phase 4 - Imports
- [x] CSV / XLSX parser
- [x] Column mapping configurator
- [x] Row status validator (errors, warnings, valid)
- [x] Auto-matching engine
- [x] Matching review interface
- [x] Import confirmation transaction

## Phase 5 - Offres (Quotes)
- [x] Quote management CRUD
- [x] Snapshot product and costs upon quote addition
- [x] Floor price / target margin control rules
- [x] PDF Generation (excluding internal cost/margin info)
- [x] Excel/CSV Export
- [x] Quote revisioning system (R1, R2, etc.)

## Phase 6 - Partage et Envoi
- [x] Public quote link using hash token
- [x] Public view page (Accept / Reject options)
- [x] Local email outbox log simulation
- [x] Vercel/Resend email service optional integration

## Phase 7 - Finition
- [x] Dashboard KPI stats
- [x] Audit logs viewer
- [x] Accessibility review
- [x] Empty states and error handlers

## CRM Lite V1.1 - Extension CRM Lite

### Phase 0 - Audit et Baseline
- [x] Baseline complète du dépôt (lint, typecheck, tests, build)
- [x] Cartographie du dépôt existant
- [x] Identification des écarts avec les PRD MVP 1.0 et CRM Lite V1.1
- [x] Plan exact des migrations et des modifications
- [x] Analyse et documentation des risques de régression

### Phase 1 - Schéma et Sécurité
- [x] Migrations SQL pour `organizations`, `customers`, `customer_locations`, `contacts`, `activities`, `tasks`, `tags`, `customer_tags`, `crm_events` et `quotes`
- [x] Politiques RLS (Row Level Security) sur toutes les nouvelles tables
- [x] Fonctions PostgreSQL de validation de tenant et visibilité
- [x] Tests automatisés de migration et d'isolation multi-tenant (RLS)

### Phase 2 - Structuration Client (Etablissements & Contacts)
- [x] Formulaire de création de prospect (`/customers/new`)
- [x] CRUD Établissements (`customer_locations`) avec gestion de l'établissement principal
- [x] CRUD Contacts (`contacts`) avec gestion du contact principal et `do_not_contact`
- [x] Migration de compatibilité des adresses existantes

### Phase 3 - Activités Commerciales et Timeline
- [x] `ActivityService` pour journaliser les interactions
- [x] Interface de journalisation rapide (Quick Log) compatible mobile
- [x] Consolidation et pagination SQL de la timeline client (`get_customer_timeline`)
- [x] Composant Timeline UI interactif et sécurisé

### Phase 4 - Tâches et Agenda Commercial
- [x] `TaskService` pour le cycle de vie des actions (créer, compléter, reporter, réattribuer)
- [x] Recalcul des caches `last_activity_at` et `next_activity_at`
- [x] Interface "Mon Agenda" triée par priorité et retard
- [x] Composants de liste et actions rapides sur les tâches

### Phase 5 - Intégration Offres et Automatisations
- [x] Liaison offre-contact et offre-établissement dans le créateur d'offres
- [x] Génération de tâche automatique `quote_follow_up` lors de l'envoi d'offre
- [x] Clôture automatique des tâches de relance lors de l'acceptation/refus d'offre
- [x] Script quotidien `crm-daily` (inactivité client, détection retard)

### Phase 6 - Vue 360, Dashboard et Recherche Globale
- [x] Fiche client à 360 degrés (KPIs financiers sécurisés, onglets)
- [x] Tableau de bord CRM (tâches urgentes, offres à suivre, KPIs globaux)
- [x] Vues prédéfinies clients/prospects et filtres d'URL
- [x] Recherche globale étendue (command palette)

### Phase 7 - Stabilisation et Recette
- [x] Seed de démonstration CRM enrichi (`Demo Marée Belgique`)
- [x] Tests unitaires et d'intégration CRM complets
- [x] Validation de la performance, de l'accessibilité et du responsive mobile
