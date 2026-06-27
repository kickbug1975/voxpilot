# Registre de Conformité RGPD & Contractuelle — BlueMargin CRM × Dicta Magic

Ce document établit la conformité du système BlueMargin CRM et de son extension d'orchestration vocale/WhatsApp Dicta Magic vis-à-vis du Règlement Général sur la Protection des Données (RGPD) et des exigences de sécurité contractuelles pour une mise en production.

---

## 1. Cartographie des Données Personnelles (Data Mapping)

Le système traite les catégories de données personnelles suivantes :

| Donnée | Finalité | Type de Stockage | Durée de Conservation |
|---|---|---|---|
| **Numéro de téléphone** | Identification du client & envoi de messages WhatsApp | Supabase (`clients.phone`, `whatsapp_messages.phone_number`) | Jusqu'à désinscription ou suppression du client |
| **Enregistrements vocaux (.webm)** | Capture des comptes-rendus de réunion et commandes | Stockage Supabase temporaire / API Whisper | Supprimés immédiatement après transcription (max 24h) |
| **Transcriptions textuelles** | Analyse IA des réunions et création de tâches/commandes | Supabase (`meetings.report_md`, `dicta_magic_memory.text_content`) | Jusqu'à suppression du client ou de l'organisation |
| **Coordonnées de livraison** | Calcul géographique d'itinéraires commerciaux | Supabase (`client_coordinates.address`, latitude/longitude) | Durée de vie de la fiche client |
| **Contenus e-mails** | Qualification et traitement des e-mails clients urgents | Supabase temporaire (`pending_emails`, `last_email_alerts`) | Supprimés dès traitement (max 7 jours) |

---

## 2. Bases Légales du Traitement (GDPR Art. 6)

Le traitement des données personnelles repose sur les bases légales suivantes :
1. **Exécution d'un contrat (Art. 6.1.b)** : Traitement des commandes d'achat, des coordonnées de livraison et envoi de confirmations de commandes.
2. **Intérêt légitime du responsable du traitement (Art. 6.1.f)** : Rédaction automatisée des rapports de visite pour le commercial et organisation des plannings de relance.
3. **Consentement explicite (Art. 6.1.a)** : L'assistant WhatsApp Client requiert un opt-in initial de la part du client final avant tout échange ou enquête de satisfaction automatique.

---

## 3. Mesures de Sécurité & Confidentialité (GDPR Art. 32)

Les mesures techniques et organisationnelles suivantes sont mises en œuvre en production :

### A. Isolation Multi-Organisations Strict (Tenant Isolation)
*   Toutes les tables contenant des données client ou d'organisation possèdent une clé `organization_id` liée à la table `organizations`.
*   La sécurité au niveau des lignes (**Row Level Security - RLS**) est activée sur 100% de ces tables.
*   Les politiques de requêtes vérifient systématiquement l'appartenance de l'utilisateur connecté via la fonction PostgreSQL `is_org_member(organization_id)`.
*   Les tests automatisés d'isolation RLS (`tests/rls-isolation.test.ts`) tournent à chaque déploiement pour certifier qu'aucune fuite de données inter-tenant n'est possible.

### B. Chiffrement & Flux Réseau
*   **Chiffrement en transit** : Tous les échanges avec les API externes (OpenRouter, OpenAI, Microsoft Graph, Evolution API) s'effectuent exclusivement via des protocoles sécurisés HTTPS (SSL/TLS v1.3).
*   **Chiffrement au repos** : Les données stockées dans la base de données Supabase de production sont chiffrées au repos par le fournisseur d'infrastructure (AWS/GCP KMS).

### C. Gestion des Clés & Secrets d'API
*   Aucune clé d'API ou secret d'authentification (OpenRouter, Microsoft client secret, Supabase service keys) n'est injecté dans le code source.
*   Tous les secrets sont chargés de manière sécurisée en production via des variables d'environnement (`.env` restreint ou coffre-fort de secrets du serveur de production).

---

## 4. Droits des Personnes (GDPR Art. 12-23)

### A. Droit d'Accès et de Rectification
Les utilisateurs de chaque organisation peuvent consulter, exporter et corriger l'intégralité des fiches clients, coordonnées et synonymes directement depuis l'interface du CRM BlueMargin.

### B. Droit à l'Effacement ("Droit à l'oubli")
*   Le CRM implémente une fonction d'archivage et de suppression propre.
*   En cas de suppression physique d'un client dans le CRM, les déclencheurs de base de données (`ON DELETE CASCADE`) suppriment immédiatement et définitivement toutes les données associées : coordonnées géographiques, commandes en attente, messages WhatsApp, alertes et notes de réunions.

---

## 5. Handover & Validation Humaine (Human-in-the-Loop)

Afin d'éviter tout effet juridique ou financier indésirable lié à une décision automatisée (Art. 22 du RGPD) :
*   Toutes les commandes générées par l'IA (depuis les dictées de Dimitri ou les messages WhatsApp clients) sont créées au statut `pending_validation`.
*   **Aucune commande n'est transmise aux services de Ghlin ou Zeebrugge** sans une validation humaine explicite (clic de Dimitri sur le bouton "Valider" du CRM ou commande WhatsApp textuelle "Valider [N°]").
*   Toutes les propositions de synonymes restent à l'état de brouillon inactif dans `proposed_synonyms` jusqu'à validation manuelle de Dimitri.

---

## 6. Auditabilité & Traçabilité

*   Toutes les écritures et modifications sensibles réalisées par les utilisateurs sont journalisées dans `audit_logs` avec l'adresse IP (anonymisée au sous-réseau) et le navigateur.
*   Toutes les actions autonomes de l'agent IA sont auditées dans `audit_logs` avec l'attribution d'acteur `'agent_dicta_magic'` pour garantir une traçabilité totale.
*   La table `audit_logs` est **immuable** en base de données : des déclencheurs SQL interdisent toute modification ou suppression de log d'audit, même pour les super-utilisateurs.
