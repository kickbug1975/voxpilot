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

---

## 9. Optimisation des Prompts, Synonymes & Production-Ready (Marée B2B)

### 🎙️ Moteur de Synonymes & Contexte Produits (BlueMargin)
*   **Correction sémantique dynamique** : Intégration du cache et de l'injection des synonymes phonétiques de la table `catalog_synonyms` de Supabase (ex: `"cabi haut"` -> `"Cabillaud"`). Ces synonymes sont passés au prompt système de Gemini et appliqués lors de la validation finale pour corriger le transcript à l'écran.
*   **Injection du Catalogue Produits** : Les noms et espèces des produits actifs de la table `products` sont dynamiquement passés en contexte dans le prompt système pour guider les correspondances lors de la dictée vocale.

### 📐 Règles de Calibres Poissonnerie (Marée) - DictaMagic & BlueMargin
Mise à jour des prompts système de VoxPilot CRM ([`route.ts`](file:///C:/Users/Dimitri/bluemargin/src/app/api/voice/process/route.ts)) et de DictaMagic ([`openaiService.ts`](file:///C:/Users/Dimitri/dicta%20magic/backend/src/services/openaiService.ts) et [`system_prompt_meeting_analysis.md`](file:///C:/Users/Dimitri/dicta%20magic/_bmad-output/system_prompt_meeting_analysis.md)) pour y inscrire vos règles métiers de calibrage marée :
1.  **Soles** : Calibres `1 à 7` ou par double poids (`400/500`, `300/400`).
2.  **Turbots et Barbues** : Toujours par double poids (ex: `1/2`, `2/3`, `500/1kg`). Pas de chiffre seul.
3.  **Plies (Carrelets)** : Double poids référencé au tarif (ex: `1/2`, `500/1kg`).
4.  **Homards** : Poids en grammes (ex: `400/500`, `500/600`, `600/800`, `800/1kg`).
5.  **Langoustines** : Calibres exclusifs autorisés : `21/30`, `16/20`, `10/15`, `11/15`, `8/12`, `6/9`, `4/7`, `3/5`.
6.  **Coquillages** : Tailles exclusives autorisées : `small (s)`, `Médium (m)`, `large (L)`, `jumbo (j)`, `Super-jumbo (s-j)`.
7.  **Scampis et Gambas** : Calibres (pièces/kg) exclusifs : `21/30`, `16/20`, `13/15`, `8/12`, `6/8`, `4/6`, `2/4`.
8.  **Huîtres** : Calibres creuses standard `N°5 à N°0` et calibres plats (`00`, `000`, `0000`).

### 🧪 Tests & Déploiement en Production
*   **Mise à jour de la Base de Données** : Exécution du script `updatePrompt.ts` de DictaMagic pour mettre à jour la version active du prompt de réunion dans la table `ai_prompts` de Supabase.
*   **Tests unitaires Vitest** : Ajout de la suite de tests unitaires [`tests/voice.test.ts`](file:///C:/Users/Dimitri/bluemargin/tests/voice.test.ts) pour valider l'extraction vocale, les guardrails anti-injection, l'invalidation des clients hors-liste et les contraintes de dates. Tous les 123 tests globaux de l'application sont passés au vert.
*   **Production Coolify** : Build, variables et déploiements relancés avec succès pour les conteneurs `voxpilot` et `whatsapp-app` sur le VPS.

### 📄 Saisie Vocale et Structurée de Devis (WhatsApp & CRM Widget)
Implémenté en juillet 2026 en parallèle pour simplifier la saisie des offres de prix en déplacement :
*   **Widget Vocal CRM (`create_quote`)** :
    *   Le prompt système extrait la liste des articles (`quoteItems`) contenant `productId`, `productName`, `quantity` et `price`.
    *   La confirmation appelle `createQuote` (génération automatique de numéro séquentiel), puis appelle `resolveQuoteItemsPrices` (lookups de prix et coûts fournisseur à l'instant T) et enfin insère dans `quote_items` via `saveQuoteItems`.
    *   Le composant `VoiceAssistantWidget.tsx` affiche désormais un aperçu structuré des articles détectés avant confirmation.
*   **WhatsApp Bot (`est_un_devis`)** :
    *   Le parseur `parseWhatsAppGroupOrder` détecte si la demande est un devis (`est_un_devis = true`) vs commande ferme.
    *   Si c'est un devis, `evolutionController.ts` génère le numéro de séquence, insère une ligne en statut `'draft'` dans `quotes`, résout les prix et insère les lignes dans `quote_items` avec le `product_snapshot` obligatoire.
    *   Renvoie une notification instantanée sur WhatsApp : *"Devis créé en brouillon pour [Client]"*.

### 🔍 Consultation de Stock et Tarifs (WhatsApp & CRM Widget)
Implémenté en juillet 2026 pour donner un accès en temps réel aux données de stock et aux prix personnalisés :
*   **Intention Stock (`query_stock`)** :
    *   *CRM Widget* : Le prompt système identifie la demande, résout le produit via `performVoiceQueryLookup` et affiche directement le résultat (ex: *"Le produit Bar de ligne est disponible (Stock Ghlin: Oui)."*) avec un bouton "Fermer".
    *   *WhatsApp Bot* : Le service `analyzeDimitriQuery` classifie l'intention. L'application recherche le produit et répond directement par WhatsApp à Dimitri (ex: *"🔍 Stock Ghlin - Bar de ligne : Disponible (Oui) | Catalogue : Actif"*).
*   **Intention Tarif Client (`query_price`)** :
    *   *CRM Widget* : Identifie le client et le produit demandés. Appelle `getPriceForCustomerProduct` pour calculer à la volée le prix appliqué pour ce client et l'affiche à l'écran.
    *   *WhatsApp Bot* : Identifie le client (avec recherche floue et service de correspondance) et le produit. Résout le tarif personnalisé et l'e-mail ou l'unité associée et renvoie par WhatsApp (ex: *"💵 Tarif Client - Grain de sable : Saumon Atlantique : 18.50 €/kg"*).

### 🏢 Résumé Client et Planification Outlook (WhatsApp & CRM Widget)
Implémenté en juillet 2026 pour optimiser la préparation des rendez-vous et la prise de rendez-vous sur la route :
*   **Intention Fiche Synthèse Client (`query_client_summary`)** :
    *   *CRM Widget* : L'IA extrait le client, calcule sa marge moyenne, récupère le statut et montant de sa dernière commande, la liste de ses devis actifs et ses tâches ouvertes, puis affiche le tout à l'écran (`getCustomerSummary` dans `voiceCustomerSummary.ts`).
    *   *WhatsApp Bot* : Le chatbot analyse le message, effectue un rapprochement flou du client, construit la même synthèse et l'envoie en direct par WhatsApp à Dimitri.
*   **Intention Planification de Réunion (`schedule_meeting`)** :
    *   *CRM Widget* : Permet de dicter un rendez-vous (visite ou réunion) à une date/heure spécifique. À la confirmation, la server action `scheduleVoiceMeeting` crée la tâche dans le CRM, vérifie les jetons Microsoft OAuth de l'utilisateur, rafraîchit si besoin et planifie l'événement en direct dans son calendrier Outlook en Europe/Brussels (Graph API `/events`).
    *   *WhatsApp Bot* : Fait la même opération en direct depuis un message texte ou audio WhatsApp reçu de Dimitri, enregistrant le rendez-vous dans le CRM et dans son calendrier Outlook, puis répondant par un message de confirmation.

### 📈 Volumes de Ventes et Alertes Actives (WhatsApp & CRM Widget)
Implémenté en juillet 2026 pour analyser les performances des ventes et la gestion des risques opérationnels :
*   **Intention Analyse de Commandes / Volumes (`query_orders`)** :
    *   *CRM Widget* : L'IA identifie si Dimitri recherche l'historique d'un client spécifique ou le total global sur une période (ex: 30 jours par défaut). Calcule le volume en kg, le nombre total de commandes et le montant global de ventes en devises (via `getCustomerOrdersSummary` dans `voiceOrdersSummary.ts`). Affiche le résultat directement à l'écran.
    *   *WhatsApp Bot* : Effectue les mêmes agrégations de données B2B en base et renvoie un rapport synthétique par message WhatsApp (ex: *"Maison Cocher a passé 3 commandes ces 30 derniers jours, totalisant 180 kg pour 2,450 €"*).
*   **Intention Analyse des Alertes Actives (`alert_analysis`)** :
    *   *CRM Widget* : Récupère les alertes non résolues/non lues de l'organisation dans la table `alerts` (par priorité décroissante) et les liste à l'écran (alertes de perte de marge, churn de volume, ou litiges).
    *   *WhatsApp Bot* : Interroge la table `alerts` pour Dimitri et renvoie la liste triée avec emojis de priorité (🔴 pour critique/haute, 🟡 pour moyenne, 🔵 pour basse).








