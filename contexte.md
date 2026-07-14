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
- **Validation applicative Zod** : L'action de création de client (`createCustomer` dans `src/actions/customers.ts`) ainsi que l'action d'enregistrement SMTP (`saveUserSmtpConfig` dans `src/actions/settings.ts`) valident et nettoient l'intégralité des entrées du formulaire (format e-mail, numéros de port de 1 à 65535, longueurs maximales de code, etc.) avant d'exécuter des écritures.
- **Sécurisation du chiffrement** : Retrait de la clé secrète de secours par défaut dans `src/lib/encryption.ts`. Levée d'une erreur critique immédiate au démarrage si `APP_ENCRYPTION_KEY` n'est pas définie (avec un contournement propre pour la compilation statique Next.js `next build` utilisant une clé factice temporaire).
- **Masquage des erreurs de messagerie** : Masquage sécurisé et convivial des erreurs de messagerie techniques internes dans `src/lib/emailSender.ts` (SMTP et API Microsoft Graph) pour empêcher l'exposition d'adresses IP ou d'endpoints réseau en cas d'échec d'envoi.
- **Exclusion de Secrets** : Aucun jeton, clé secrète Supabase ou mot de passe n'est suivi par Git (les fichiers `.env*` sont exclus par `.gitignore` et gérés par variables d'environnement sur le VPS).
- **Déploiement Coolify** : Des scripts d'ingestion et de push automatisés (`deploy-coolify.ts` et `deploy-whatsapp-backend.ts`) s'interfacent avec l'API Coolify sur le port `8000` du VPS pour propager les configurations de variables d'environnement (y compris le Client ID, Tenant ID et Client Secret de Microsoft) et relancer instantanément les builds des conteneurs de production lors des mises à jour.

---

## 5. Gestion des Disponibilités (Stock) & Portail Client B2B
- **Modèle de données** :
  - `is_available` (booléen, défaut `true`) : Disponibilité générale d'un produit au catalogue.
  - `in_stock_ghlin` (booléen, défaut `false`) : Stock magasin présent physiquement à Ghlin pour le dépannage rapide de dernière minute.
- **Portail Client B2B (`/c/[token]`)** :
  - Route épurée et sécurisée par jeton unique temporaire (`client_portal_tokens`).
  - Affiche en priorité la **Mercuriale habituelle** du client (articles achetés dans les 30 derniers jours triés par fréquence décroissante).
  - Permet la planification de livraison, bloquant les dimanches et lundis (jours de fermeture).
- **Algorithme de Cut-off (14h30)** :
  - Si la livraison est demandée pour le lendemain ET qu'il est plus de 14h30 (Heure de Bruxelles) : seuls les articles disponibles en stock magasin (`in_stock_ghlin = true`) peuvent être commandés. Les autres articles passent en statut rupture.
- **Automatisation WhatsApp** :
  * Si un client envoie un message privé réclamant son lien (mots-clés : *"lien"*, *"portail"*, *"me connecter"*, etc.), le service génère automatiquement un token de 24h et lui transmet instantanément par WhatsApp.
- **Tâche Cron** :
  * La route `/api/cron/reset-ghlin-stock` réinitialise tous les matins à 08h00 la colonne `in_stock_ghlin` à `false` pour tout le catalogue.

---

## 6. Intégration Microsoft Graph & OAuth 2.0 (Messagerie Outlook)
Implémenté en juillet 2026 pour contourner le blocage Microsoft de l'authentification basique (Basic Auth/SMTP) et permettre une liaison fluide et moderne avec Outlook personnelle (`dimitri.puche@outlook.com`) ou professionnelle.
- **Stockage Sécurisé** : Les jetons Microsoft sont stockés dans la table `user_microsoft_tokens` (sécurisée par RLS, seul le propriétaire y a accès) avec :
  - `access_token` : Jeton d'accès de courte durée (Microsoft Graph).
  - `refresh_token` : Jeton de renouvellement permanent (obtenu grâce au scope `offline_access`).
  - `expires_at` : Date d'expiration du jeton d'accès.
  - `email` : Adresse e-mail du compte connecté.
- **Flux OAuth Next.js** :
  - **Redirection (`/api/auth/microsoft`)** : Redirige l'utilisateur vers Microsoft en passant son ID et l'organisation dans le paramètre `state`. L'application Azure est configurée en mode `"signInAudience": "AzureADandPersonalMicrosoftAccount"` pour autoriser à la fois les comptes d'organisation et personnels.
  - **Callback (`/api/auth/callback/microsoft`)** : Récupère le code, l'échange contre les jetons, récupère l'adresse e-mail de l'utilisateur via le endpoint `/me` de Graph API, l'enregistre en base de données, puis redirige avec succès vers la page des paramètres.
- **Rafraîchissement Translucide** : Lors de l'envoi de mail, si le jeton expire dans moins de 60 secondes, `src/lib/emailSender.ts` rafraîchit automatiquement le jeton en tâche de fond avant d'exécuter la requête d'envoi.
- **Envoi de mail** : Réalisé en appelant l'API REST officielle Microsoft Graph (`POST https://graph.microsoft.com/v1.0/me/sendMail`) avec le jeton porteur, enregistrant le statut `sent` avec le fournisseur `microsoft` dans la table `email_messages`.
- **Déconnexion** : Une Server Action `disconnectMicrosoftAccount` permet à l'utilisateur de supprimer en toute sécurité sa liaison et ses jetons de la base de données.

---

## 7. Architecture Asynchrone & Files d'attente (Redis + BullMQ)
Implémenté en juillet 2026 pour fiabiliser le système et améliorer l'expérience utilisateur (envoi instantané de formulaires sans attendre les API tierces lentes).
- **Connexion Redis** : Partagée avec l'instance Redis de DictaMagic sur le VPS. Le client `ioredis` est stocké sur `globalThis` (Singleton) dans `src/lib/queue.ts` pour empêcher les fuites de sockets et la duplication de connexions sous Next.js (Hot Reload) en mode développement.
- **File de Messagerie (`voxpilot-email-queue`)** :
  - **Délégation** : Lors de l'envoi d'un e-mail (devis, test, portail), l'action `sendEmail` ajoute un job dans Redis et répond immédiatement `success: true, queued: true` au client.
  - **Traitement** : Le worker BullMQ dépile le job et appelle le protocole d'envoi réel en tâche de fond.
  - **Tolérance aux pannes** : En cas d'échec d'envoi (serveur SMTP saturé, token Microsoft temporairement expiré), le job est re-tenté automatiquement jusqu'à 5 fois avec un délai d'attente exponentiel.
- **File de Traitement Vocal (`voxpilot-voice-queue`)** :
  - **Pourquoi ?** : L'analyse vocale de devis/activités via l'IA prend de 15 à 30 secondes, ce qui dépassait les limites de timeout réseau et figeait l'interface utilisateur.
  - **Mécanisme de Polling** : 
    1. Le composant `VoiceAssistantWidget.tsx` envoie l'audio en POST à `/api/voice/process` et reçoit instantanément un `jobId`.
    2. Le traitement (transcription + extraction du schéma JSON par Gemini-3.5-Flash sur OpenRouter) est inséré dans `voiceQueue` pour être exécuté par le Worker en tâche de fond.
    3. Le navigateur interroge toutes les secondes la route `/api/voice/status?jobId=...` (GET) pour connaître l'avancement.
    4. Dès que le job passe au statut `completed`, le widget reçoit l'objet extrait et affiche la boîte de confirmation CRM à l'utilisateur.
- **Dégradation Gracieuse** : Si Redis n'est pas disponible (ou non configuré localement), les services de messagerie et de voix basculent automatiquement et de façon transparente vers l'ancien mode synchrone direct, assurant ainsi la continuité de service.
- **Bootstrap du Worker** : Les deux workers BullMQ sont démarrés automatiquement au boot du serveur de production via le fichier officiel Next.js `src/instrumentation.ts` (exécuté une seule fois lors de la phase d'initialisation de l'application).

---

## 8. Observabilité & Tracing (Langfuse Agent Ops)
- **Objectif** : Mesurer les performances, traquer les erreurs des LLM et analyser le coût en tokens (prompts, réponses, structure JSON strict).
- **Instrumentation** :
  - L'intégration utilise le client `langfuse` dans `src/lib/langfuse.ts`.
  - **Suivi des Extractions** : Utilisé dans `src/lib/ai.ts` pour suivre l'analyse et la structuration des catalogues fournisseurs.
  - **Suivi de l'analyse Vocale** : Intégration dans le traitement de la voix (synchrone et asynchrone dans le Worker BullMQ) pour mesurer la fidélité de la transcription et le coût des appels à Gemini-3.5-Flash.
- **Variables d'environnement** : `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` et `LANGFUSE_BASE_URL` sont propagées et sécurisées via Coolify.



