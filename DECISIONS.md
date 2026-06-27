# BlueMargin - Décisions techniques et hypothèses

Ce document répertorie les décisions techniques, les choix d'architecture et les hypothèses formulées lors du développement du MVP BlueMargin.

## 1. Environnement de base de données local et tests RLS
* **Hypothèse :** Docker local ou le CLI Supabase peuvent ne pas être disponibles sur toutes les machines des développeurs.
* **Décision :** Nous écrirons nos tests d'intégration avec `vitest` et `pg`. Ces tests se connecteront à une base de données PostgreSQL standard (configurée via la variable d'environnement `DATABASE_URL`, par exemple une base Postgres locale ou un projet Supabase hébergé). Les tests exécuteront les migrations, inséreront des organisations et utilisateurs fictifs, et simuleront l'authentification en définissant des variables de transaction Postgres locales (`SET LOCAL request.jwt.claim.sub` et `SET LOCAL request.jwt.claim.role`). Cela permet de valider pleinement l'isolation RLS sans nécessiter d'émulateur Supabase local complet en tâche de fond.

## 2. Sécurité multi-tenant et accès aux organisations
* **Hypothèse :** L'identifiant d'organisation (`organization_id`) fourni par le navigateur n'est pas fiable.
* **Décision :** Les points de terminaison de l'API côté serveur, les Server Actions et les Route Handlers vérifieront systématiquement que l'utilisateur (récupéré via `supabase.auth.getUser()`) est un membre actif de l'organisation cible en interrogeant la table `organization_memberships`. La sécurité RLS fera office de garde-fou absolu au niveau de la couche de base de données.

## 3. Calculs financiers
* **Hypothèse :** Les opérations en virgule flottante en JavaScript/TypeScript subissent des pertes de précision, ce qui est inacceptable pour des calculs de tarification B2B.
* **Décision :** Tous les calculs de coût rendu, marges, markups et prix recommandés seront effectués à l'aide de la bibliothèque `decimal.js` avec la précision standard à 4 décimales de la base de données (`numeric(14,4)`) et arrondis de manière appropriée selon les paramètres de l'organisation.

## 4. Supabase Auth SSR
* **Décision :** Nous utilisons `@supabase/ssr` pour intégrer l'authentification avec le Next.js App Router (en utilisant un client côté serveur avec les cookies next/headers et le middleware).

## 5. Fonctionnement hors ligne et simulation de services
* **Décision :** L'application fonctionne complètement sans clés de services externes.
  * **E-mail :** Si `EMAIL_MODE` est défini sur `log`, les e-mails contenant les offres ne sont pas envoyés via Resend, mais sont enregistrés dans une boîte d'envoi locale de développement (outbox) ou consignés dans les logs.
  * **IA :** Si `AI_MODE` est réglé sur `heuristic` (valeur par défaut), les correspondances de produits et suggestions de mapping de colonnes sont générées via des algorithmes de similarité déterministes en TypeScript, sans appel à l'API OpenAI.

## CRM Lite V1.1

### 6. Cohérence multi-tenant et intégrité des relations
* **Décision :** Afin de garantir une isolation tenant étanche, toutes les nouvelles entités (`contacts`, `customer_locations`, `activities`, `tasks`, `tags`, `crm_events`) possèdent `organization_id` avec RLS activée. Les relations utiliseront des clés étrangères composites sur `(organization_id, parent_id)` pour empêcher des associations cross-tenant accidentelles au niveau SQL.

### 7. Suppression et archivage logique des clients
* **Décision :** Conformément à FR-CRM-CUS-013, nous modifions la politique de suppression en `ON DELETE RESTRICT` au lieu de `CASCADE` pour les entités liées (comme les offres, activités, tâches), et l'interface utilisateur gérera l'archivage en basculant `is_active` à `false`.

### 8. RLS dynamique et Mode Portefeuille (`assigned_customers`)
* **Décision :** En mode `assigned_customers`, les commerciaux ne voient que les clients dont ils sont `owner_user_id`. Afin de ne pas casser l'accès aux offres existantes, les politiques SQL permettront également à un commercial de lire un client s'il est le `sales_owner_id` d'une offre associée à ce client.

### 9. Caching et recalcul des dates d'activité
* **Décision :** Les champs `last_activity_at` et `next_activity_at` sur `customers` font office de cache pour les performances de la liste. Ils sont mis à jour par des triggers de base de données après insertion d'activités/tâches ou via un service de domaine `rebuildCustomerCrmCaches` réexécutable pour garantir la robustesse du système.
