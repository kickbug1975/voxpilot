# BlueMargin - Plateforme de Protection de Marge B2B

BlueMargin est un SaaS B2B de protection de marge et de création d'offres commerciales pour les distributeurs alimentaires. Ce MVP permet de gérer les coûts fournisseurs (CSV/XLSX), de définir des règles de marge hiérarchiques et de produire des offres clients immuables sous forme de documents PDF ou de liens de partage publics et sécurisés.

---

## 1. Prérequis

Avant de commencer, assurez-vous d'avoir installé :
* **Node.js** (v18.0.0 ou supérieure ; v24+ supportée)
* **npm** ou **pnpm** (si installé)
* **PostgreSQL** (version 14+ ou un projet hébergé sur [Supabase](https://supabase.com))
* **Git**

---

## 2. Installation et Initialisation

Clonez le dépôt et installez les dépendances :

```bash
# Installation des dépendances avec npm
npm install
```

---

## 3. Configuration de la Base de Données Supabase

Vous pouvez utiliser un projet Supabase hébergé ou une instance PostgreSQL locale standard.

### Option A : Supabase Hébergé (Recommandé si Docker n'est pas disponible)
1. Créez un projet gratuit sur [Supabase](https://supabase.com).
2. Récupérez vos clés API et l'URL de connexion PostgreSQL dans les paramètres du projet (`Database` & `API`).
3. Appliquez les migrations à l'aide de l'outil SQL Editor de Supabase ou via un client SQL (comme DBeaver/pgAdmin) en connectant l'URI de connexion de la base.

---

## 4. Configuration des Variables d'Environnement

Copiez le fichier d'exemple et renseignez vos clés :

```bash
cp .env.example .env
```

Modifiez le fichier `.env` :

```bash
# URL de l'application
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Paramètres API Supabase
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=votre-publishable-anon-key
SUPABASE_SECRET_KEY=votre-service-role-key

# Chaîne de connexion PostgreSQL directe (pour les migrations & tests d'intégration)
DATABASE_URL=postgresql://postgres:motdepasse@db.votre-projet.supabase.co:5432/postgres

# Sécurité & Chiffrement
PUBLIC_QUOTE_TOKEN_PEPPER=un-grain-de-sel-aleatoire-unique-tres-long
APP_ENCRYPTION_KEY=cle-de-chiffrement-32-octets-en-hexadecimal
```

---

## 5. Exécution des Migrations et Seed

Les fichiers SQL de structure de base se trouvent dans `supabase/migrations/`.
Vous devez exécuter le script de migration sur votre base de données pour initialiser le schéma multi-tenant et activer la sécurité RLS (Row Level Security).

---

## 6. Création du Compte de Démo

Pour charger les données de démonstration commerciales initiales (`Demo Maree Belgique`), exécutez le script d'initialisation (disponible dans les phases suivantes).

---

## 7. Lancement en Local

Démarrez le serveur de développement Next.js :

```bash
npm run dev
```

L'application est accessible à l'adresse [http://localhost:3000](http://localhost:3000).

---

## 8. Lancement des Tests

Pour lancer l'ensemble des tests unitaires et les tests d'intégration multi-tenant prouvant l'isolation stricte des données :

```bash
# Lancement de Vitest
npm run test
```

Pour exécuter les vérifications de types statiques et de format :

```bash
# Vérification des types TypeScript
npm run typecheck

# Analyse statique (Linter)
npm run lint
```

---

## 9. Compilation pour la Production

Pour valider que le build de production s'assemble correctement :

```bash
npm run build
```

---

## 10. Déploiement sur Vercel

1. Créez un projet sur [Vercel](https://vercel.com) connecté à votre dépôt Git.
2. Ajoutez toutes les variables d'environnement listées dans votre `.env` dans les paramètres de variables d'environnement de Vercel.
3. Déployez !

---

## 11. Fonctionnalités Optionnelles / Mode Simulation

Pour faciliter le développement local et s'affranchir d'abonnements tiers :
* **Email (EMAIL_MODE=log) :** Les e-mails de partage d'offres ne sont pas envoyés par Resend, mais sont capturés dans une boîte d'envoi locale de développement (outbox) pour être consultés directement.
* **Heuristique AI (AI_MODE=heuristic) :** Les suggestions de mapping et de matching sont calculées de manière déterministe via des algorithmes de similarité en TypeScript sans requérir de jetons OpenAI.

---

## 12. Architecture du Projet

```text
src/
  ├── app/                  # Routeurs d'application Next.js 16 (App Router)
  ├── components/           # Composants UI (shadcn/ui + composants personnalisés)
  ├── domain/               # Logique métier pure (PricingEngine, etc.)
  ├── lib/                  # Initialisation clients (Supabase client, server, env validation)
  └── tests/                # Suites de tests d'isolation RLS et de calcul
supabase/
  └── migrations/           # Définition des structures SQL, triggers, fonctions et RLS
```

---

## 13. Dépannage Courant

* **Erreur `Invalid environment variables` au démarrage :** Assurez-vous que toutes les variables obligatoires du fichier `.env.example` sont présentes et valides dans votre fichier `.env`.
* **Problèmes de connexions SSL avec Postgres :** Si vous utilisez une base de données hébergée exigeant SSL, ajoutez `?sslmode=require` à la fin de votre chaîne de connexion dans `DATABASE_URL`.
