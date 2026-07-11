# Contexte du Projet BlueMargin - CRM

Ce fichier documente l'architecture, le fonctionnement et toutes les implémentations réalisées sur le CRM **BlueMargin** (VoxPilot).

---

## 1. Architecture Générale (Next.js & Supabase)
- **Framework** : Next.js (App Router, TypeScript).
- **Base de Données** : Supabase (PostgreSQL) avec authentification utilisateur et sécurité RLS (Row Level Security).
- **Multi-Tenant (Tenant Isolation)** : L'ensemble des entités (`customers`, `orders`, `quotes`, etc.) possède une clé `organization_id`. Les requêtes filtrent systématiquement sur cette clé pour isoler les données des organisations.

---

## 2. Row Level Security (RLS) & Permissions Supabase
Toutes les tables de production Supabase ont la Row Level Security (RLS) activée à **100%** :
- **Visualisation et Modification** : Des fonctions SQL dédiées (`is_org_member`, `has_org_role`, `can_access_customer`) vérifient que l'utilisateur connecté fait partie de l'organisation concernée et possède les privilèges adéquats (Owner, Admin, Manager, Sales).
- **Server Actions Next.js** : Situées dans `src/actions/`, elles utilisent le client Supabase standard (`createClient()`) qui respecte les politiques RLS de l'utilisateur de session. Le client administrateur (`createAdminClient()`) contournant la RLS est réservé à des actions spécifiques d'initialisation, d'audit interne, ou de génération de fichiers (PDF/XLSX) d'accès public contrôlé.

---

## 3. Module d'Analyses : Chiffre d'Affaires & Volumes (Calibres)
Implémenté en juillet 2026 pour fournir des graphiques et synthèses financières exacts dans l'onglet **Analyses & Recommandations** du client :
- **Chiffre d'Affaires Estimé** : Calculé sur la somme des ventes (`poids_réel * price_applied`).
- **Persistance du Prix à l'Instant T** : Le prix appliqué à la commande est calculé au moment de l'achat via WhatsApp puis enregistré définitivement dans la colonne `price_applied` de `order_items` pour éviter toute discordance liée aux futures fluctuations de grilles tarifaires.
- **Convertisseur de Calibres (`caliberHelper.ts`)** : 
  - Traduit les pièces unitaires en kg à partir des poids moyens de marée :
    - *Sole (calibres 1 à 7)* : 600g (Sole 1) à 120g (Sole 7).
    - *Homard (calibres 1 à 4)* : 450g (Homard 1) à 1.2kg (Homard 4).
  - **Parsing Regex non-gourmand** : Extrait la quantité et le calibre même si des descriptifs ou adjectifs sont insérés au milieu (ex: `"8 pces Sole blonde 2 pelées"` ➔ calibre `2` (450g) * 8 = `3.6 kg`).

---

## 4. Sécurité & Durcissement (Revue de Sécurité)
- **Validation applicative Zod** : L'action de création de client (`createCustomer` dans `src/actions/customers.ts`) valide et nettoie l'intégralité des entrées du formulaire (format e-mail, téléphone, longueurs maximales de code, enums de cycle de vie et potentiels autorisés) avant d'exécuter des écritures.
- **Exclusion de Secrets** : Aucun jeton, clé secrète Supabase ou mot de passe n'est suivi par Git (les fichiers `.env*` sont exclus par `.gitignore` et gérés par variables d'environnement sur le VPS).
- **Déploiement Coolify** : Des scripts d'ingestion et de push automatisés (`deploy-coolify.ts` et `deploy-whatsapp-backend.ts`) s'interfacent avec l'API Coolify sur le port `8000` du VPS pour propager les configurations de variables d'environnement et relancer instantanément les builds des conteneurs de production lors des mises à jour.
