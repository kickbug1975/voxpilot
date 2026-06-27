# BlueMargin CRM Lite - Product Requirements Document (PRD)

**Version :** 1.1  
**Statut :** Prêt pour audit du code existant puis implémentation  
**Date :** 24 juin 2026  
**Langue produit :** français, architecture compatible i18n  
**Marché initial :** Belgique francophone  
**Produit parent :** BlueMargin MVP 1.0  
**Type de document :** extension normative du PRD BlueMargin MVP 1.0  
**Objectif :** permettre à un agent de coding de transformer BlueMargin en CRM Lite commercial testable, sans réécrire le moteur de prix, de marge, d’import ou d’offres déjà fonctionnel.

---

# 1. Statut et règle de priorité documentaire

Ce document complète le PRD `BlueMargin_PRD_MVP.md` version 1.0. Il ne remplace pas les exigences du produit déjà livré.

En cas de conflit :

1. les règles de sécurité, de calcul financier, d’immuabilité des offres et de multi-tenancy du PRD 1.0 restent prioritaires ;
2. le présent PRD fait autorité pour les fonctionnalités CRM Lite ;
3. une divergence imposée par le code existant doit être documentée dans `DECISIONS.md` avant implémentation ;
4. aucune migration destructive ne peut être exécutée sans stratégie de sauvegarde, test de retour arrière et validation explicite ;
5. l’agent doit adapter les noms techniques si le dépôt réel diffère, mais conserver les comportements et critères d’acceptation décrits ici.

Le produit existant est considéré comme fonctionnel. L’agent ne doit pas recréer l’authentification, les organisations, les imports, le pricing engine, les offres, les PDF ou la page publique.

---

# 2. Résumé exécutif

BlueMargin CRM Lite ajoute à la plateforme actuelle une couche de suivi commercial quotidien : entreprises, établissements, contacts, interactions, tâches, rappels, timeline et vue client à 360 degrés.

Le CRM Lite doit permettre à un commercial de répondre en moins de 30 secondes aux questions suivantes :

- Qui est ce client ou prospect ?
- Qui est le bon interlocuteur ?
- Quelle a été la dernière interaction ?
- Quelle est la prochaine action ?
- Quelles offres sont ouvertes ?
- Quel chiffre d’affaires et quelle marge ces offres représentent-elles ?
- Existe-t-il une alerte de marge ou une relance en retard ?

Le CRM Lite ne doit pas devenir un CRM généraliste. Sa différence structurelle reste la connexion native entre relation client, offre, prix et marge.

La promesse de la version 1.1 est :

> Chaque relation commerciale débouche sur une prochaine action rentable.

---

# 3. Point de départ fonctionnel

Le code existant doit déjà contenir ou représenter les objets suivants :

| Objet existant | Rôle dans le CRM Lite |
|---|---|
| `organizations` | Paramètres de visibilité et règles CRM |
| `profiles` | Identité des utilisateurs |
| `organization_memberships` | Rôles et accès |
| `customers` | Entreprises clientes et prospects |
| `customers.owner_user_id` | Commercial responsable |
| `products` | Catalogue proposé aux clients |
| `product_sales_prices` | Tarifs client et globaux |
| `quotes` | Offres commerciales |
| `quotes.customer_id` | Relation offre-client |
| `quotes.sales_owner_id` | Responsable de l’offre |
| `quotes.contact_name`, `contact_email` | Snapshots historiques de contact |
| `quote_events` | Événements automatiques liés aux offres |
| `alerts` | Alertes internes réutilisables |
| `audit_logs` | Traçabilité des actions sensibles |

## 3.1 Décisions de continuité

- `customers` reste l’unique source de vérité pour les entreprises. Ne pas créer une table concurrente `accounts`.
- `owner_user_id` reste le responsable commercial principal d’un client.
- `sales_owner_id` reste le responsable d’une offre et peut être différent du propriétaire du client avec permission adéquate.
- `quote_events` reste l’audit métier des offres. Les événements sont projetés dans la timeline CRM sans duplication obligatoire.
- Les champs texte de contact présents sur une offre restent des snapshots immuables.
- Les nouvelles tables doivent suivre les conventions communes du PRD 1.0 : `id`, `organization_id`, `created_at`, `updated_at`, UUID et RLS.

---

# 4. Vision produit CRM

## 4.1 Vision

Faire de BlueMargin le système de travail commercial des distributeurs alimentaires : savoir où agir, préparer une offre rentable, relancer au bon moment et conserver la mémoire complète du compte.

## 4.2 Job-to-be-done principal

> Lorsque je prépare ma journée commerciale, je veux savoir quels clients contacter, ce qui s’est passé précédemment et quelle action effectuer, afin de ne laisser aucune offre rentable sans suivi.

## 4.3 Jobs secondaires

- Avant une visite, comprendre le client en moins de 30 secondes.
- Après un appel, enregistrer le résultat et la prochaine action en moins de 45 secondes.
- Depuis une fiche client, créer une offre préremplie sans ressaisie.
- Pour un manager, identifier les tâches en retard et les comptes sans suivi.
- Conserver les contacts et établissements distincts d’une même entreprise.
- Relier l’activité commerciale aux marges sans exposer les coûts aux rôles non autorisés.

## 4.4 Principes produit

- **Action avant archivage :** l’interface doit mettre en avant ce qu’il faut faire, pas uniquement ce qui a été enregistré.
- **Saisie minimale :** les champs non indispensables sont facultatifs et les valeurs répétitives sont préremplies.
- **Une seule mémoire client :** appels, visites, tâches, offres et événements système sont visibles dans une timeline cohérente.
- **Rentabilité visible :** les indicateurs financiers autorisés sont intégrés au suivi commercial.
- **Pas de double système :** réutiliser les objets existants plutôt que dupliquer clients, utilisateurs, alertes ou événements d’offres.
- **Automatisation contrôlée :** créer des tâches et alertes, mais ne jamais envoyer automatiquement un message au client dans cette version.
- **Mobile utile :** les actions terrain essentielles doivent fonctionner sur écran mobile, sans chercher la parité parfaite avec le desktop.
- **Sécurité par défaut :** les règles d’accès sont appliquées dans la base, les services et l’interface.

---

# 5. Objectifs et indicateurs

## 5.1 Objectifs de la version 1.1

- Permettre de créer un prospect, un établissement et un contact en moins de 2 minutes.
- Permettre d’enregistrer un appel et sa prochaine tâche en moins de 45 secondes.
- Afficher une vue client exploitable en moins de 2 secondes pour un compte standard.
- Associer une offre à un contact et un établissement sans perdre les snapshots historiques.
- Créer automatiquement une tâche de relance lors de l’envoi d’une offre lorsque la règle est active.
- Donner à chaque commercial une vue quotidienne de ses tâches et relances.
- Prouver l’isolation multi-tenant et la visibilité par portefeuille client avec des tests automatisés.

## 5.2 KPI produit

| Indicateur | Définition | Cible pilote |
|---|---|---:|
| Weekly active sales users | Commerciaux ayant réalisé une action CRM dans la semaine | > 70 % |
| Activity logging rate | Interactions enregistrées par commercial et par semaine | > 10 |
| Quote follow-up coverage | Offres envoyées possédant une tâche de suivi ouverte ou terminée | > 90 % |
| Next-action coverage | Clients actifs avec une prochaine tâche planifiée | > 70 % |
| On-time task completion | Tâches terminées au plus tard à l’échéance | > 75 % |
| Customer prep time | Temps pour comprendre le contexte avant appel | < 30 s |
| CRM quick-log time | Temps médian appel + résultat + prochaine action | < 45 s |
| Inactive customer recovery | Comptes inactifs ayant reçu une nouvelle activité | mesure absolue |
| Margin-linked follow-up | Relances affichant une valeur ou marge autorisée | > 80 % des offres chiffrées |

## 5.3 Événements analytiques

Ajouter au dispositif analytique existant :

- `crm_customer_created`
- `crm_customer_lifecycle_changed`
- `crm_customer_assigned`
- `crm_location_created`
- `crm_contact_created`
- `crm_contact_archived`
- `crm_activity_logged`
- `crm_activity_outcome_selected`
- `crm_next_action_created`
- `crm_task_created`
- `crm_task_completed`
- `crm_task_snoozed`
- `crm_timeline_viewed`
- `crm_customer_360_viewed`
- `crm_quote_followup_task_created`
- `crm_inactive_customer_flagged`
- `crm_search_used`
- `crm_saved_view_used`

Ne jamais transmettre dans l’analytics externe : nom du client, coordonnées, texte de note, prix, coût, marge, titre d’offre ou contenu d’activité.

---

# 6. Personas et rôles

## 6.1 Commercial terrain

**Objectif quotidien :** savoir qui appeler ou visiter et enregistrer rapidement le résultat.  
**Actions principales :** consulter son agenda, ouvrir un client, appeler, journaliser, créer une tâche, préparer une offre.  
**Risque UX :** abandon si la saisie prend plus de temps que la prise de notes personnelle.

## 6.2 Responsable commercial

**Objectif :** vérifier que les comptes et les offres sont suivis, réattribuer la charge et accompagner l’équipe.  
**Actions principales :** voir l’activité de l’équipe, les tâches en retard, les clients sans action, les offres sans relance.

## 6.3 Dirigeant / administrateur

**Objectif :** disposer d’une vision commerciale reliée au chiffre d’affaires potentiel et à la marge.  
**Actions principales :** configurer les règles CRM, contrôler les droits, consulter les KPI.

## 6.4 Lecteur / analyste

**Objectif :** consulter les données sans les modifier.  
**Actions principales :** consulter clients, timeline, tâches et indicateurs autorisés.

## 6.5 Matrice synthétique

| Capacité | owner | admin | manager | sales | viewer |
|---|---:|---:|---:|---:|---:|
| Voir tous les clients | Oui | Oui | Oui | Selon mode CRM | Oui |
| Créer un prospect | Oui | Oui | Oui | Oui | Non |
| Modifier un client | Oui | Oui | Oui | Si accessible | Non |
| Réattribuer un client | Oui | Oui | Oui | Selon paramètre | Non |
| Archiver un client | Oui | Oui | Oui | Non | Non |
| Gérer contacts/établissements | Oui | Oui | Oui | Si client accessible | Non |
| Voir toutes les activités | Oui | Oui | Oui | Selon portefeuille | Oui |
| Modifier l’activité d’autrui | Oui | Oui | Oui | Non | Non |
| Gérer toutes les tâches | Oui | Oui | Oui | Non | Non |
| Gérer ses tâches | Oui | Oui | Oui | Oui | Non |
| Modifier paramètres CRM | Oui | Oui | Non | Non | Non |
| Voir coûts et marges | Selon réglage existant | Selon réglage | Selon réglage | Selon réglage | Selon réglage |

---

# 7. Périmètre

## 7.1 Inclus

- Évolution des clients en clients et prospects avec cycle de vie.
- Établissements multiples par entreprise.
- Contacts multiples par entreprise et établissement.
- Contact principal.
- Propriétaire commercial du client.
- Activités commerciales terminées : appels, e-mails, visites, réunions, dégustations, tests produit et notes.
- Résultat d’activité.
- Prochaine action facultative ou obligatoire selon réglage.
- Tâches, échéances, rappels, priorités, attribution et clôture.
- Agenda quotidien et hebdomadaire interne.
- Timeline client consolidée.
- Vue client à 360 degrés.
- Listes filtrables clients, contacts, activités et tâches.
- Vues prédéfinies.
- Tags clients.
- Recherche globale étendue.
- Association des offres à un contact et un établissement.
- Création de tâche après envoi d’une offre.
- Traitement d’une offre acceptée, rejetée ou expirée.
- Détection de clients sans activité.
- Alertes et notifications internes réutilisant `alerts`.
- Paramètres CRM au niveau organisation.
- Seed et scénario de démonstration CRM.
- Tests unitaires, intégration, RLS et E2E.

## 7.2 Hors périmètre

- Opportunités et pipeline Kanban.
- Prévisions commerciales avancées.
- Synchronisation Gmail, Microsoft 365 ou IMAP.
- Envoi automatique de relances client.
- Campagnes, newsletters et marketing automation.
- Séquences multicanales.
- Téléphonie VoIP et enregistrement d’appel.
- WhatsApp.
- Synchronisation bidirectionnelle avec Google Calendar ou Outlook.
- Gestion des commandes, livraisons, factures et paiements.
- Service client et tickets.
- Carte de tournée et optimisation d’itinéraire.
- Application mobile native.
- Scoring prédictif par IA.
- Fusion automatique de doublons.
- Formulaires web de lead capture.
- Personnalisation illimitée des champs.

## 7.3 Extensions futures préparées mais non implémentées

- `opportunity_id` pourra être ajouté aux activités et tâches.
- Les établissements stockent latitude/longitude pour une future carte.
- Les événements CRM possèdent `source_type` et `source_id` pour de nouvelles sources.
- Les tags pourront être étendus à d’autres entités via une migration dédiée.
- Le calendrier interne peut ultérieurement être synchronisé.
- Les tâches automatisées possèdent une clé d’idempotence.

---

# 8. Glossaire CRM

| Terme | Définition |
|---|---|
| Client | Entreprise ayant une relation commerciale active ou historique. |
| Prospect | Entreprise identifiée qui n’est pas encore cliente. |
| Compte | Synonyme métier d’entreprise cliente/prospect ; le terme technique reste `customer`. |
| Établissement | Site opérationnel, de livraison, de facturation ou de production d’une entreprise. |
| Contact | Personne physique associée à une entreprise et éventuellement un établissement. |
| Activité | Interaction commerciale passée enregistrée dans BlueMargin. |
| Tâche | Action future à réaliser par un utilisateur. |
| Prochaine action | Tâche ouverte la plus proche associée au client. |
| Timeline | Chronologie consolidée des activités et événements du client. |
| Événement CRM | Événement système automatique, distinct d’une activité saisie par l’utilisateur. |
| Portefeuille | Ensemble des clients accessibles ou attribués à un commercial. |
| Client inactif | Client sans activité qualifiante depuis le délai configuré. |
| Contact principal | Interlocuteur par défaut du client. |
| Snapshot contact | Nom et e-mail figés dans une offre au moment de son envoi. |
| Tâche de relance | Tâche créée pour suivre une offre envoyée. |

---

# 9. Modèle de cycle de vie client

## 9.1 Valeurs

Le champ `customers.lifecycle_status` accepte :

- `prospect`
- `qualified`
- `customer`
- `dormant`
- `lost`
- `blocked`

## 9.2 Signification et transitions

| Statut | Signification | Transitions usuelles |
|---|---|---|
| prospect | Entreprise identifiée, besoin non confirmé | qualified, lost, blocked |
| qualified | Potentiel et besoin confirmés | customer, lost, dormant |
| customer | Relation commerciale active | dormant, lost, blocked |
| dormant | Ancien client ou relation temporairement inactive | customer, lost |
| lost | Prospect ou client perdu | prospect, qualified, customer |
| blocked | Relation interdite ou suspendue | prospect, customer, lost |

## 9.3 Règles

- `is_active` reste un indicateur technique d’archivage. Il ne remplace pas `lifecycle_status`.
- Un client archivé ne peut plus recevoir de nouvelle activité, tâche ou offre, sauf réactivation préalable.
- Le passage à `lost` demande une raison lorsque le paramètre `require_lost_reason` est actif.
- Le passage à `customer` peut renseigner automatiquement `customer_since` si vide.
- L’acceptation d’une offre ne change pas automatiquement le statut sans configuration. Le système propose le changement.
- Le passage à `blocked` doit être audité.

---

# 10. Architecture fonctionnelle et navigation

## 10.1 Navigation principale cible

```text
Tableau de bord

CRM
├── Clients et prospects
├── Contacts
├── Activités
├── Tâches
└── Mon agenda

Tarification
├── Produits
├── Prix fournisseurs
├── Tarifs clients
├── Règles de marge
└── Alertes de marge

Ventes
├── Offres
├── Modèles d’offres
└── Analyse de rentabilité

Données
├── Imports
├── Fournisseurs
└── Documents

Administration
├── Équipe
├── Rôles
├── Organisation
└── Paramètres CRM
```

## 10.2 Raccourcis globaux

- `Ctrl/Cmd + K` : recherche globale.
- `N`, puis `C` : nouveau client/prospect, uniquement si la gestion des raccourcis est mise en place sans conflit.
- Bouton global `Créer` : prospect, contact, activité, tâche, offre.
- Depuis une fiche client : actions rapides contextualisées.

## 10.3 Principe d’URL

Conserver le préfixe organisationnel existant :

```text
/[orgSlug]/customers
/[orgSlug]/customers/[customerId]
/[orgSlug]/contacts
/[orgSlug]/activities
/[orgSlug]/tasks
/[orgSlug]/agenda
/[orgSlug]/settings/crm
```

Les anciens liens `/customers/[id]` restent valides si le dépôt les utilise déjà.

---

# 11. Parcours utilisateurs de référence

## 11.1 Création et qualification d’un prospect

1. Le commercial clique sur `Créer > Prospect`.
2. Il saisit nom, ville et responsable commercial.
3. Le système crée le client avec `lifecycle_status=prospect`.
4. Il ajoute un établissement et un contact depuis la même fiche.
5. Il journalise le premier appel.
6. Il choisit un résultat et crée une prochaine tâche.
7. Le client apparaît dans `Mes prospects` et `Mon agenda`.

## 11.2 Préparation d’une visite

1. Le commercial ouvre sa tâche de visite.
2. Il accède à la fiche 360 du client.
3. Il voit le contact principal, la dernière interaction, les offres en cours, les notes épinglées et les alertes de marge autorisées.
4. Il ouvre l’adresse de l’établissement.
5. Après la visite, il complète le résultat et la prochaine action.

## 11.3 Création d’une offre depuis le CRM

1. Depuis le client ou la tâche, le commercial clique sur `Créer une offre`.
2. Client, établissement, contact et commercial sont préremplis.
3. Il sélectionne les produits et utilise le moteur BlueMargin existant.
4. L’offre est enregistrée avec `contact_id` et `location_id`, ainsi que les snapshots texte.
5. À l’envoi, un `quote_event` est créé et une tâche de relance est générée si la règle est active.

## 11.4 Relance d’offre

1. La tâche apparaît dans `Aujourd’hui`.
2. Le commercial ouvre l’offre et appelle le contact.
3. Il enregistre une activité `quote_follow_up`.
4. Il termine la tâche et crée éventuellement la suivante.
5. L’activité et le changement de tâche apparaissent dans la timeline.

## 11.5 Réactivation d’un client inactif

1. Un client sans activité depuis le délai configuré apparaît dans `À réactiver`.
2. Le commercial crée un appel.
3. Si l’appel aboutit, il planifie une visite ou une offre.
4. L’alerte d’inactivité est résolue automatiquement après une activité qualifiante.

---

# 12. Exigences fonctionnelles détaillées

## 12.1 Évolution des clients et prospects

### FR-CRM-CUS-001
Le système doit utiliser la table existante `customers` comme source unique des entreprises clientes et prospects.

### FR-CRM-CUS-002
Un utilisateur autorisé peut créer un prospect avec seulement `legal_name`, `owner_user_id` et au moins une information de localisation textuelle ou structurée.

### FR-CRM-CUS-003
La valeur par défaut de `lifecycle_status` pour une nouvelle création depuis le CRM est `prospect`.

### FR-CRM-CUS-004
Une création depuis l’ancien flux client peut utiliser `customer` si le comportement existant l’exige ; cette décision doit être centralisée dans le service de domaine.

### FR-CRM-CUS-005
Le système doit permettre de modifier le cycle de vie selon les transitions définies et journaliser chaque changement.

### FR-CRM-CUS-006
Le commercial responsable est représenté par `customers.owner_user_id`.

### FR-CRM-CUS-007
Un manager, admin ou owner peut réattribuer un client. Un sales peut le faire uniquement si `allow_sales_reassignment=true`.

### FR-CRM-CUS-008
Le changement de responsable ne doit pas réattribuer automatiquement les tâches déjà assignées. L’interface propose une option explicite de réattribution des tâches ouvertes.

### FR-CRM-CUS-009
Le système doit gérer `potential_level` parmi `unknown`, `low`, `medium`, `high`, `strategic`.

### FR-CRM-CUS-010
Le système doit gérer `lead_source` parmi les valeurs prédéfinies et accepter `other` accompagné d’un libellé facultatif.

### FR-CRM-CUS-011
Le système doit afficher `last_activity_at` et `next_activity_at` sur la liste et la fiche client.

### FR-CRM-CUS-012
Ces deux champs sont des caches reconstruisibles ; les sources de vérité sont les activités terminées, les événements qualifiants et les tâches ouvertes.

### FR-CRM-CUS-013
Un client lié à une offre, une activité ou une tâche ne peut pas être supprimé physiquement via l’interface. Il peut être archivé.

### FR-CRM-CUS-014
Un client archivé n’apparaît pas dans les sélecteurs par défaut mais reste consultable depuis l’historique.

### FR-CRM-CUS-015
Une réactivation restaure `is_active=true` et journalise l’action.

### FR-CRM-CUS-016
Un changement vers `lost` peut exiger `lost_reason` selon le paramètre organisation.

### FR-CRM-CUS-017
Les coordonnées historiques présentes dans `customers` restent lisibles pendant la migration vers les contacts.

### Critères d’acceptation

- Un client existant reste visible après migration.
- Un prospect peut être créé sans numéro de TVA.
- Un sales ne peut pas attribuer un client à un collègue si la permission est désactivée.
- Une réattribution apparaît dans la timeline.
- L’archivage ne casse aucun lien vers une offre ancienne.

## 12.2 Établissements

### FR-CRM-LOC-001
Un client peut posséder zéro, un ou plusieurs établissements.

### FR-CRM-LOC-002
Un établissement appartient obligatoirement à un client de la même organisation.

### FR-CRM-LOC-003
Le type accepte `head_office`, `restaurant`, `hotel`, `shop`, `warehouse`, `central_kitchen`, `billing`, `delivery`, `other`.

### FR-CRM-LOC-004
Un seul établissement peut être principal par client.

### FR-CRM-LOC-005
Lors de la création du premier établissement, il devient principal automatiquement.

### FR-CRM-LOC-006
La désactivation de l’établissement principal oblige à sélectionner un remplaçant ou laisse le client sans établissement principal avec avertissement explicite.

### FR-CRM-LOC-007
L’adresse doit utiliser une structure JSON documentée : `line1`, `line2`, `postal_code`, `city`, `region`, `country_code`.

### FR-CRM-LOC-008
Les horaires d’ouverture et jours de visite préférés sont facultatifs.

### FR-CRM-LOC-009
Un établissement lié à une offre envoyée ne peut pas être supprimé physiquement.

### FR-CRM-LOC-010
L’ouverture d’une carte externe est un lien simple construit depuis l’adresse ; aucune intégration cartographique n’est requise.

### FR-CRM-LOC-011
Une offre peut cibler un établissement actif du client.

### FR-CRM-LOC-012
Le choix de l’établissement ne modifie pas automatiquement l’adresse de facturation historique d’une offre déjà envoyée.

## 12.3 Contacts

### FR-CRM-CON-001
Un client peut posséder plusieurs contacts.

### FR-CRM-CON-002
Un contact appartient obligatoirement à un client et peut être rattaché à un établissement du même client.

### FR-CRM-CON-003
Au moins un des champs `first_name` ou `last_name` est requis.

### FR-CRM-CON-004
Le système doit gérer : fonction, département, e-mail, second e-mail, téléphone, mobile, langue et canal préféré.

### FR-CRM-CON-005
Le rôle de décision accepte `decision_maker`, `influencer`, `user`, `buyer`, `chef`, `owner`, `finance`, `administration`, `gatekeeper`, `other`.

### FR-CRM-CON-006
Le niveau d’influence accepte `unknown`, `low`, `medium`, `high`.

### FR-CRM-CON-007
Un seul contact actif peut être principal par client.

### FR-CRM-CON-008
Le premier contact actif devient principal automatiquement si aucun contact principal n’existe.

### FR-CRM-CON-009
Désactiver le contact principal doit déclencher la sélection d’un autre contact ou laisser le client sans contact principal avec avertissement.

### FR-CRM-CON-010
Un contact avec `do_not_contact=true` affiche une alerte visuelle et ne peut pas être sélectionné pour un nouvel envoi d’offre sans confirmation d’un manager.

### FR-CRM-CON-011
Un contact inactif reste visible dans les offres historiques et la timeline.

### FR-CRM-CON-012
Lors de la création d’une offre, sélectionner un contact remplit `contact_id`, `contact_name` et `contact_email`.

### FR-CRM-CON-013
La modification ultérieure du contact ne change pas les snapshots des offres envoyées.

### FR-CRM-CON-014
Pour une offre brouillon, l’utilisateur peut choisir de rafraîchir les snapshots depuis le contact courant.

### FR-CRM-CON-015
La recherche globale doit retrouver un contact par nom, e-mail ou téléphone selon les permissions.

### FR-CRM-CON-016
La fusion de doublons n’est pas implémentée. L’interface peut avertir lorsqu’un e-mail identique existe chez le même client.

### Critères d’acceptation

- Trois contacts peuvent être créés pour un même client.
- Le contact principal est unique.
- Un contact d’un autre client ne peut pas être associé à l’offre.
- Une offre envoyée conserve l’ancien e-mail après modification du contact.
- Un contact inactif disparaît des sélecteurs de nouvelle offre.

## 12.4 Activités commerciales

### FR-CRM-ACT-001
Une activité représente une interaction passée ou réalisée, et non une action future. Les actions futures utilisent les tâches.

### FR-CRM-ACT-002
Les types acceptés sont `call`, `email`, `visit`, `meeting`, `video_call`, `product_test`, `tasting`, `note`, `quote_follow_up`, `internal_action`, `other`.

### FR-CRM-ACT-003
La direction accepte `inbound`, `outbound`, `internal`.

### FR-CRM-ACT-004
Une activité appartient obligatoirement à un client actif ou archivé accessible.

### FR-CRM-ACT-005
Une activité peut référencer un établissement, un contact et une offre appartenant au même client.

### FR-CRM-ACT-006
Le système doit vérifier côté serveur la cohérence de toutes les relations.

### FR-CRM-ACT-007
Une activité possède un auteur, une date/heure, un sujet, un contenu facultatif et une durée facultative.

### FR-CRM-ACT-008
Les résultats acceptés sont `successful`, `no_answer`, `voicemail`, `follow_up_needed`, `meeting_booked`, `quote_requested`, `not_interested`, `wrong_contact`, `other`.

### FR-CRM-ACT-009
L’activation des résultats peut être désactivée au niveau organisation.

### FR-CRM-ACT-010
Le formulaire doit pouvoir créer une tâche de prochaine action dans la même transaction logique.

### FR-CRM-ACT-011
Si `require_next_action_after_activity=true`, une activité avec résultat `follow_up_needed`, `meeting_booked` ou `quote_requested` ne peut être finalisée sans tâche suivante.

### FR-CRM-ACT-012
Une activité enregistrée met à jour le cache `customers.last_activity_at` si elle est plus récente.

### FR-CRM-ACT-013
Une activité qualifiante résout l’alerte active `customer_inactive` du client.

### FR-CRM-ACT-014
Un sales peut modifier sa propre activité pendant 24 heures. Après ce délai, seuls manager/admin/owner peuvent la corriger.

### FR-CRM-ACT-015
Aucune activité n’est supprimée physiquement depuis l’interface. Une correction tardive doit être auditée.

### FR-CRM-ACT-016
Les notes internes utilisent le type `note` et ne sont jamais rendues dans un document ou lien public.

### FR-CRM-ACT-017
Une activité peut être épinglée dans la fiche client si elle est de type `note` et si l’utilisateur a le droit de modifier le client.

### Critères d’acceptation

- Un appel peut être enregistré en moins de 45 secondes.
- L’activité apparaît immédiatement dans la timeline.
- Une tâche suivante peut être créée sans recharger la page.
- Un sales ne peut pas modifier l’activité d’un collègue.
- Un contact d’un autre client est rejeté côté serveur.

## 12.5 Tâches et rappels

### FR-CRM-TSK-001
Une tâche représente une action future ou en cours.

### FR-CRM-TSK-002
Les types acceptés sont `call`, `email`, `visit`, `meeting`, `quote`, `quote_follow_up`, `product_sample`, `price_review`, `administrative`, `other`.

### FR-CRM-TSK-003
Les priorités acceptées sont `low`, `normal`, `high`, `urgent`.

### FR-CRM-TSK-004
Les statuts acceptés sont `open`, `in_progress`, `completed`, `cancelled`.

### FR-CRM-TSK-005
Une tâche possède obligatoirement un titre, une échéance et un utilisateur assigné actif dans l’organisation.

### FR-CRM-TSK-006
Une tâche peut être interne sans client, ou liée à un client, contact, établissement et offre cohérents.

### FR-CRM-TSK-007
Une tâche liée à un contact ou une offre doit obligatoirement référencer le client correspondant.

### FR-CRM-TSK-008
Le rappel doit être antérieur ou égal à l’échéance.

### FR-CRM-TSK-009
Une tâche est en retard si son statut est `open` ou `in_progress` et `due_at < now()`.

### FR-CRM-TSK-010
Le statut `completed` exige `completed_at` et `completed_by`.

### FR-CRM-TSK-011
Terminer une tâche doit proposer l’enregistrement d’une activité et d’une tâche suivante, sans les imposer sauf règle organisationnelle.

### FR-CRM-TSK-012
Reporter une tâche modifie son échéance, incrémente `snooze_count` et crée un événement CRM.

### FR-CRM-TSK-013
Une tâche automatisée possède `automation_key` pour empêcher les doublons.

### FR-CRM-TSK-014
Une tâche de relance d’offre est automatiquement assignée au `sales_owner_id` de l’offre, sinon au `owner_user_id` du client, sinon à l’utilisateur qui envoie.

### FR-CRM-TSK-015
L’utilisateur peut terminer, reporter, réattribuer ou annuler une tâche selon ses permissions.

### FR-CRM-TSK-016
Une tâche terminée ou annulée n’est jamais supprimée physiquement.

### FR-CRM-TSK-017
Le cache `customers.next_activity_at` doit être recalculé après création, modification, clôture ou annulation d’une tâche liée.

### FR-CRM-TSK-018
Une tâche peut avoir un rappel interne. Aucun e-mail ou notification push externe n’est requis.

### Critères d’acceptation

- Une tâche en retard est visible sans traitement manuel.
- Une tâche peut être complétée depuis la liste et l’agenda.
- Une tâche de relance n’est créée qu’une fois par révision d’offre.
- La clôture de la tâche met à jour la prochaine action du client.
- Un sales ne peut pas réattribuer à un collègue si la permission est désactivée.

## 12.6 Timeline client

### FR-CRM-TIM-001
La timeline consolide les activités, événements CRM et événements d’offres.

### FR-CRM-TIM-002
Les sources restent séparées dans la base ; la consolidation est réalisée via une fonction SQL ou un service serveur paginé.

### FR-CRM-TIM-003
Chaque entrée retourne une clé stable, une source, un type, un titre, une description, un acteur, une date, les identifiants liés et des métadonnées autorisées.

### FR-CRM-TIM-004
Le tri est descendant par `occurred_at`, puis par clé stable.

### FR-CRM-TIM-005
La pagination utilise un curseur et non un offset pour les clients volumineux.

### FR-CRM-TIM-006
Les filtres minimum sont `all`, `activities`, `quotes`, `tasks`, `notes`, `system`.

### FR-CRM-TIM-007
La timeline respecte la visibilité des coûts. Aucune métadonnée de coût ou marge ne doit apparaître si l’utilisateur n’y a pas droit.

### FR-CRM-TIM-008
Une entrée peut ouvrir son objet source : activité, tâche, offre, contact ou établissement.

### FR-CRM-TIM-009
Une activité corrigée garde la même identité et montre une mention `modifiée` si pertinent.

### FR-CRM-TIM-010
Les événements d’offres existants sont lus depuis `quote_events`; ils ne sont pas dupliqués dans `crm_events`.

### FR-CRM-TIM-011
Les événements automatiques non liés aux offres utilisent `crm_events`.

### FR-CRM-TIM-012
L’ajout d’un contact, la réattribution d’un client, l’archivage, la réactivation et la clôture d’une tâche peuvent créer un événement CRM.

### Critères d’acceptation

- Un appel et un envoi d’offre apparaissent dans une chronologie unique.
- Le curseur retourne la page suivante sans doublon.
- Un utilisateur sans coûts ne reçoit aucun champ financier interdit dans le payload.
- Un événement d’une autre organisation est inaccessible.

## 12.7 Vue client à 360 degrés

### FR-CRM-360-001
La fiche client devient la page centrale et doit conserver l’accès aux fonctionnalités pricing et offres existantes.

### FR-CRM-360-002
L’en-tête affiche nom, statut, segment, potentiel, propriétaire, ville principale, contact principal, dernière activité et prochaine action.

### FR-CRM-360-003
Les KPI minimum sont : offres ouvertes, valeur des offres ouvertes, marge potentielle autorisée, marge moyenne autorisée et tâches en retard.

### FR-CRM-360-004
La page contient les onglets `Vue d’ensemble`, `Timeline`, `Contacts`, `Établissements`, `Offres`, `Tarifs et marges`, `Tâches`, `Documents`, `Informations`.

### FR-CRM-360-005
L’onglet `Vue d’ensemble` affiche une synthèse sans charger toutes les données détaillées.

### FR-CRM-360-006
Le bloc `À faire` priorise tâche en retard, offre à relancer, absence de prochaine action, client inactif et alerte de marge.

### FR-CRM-360-007
Le bouton `Créer une offre` préremplit client, contact principal, établissement principal et propriétaire commercial.

### FR-CRM-360-008
Le bouton `Journaliser` ouvre un formulaire rapide d’activité.

### FR-CRM-360-009
Le bouton `Créer une tâche` préremplit le client et l’utilisateur courant.

### FR-CRM-360-010
Le chargement initial ne doit pas dépendre du chargement complet de la timeline.

### FR-CRM-360-011
Sur mobile, les actions principales restent accessibles dans une barre d’action ou menu fixe.

## 12.8 Listes et vues CRM

### FR-CRM-LST-001
La liste clients/prospects doit être paginée côté serveur.

### FR-CRM-LST-002
Colonnes minimum : entreprise, statut, ville, segment, potentiel, responsable, contact principal, dernière activité, prochaine tâche, offres ouvertes, alerte.

### FR-CRM-LST-003
Les colonnes financières sont conditionnées par les droits existants.

### FR-CRM-LST-004
Filtres minimum : statut, segment, responsable, potentiel, province/région, tags, activité récente, inactivité, tâche en retard, offre ouverte et marge à risque.

### FR-CRM-LST-005
Les vues prédéfinies sont : `Mes prospects`, `Mes clients actifs`, `À relancer aujourd’hui`, `Sans activité depuis 30 jours`, `Offres sans réponse`, `Clients à marge faible`, `Potentiel élevé`.

### FR-CRM-LST-006
Les vues personnalisées persistantes sont hors périmètre. Les paramètres de filtre peuvent rester dans l’URL.

### FR-CRM-LST-007
Les listes contacts, activités et tâches sont également paginées et filtrables.

### FR-CRM-LST-008
Une sélection multiple peut attribuer un commercial ou ajouter un tag uniquement pour manager/admin/owner.

### FR-CRM-LST-009
L’export de données CRM en masse est hors périmètre, sauf export d’une liste filtrée en CSV si le composant existant le permet sans retard majeur.

## 12.9 Agenda

### FR-CRM-AGD-001
La vue `Mon agenda` affiche les tâches assignées à l’utilisateur courant.

### FR-CRM-AGD-002
La vue par défaut comporte `En retard`, `Aujourd’hui`, `Demain` et `Cette semaine`.

### FR-CRM-AGD-003
Une vue semaine en liste ou calendrier léger est requise. Aucun glisser-déposer complexe n’est obligatoire.

### FR-CRM-AGD-004
Les actions rapides sont terminer, reporter, ouvrir le client, enregistrer le résultat et créer la prochaine tâche.

### FR-CRM-AGD-005
Les tâches annulées et terminées sont masquées par défaut.

### FR-CRM-AGD-006
Le fuseau horaire de l’organisation est utilisé pour les regroupements de date.

### FR-CRM-AGD-007
Une tâche urgente ou en retard doit être distinguée sans reposer uniquement sur la couleur.

## 12.10 Tags et segmentation

### FR-CRM-TAG-001
Le champ `customers.segment` reste la segmentation principale existante.

### FR-CRM-TAG-002
Les tags ajoutent une classification multiple des clients.

### FR-CRM-TAG-003
Un tag possède un nom unique par organisation et une clé de couleur parmi un ensemble contrôlé.

### FR-CRM-TAG-004
Un client peut posséder plusieurs tags.

### FR-CRM-TAG-005
Seuls owner/admin/manager peuvent créer, renommer ou archiver un tag.

### FR-CRM-TAG-006
Un sales peut appliquer ou retirer un tag sur un client accessible.

### FR-CRM-TAG-007
La suppression d’un tag utilisé est un archivage ou une suppression des associations avec confirmation explicite.

## 12.11 Recherche globale

### FR-CRM-SRC-001
Étendre la recherche existante aux clients, établissements, contacts, offres et produits.

### FR-CRM-SRC-002
Les recherches contacts utilisent nom, e-mail et téléphone normalisé.

### FR-CRM-SRC-003
Les résultats sont groupés par type et limités à un maximum configurable par groupe.

### FR-CRM-SRC-004
La recherche respecte le portefeuille et les rôles.

### FR-CRM-SRC-005
Un utilisateur non autorisé ne doit pas apprendre l’existence d’un client via le nombre de résultats ou un message différent.

### FR-CRM-SRC-006
La cible est inférieure à 1 seconde sur 10 000 clients et 50 000 contacts avec indexes appropriés.

## 12.12 Intégration aux offres

### FR-CRM-QUO-001
Ajouter `contact_id` et `location_id` facultatifs à `quotes`.

### FR-CRM-QUO-002
Le contact et l’établissement doivent appartenir au `customer_id` de l’offre.

### FR-CRM-QUO-003
Les snapshots `contact_name` et `contact_email` restent obligatoires au moment de l’envoi si un contact est sélectionné.

### FR-CRM-QUO-004
Lorsqu’une offre passe à `sent`, créer une tâche `quote_follow_up` si le paramètre est activé.

### FR-CRM-QUO-005
La date de la tâche est `sent_at + default_quote_follow_up_delay_days`, dans le fuseau horaire de l’organisation, à 09:00 si aucune heure n’est configurée.

### FR-CRM-QUO-006
La clé d’automatisation est stable par organisation, offre et révision.

### FR-CRM-QUO-007
Une révision envoyée crée sa propre tâche de relance. La tâche de l’ancienne révision peut être annulée si elle est encore ouverte.

### FR-CRM-QUO-008
Quand une offre est acceptée, les tâches ouvertes de relance de cette révision sont terminées automatiquement avec résultat `quote_accepted`.

### FR-CRM-QUO-009
Quand une offre est rejetée, les tâches ouvertes sont terminées ou annulées selon paramètre, et le système propose une tâche de reprise future.

### FR-CRM-QUO-010
Quand une offre expire, une alerte et/ou tâche peut être créée uniquement si la configuration est activée.

### FR-CRM-QUO-011
Les événements automatiques doivent être idempotents et fonctionner aussi lorsque le provider e-mail est en mode `log`.

### FR-CRM-QUO-012
La timeline doit afficher les événements d’offre existants sans exposer les coûts au rôle non autorisé.

## 12.13 Automatisations et alertes

### FR-CRM-AUT-001
Réutiliser `alerts` plutôt que créer un second système de notification métier.

### FR-CRM-AUT-002
Nouveaux types d’alerte : `task_overdue`, `customer_inactive`, `quote_follow_up_due`, `crm_mention`, `customer_without_next_action`.

### FR-CRM-AUT-003
Les alertes sont dédupliquées par une clé métier dans `metadata.dedupe_key` ou une colonne dédiée si le code existant la possède.

### FR-CRM-AUT-004
La détection d’une tâche en retard peut être calculée à la lecture ; la création d’une alerte persistante est optionnelle mais doit être idempotente.

### FR-CRM-AUT-005
Un client est inactif si aucune activité qualifiante ni événement client qualifiant n’existe depuis `inactive_customer_delay_days`.

### FR-CRM-AUT-006
Les événements internes purement techniques ne réinitialisent pas l’inactivité.

### FR-CRM-AUT-007
La tâche de relance après offre est obligatoire lorsque `auto_create_quote_follow_up_task=true`.

### FR-CRM-AUT-008
Aucune automatisation CRM Lite n’envoie un message externe sans action utilisateur.

### FR-CRM-AUT-009
Un endpoint de traitement quotidien peut être appelé par cron sécurisé, mais le produit doit rester utilisable sans cron.

### FR-CRM-AUT-010
Un script local doit permettre d’exécuter manuellement les règles quotidiennes pour la démo et les tests.

## 12.14 Paramètres CRM

### FR-CRM-SET-001
Ajouter aux organisations les paramètres suivants :

- `crm_visibility_mode`
- `default_quote_follow_up_delay_days`
- `inactive_customer_delay_days`
- `require_next_action_after_activity`
- `allow_sales_reassignment`
- `crm_activity_outcomes_enabled`
- `auto_create_quote_follow_up_task`
- `require_lost_reason`

### FR-CRM-SET-002
`crm_visibility_mode` accepte `all_customers` et `assigned_customers`.

### FR-CRM-SET-003
La valeur par défaut est `all_customers` afin de ne pas casser les accès actuels.

### FR-CRM-SET-004
Seuls owner et admin modifient ces paramètres.

### FR-CRM-SET-005
Toute modification de visibilité est auditée.

### FR-CRM-SET-006
Avant de passer en mode `assigned_customers`, l’interface affiche le nombre de clients sans propriétaire et les risques d’accès.

## 12.15 Audit

### FR-CRM-AUD-001
Les actions sensibles sont enregistrées dans `audit_logs` : réattribution, archivage, réactivation, changement de cycle de vie, changement de visibilité, modification tardive d’activité, désactivation d’un contact principal.

### FR-CRM-AUD-002
Le contenu complet des notes et activités ne doit pas être dupliqué dans les métadonnées d’audit.

### FR-CRM-AUD-003
Les événements automatiques CRM possèdent un acteur `system` représenté par `actor_user_id=null` et une source explicite.

---

# 13. User stories prioritaires

## Epic A - Structurer le compte

### US-CRM-A1
En tant que commercial, je veux créer rapidement un prospect afin de ne pas perdre une piste rencontrée sur le terrain.

**Acceptation :** nom, ville, propriétaire ; fiche créée en moins de 2 minutes.

### US-CRM-A2
En tant que commercial, je veux ajouter plusieurs établissements afin de distinguer les sites de livraison et les interlocuteurs.

### US-CRM-A3
En tant que commercial, je veux identifier un contact principal afin que les offres soient préremplies avec la bonne personne.

## Epic B - Conserver la mémoire commerciale

### US-CRM-B1
En tant que commercial, je veux enregistrer un appel avec son résultat afin de retrouver le contexte plus tard.

### US-CRM-B2
En tant que manager, je veux voir les interactions d’un client afin d’accompagner le commercial sans demander un rapport séparé.

### US-CRM-B3
En tant que commercial, je veux épingler une note importante afin qu’elle soit visible avant chaque échange.

## Epic C - Piloter les prochaines actions

### US-CRM-C1
En tant que commercial, je veux voir mes tâches en retard et du jour afin de préparer ma journée.

### US-CRM-C2
En tant que commercial, je veux créer la prochaine action après un appel afin qu’aucun suivi ne soit oublié.

### US-CRM-C3
En tant que manager, je veux filtrer les clients sans prochaine action afin de détecter les portefeuilles abandonnés.

## Epic D - Relier CRM et rentabilité

### US-CRM-D1
En tant que commercial, je veux créer une offre depuis un contact afin d’éviter toute ressaisie.

### US-CRM-D2
En tant que manager, je veux voir la valeur et la marge des offres ouvertes par client afin de prioriser les relances.

### US-CRM-D3
En tant que commercial, je veux recevoir automatiquement une tâche après l’envoi d’une offre afin de relancer au bon moment.

## Epic E - Gouvernance

### US-CRM-E1
En tant qu’admin, je veux choisir si les commerciaux voient tous les clients ou uniquement leur portefeuille.

### US-CRM-E2
En tant qu’admin, je veux conserver un journal des réattributions et modifications sensibles.

---

# 14. Spécifications UX/UI

## 14.1 Direction générale

Conserver l’identité visuelle BlueMargin existante. Le CRM Lite doit utiliser les mêmes composants, espacements, couleurs, états, formulaires et conventions de navigation.

Les écrans CRM doivent privilégier :

- densité lisible ;
- actions rapides ;
- informations prioritaires au-dessus de la ligne de flottaison ;
- drawers ou modales pour les créations simples ;
- pages complètes pour les formulaires complexes ;
- skeletons, états vides et erreurs récupérables ;
- confirmation explicite uniquement pour les actions destructrices ou sensibles.

## 14.2 Écrans à construire

### E21 - Tableau de bord CRM

**Objectif :** préparer la journée et identifier les comptes nécessitant une action.

**Blocs :**

- Tâches du jour.
- Tâches en retard.
- Offres à relancer.
- Clients sans prochaine action.
- Clients inactifs.
- Activité récente de l’utilisateur.
- KPI valeur et marge des offres actives selon droit.

**Actions :** terminer, reporter, ouvrir client, créer activité, créer tâche.

### E22 - Liste clients et prospects

**Composants :** barre de recherche, vues prédéfinies, filtres, tableau paginé, actions groupées autorisées.

**Actions ligne :** ouvrir, journaliser, créer tâche, créer offre, modifier.

**État vide :** expliquer la différence client/prospect et proposer une création.

### E23 - Fiche client 360

**En-tête :** identité, statut, potentiel, propriétaire, contact principal, dernière activité, prochaine tâche.

**Actions principales :** journaliser, créer tâche, créer offre, modifier.

**Onglets :** vue d’ensemble, timeline, contacts, établissements, offres, tarifs et marges, tâches, documents, informations.

### E24 - Création/modification client

Formulaire progressif avec section minimum puis informations complémentaires. Aucun champ non essentiel ne doit bloquer la création.

### E25 - Établissement

Drawer ou modal avec nom, type, adresse, coordonnées, jours de visite, notes de livraison et statut principal.

### E26 - Liste contacts

Liste globale et onglet client. Colonnes : nom, entreprise, établissement, fonction, rôle, e-mail, téléphone, principal, statut.

### E27 - Fiche/contact drawer

Affiche coordonnées, rôle de décision, notes, activités récentes, offres liées et actions appeler/e-mail/journaliser.

### E28 - Journalisation rapide d’activité

Le formulaire doit être utilisable sur mobile.

Ordre recommandé :

1. type ;
2. client prérempli ;
3. contact ;
4. résultat ;
5. note ;
6. date/heure ;
7. prochaine action.

Le bouton principal est `Enregistrer l’activité`.

### E29 - Création de tâche

Champs : type, titre, client, contact, offre, responsable, échéance, priorité, rappel, description.

Préremplir au maximum selon le contexte.

### E30 - Liste activités

Filtres : période, commercial, type, résultat, client. Lecture seule par défaut ; édition selon permissions.

### E31 - Liste tâches

Vues : mes tâches, équipe, en retard, aujourd’hui, semaine, terminées. Actions rapides en ligne.

### E32 - Mon agenda

Groupement temporel et vue semaine. L’interface ne doit pas dépendre d’une bibliothèque de calendrier lourde si une liste structurée suffit.

### E33 - Timeline client

Filtre par type, chargement progressif, entrées compactes, détails repliables, liens vers objets.

### E34 - Paramètres CRM

Réglages, explications et avertissement avant changement de visibilité.

### E35 - Recherche globale étendue

Command palette avec groupes clients, contacts, offres, produits et établissements.

### E36 - Quick create global

Menu ou palette proposant prospect, contact, activité, tâche et offre. Chaque action doit maintenir le contexte actif.

## 14.3 États UI obligatoires

Pour chaque écran :

- chargement initial ;
- rafraîchissement ;
- état vide ;
- aucun résultat filtre ;
- erreur réseau ;
- accès refusé ;
- entité archivée ;
- succès de mutation ;
- conflit de mise à jour si détecté ;
- données financières masquées.

## 14.4 Accessibilité

- Navigation clavier complète.
- Focus visible.
- Labels explicites.
- Messages d’erreur liés aux champs.
- Statut urgent ou retard non communiqué uniquement par couleur.
- Contraste WCAG AA.
- Boutons mobiles d’au moins 44 x 44 px.
- Timeline sémantique avec titres lisibles par lecteur d’écran.

## 14.5 Responsive

**Desktop 1440 x 900 :** expérience de référence.  
**Tablette :** colonnes secondaires masquées ou adaptatives.  
**Mobile 390 x 844 :** agenda, fiche client, activité rapide, tâche, contact et ouverture d’offre doivent être pleinement utilisables.

---

# 15. Modèle de données

Toutes les nouvelles tables métier suivent les colonnes communes du PRD 1.0 :

```text
id uuid primary key default gen_random_uuid()
organization_id uuid not null references organizations(id)
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Les dates sont stockées en UTC et affichées dans le fuseau de l’organisation.

## 15.1 Enums ou domaines contrôlés

L’implémentation peut utiliser des enums Postgres ou des colonnes texte avec contraintes `check`. Ne pas multiplier les enums si le dépôt actuel utilise des checks.

Valeurs normatives :

```text
crm_lifecycle_status: prospect, qualified, customer, dormant, lost, blocked
crm_potential_level: unknown, low, medium, high, strategic
crm_visibility_mode: all_customers, assigned_customers
crm_contact_channel: email, phone, mobile, visit, other
crm_location_type: head_office, restaurant, hotel, shop, warehouse, central_kitchen, billing, delivery, other
crm_decision_role: decision_maker, influencer, user, buyer, chef, owner, finance, administration, gatekeeper, other
crm_influence_level: unknown, low, medium, high
crm_activity_type: call, email, visit, meeting, video_call, product_test, tasting, note, quote_follow_up, internal_action, other
crm_activity_direction: inbound, outbound, internal
crm_activity_outcome: successful, no_answer, voicemail, follow_up_needed, meeting_booked, quote_requested, not_interested, wrong_contact, other
crm_task_type: call, email, visit, meeting, quote, quote_follow_up, product_sample, price_review, administrative, other
crm_task_priority: low, normal, high, urgent
crm_task_status: open, in_progress, completed, cancelled
```

## 15.2 Modifications de `organizations`

Ajouter :

- `crm_visibility_mode text not null default 'all_customers'`
- `default_quote_follow_up_delay_days int not null default 3`
- `inactive_customer_delay_days int not null default 30`
- `require_next_action_after_activity boolean not null default false`
- `allow_sales_reassignment boolean not null default false`
- `crm_activity_outcomes_enabled boolean not null default true`
- `auto_create_quote_follow_up_task boolean not null default true`
- `require_lost_reason boolean not null default true`

Contraintes : délais entre 0 et 365 jours.

## 15.3 Modifications de `customers`

Ajouter :

- `lifecycle_status text not null default 'customer'`
- `lead_source text`
- `lead_source_detail text`
- `website text`
- `industry text`
- `potential_level text not null default 'unknown'`
- `preferred_contact_channel text`
- `last_activity_at timestamptz`
- `next_activity_at timestamptz`
- `customer_since date`
- `lost_at timestamptz`
- `lost_reason text`
- `created_by uuid`
- `updated_by uuid`

Backfill :

- clients existants actifs : `lifecycle_status='customer'` ;
- clients existants inactifs : `lifecycle_status='dormant'` ;
- `customer_since` reste null si inconnue ;
- ne pas inventer `lead_source`.

## 15.4 `customer_locations`

- `customer_id uuid not null`
- `name text not null`
- `location_type text not null default 'other'`
- `address jsonb not null default '{}'`
- `phone text`
- `email citext`
- `delivery_notes text`
- `opening_hours jsonb not null default '{}'`
- `preferred_visit_days smallint[] not null default '{}'`
- `latitude numeric(9,6)`
- `longitude numeric(9,6)`
- `is_primary boolean not null default false`
- `is_active boolean not null default true`
- `created_by uuid`
- `updated_by uuid`

Contraintes : latitude -90..90, longitude -180..180.

Index unique partiel : un seul `is_primary=true and is_active=true` par client.

## 15.5 `contacts`

- `customer_id uuid not null`
- `location_id uuid null`
- `first_name text`
- `last_name text`
- `job_title text`
- `department text`
- `email citext`
- `secondary_email citext`
- `phone text`
- `mobile text`
- `preferred_channel text`
- `language text not null default 'fr-BE'`
- `decision_role text not null default 'other'`
- `influence_level text not null default 'unknown'`
- `notes text`
- `is_primary boolean not null default false`
- `is_active boolean not null default true`
- `do_not_contact boolean not null default false`
- `created_by uuid`
- `updated_by uuid`

Contrainte : `coalesce(nullif(trim(first_name),''), nullif(trim(last_name),'')) is not null`.

Index unique partiel : un seul contact principal actif par client.

## 15.6 `activities`

- `customer_id uuid not null`
- `location_id uuid null`
- `contact_id uuid null`
- `quote_id uuid null`
- `activity_type text not null`
- `direction text not null default 'outbound'`
- `subject text not null`
- `content text`
- `outcome text`
- `occurred_at timestamptz not null default now()`
- `duration_minutes int`
- `is_pinned boolean not null default false`
- `created_by uuid not null`
- `updated_by uuid`
- `corrected_at timestamptz`

Contraintes : durée 0..1440. Une activité est considérée comme terminée dès sa création. Les interactions futures sont des tâches.

## 15.7 `tasks`

- `customer_id uuid null`
- `location_id uuid null`
- `contact_id uuid null`
- `quote_id uuid null`
- `title text not null`
- `description text`
- `task_type text not null default 'other'`
- `priority text not null default 'normal'`
- `status text not null default 'open'`
- `due_at timestamptz not null`
- `reminder_at timestamptz null`
- `assigned_to uuid not null`
- `created_by uuid not null`
- `updated_by uuid`
- `completed_at timestamptz`
- `completed_by uuid`
- `outcome text`
- `snooze_count int not null default 0`
- `automation_key text`

Contraintes :

- rappel <= échéance ;
- `snooze_count >= 0` ;
- `completed` implique completed_at et completed_by ;
- contact, location ou quote impliquent customer_id non null.

Index unique partiel sur `(organization_id, automation_key)` si non null.

## 15.8 `tags`

- `name citext not null`
- `color_key text not null default 'blue'`
- `is_active boolean not null default true`
- `created_by uuid`

Unique `(organization_id, name)`.

## 15.9 `customer_tags`

- `organization_id uuid not null`
- `customer_id uuid not null`
- `tag_id uuid not null`
- `created_by uuid`
- `created_at timestamptz not null default now()`

Clé primaire ou unique `(customer_id, tag_id)`.

## 15.10 `crm_events`

Table append-only pour les événements automatiques non déjà couverts par `quote_events`.

- `customer_id uuid not null`
- `event_type text not null`
- `source_type text not null`
- `source_id uuid null`
- `actor_user_id uuid null`
- `title text not null`
- `description text`
- `metadata jsonb not null default '{}'`
- `dedupe_key text`
- `occurred_at timestamptz not null default now()`

Index unique partiel `(organization_id, dedupe_key)` si non null.

Aucune modification ou suppression ordinaire via l’interface.

## 15.11 Modifications de `quotes`

Ajouter :

- `contact_id uuid null`
- `location_id uuid null`

Conserver :

- `contact_name`
- `contact_email`
- `sales_owner_id`
- tous les snapshots et règles d’immuabilité existants.

## 15.12 Réutilisation de `alerts`

Aucune nouvelle table de notifications métier n’est nécessaire. Ajouter des types et métadonnées :

```json
{
  "dedupe_key": "customer-inactive:<customerId>:<threshold>",
  "customerId": "uuid",
  "taskId": "uuid or null",
  "quoteId": "uuid or null"
}
```

## 15.13 Vue ou fonction `get_customer_timeline`

Signature recommandée :

```sql
get_customer_timeline(
  p_customer_id uuid,
  p_limit int default 30,
  p_before timestamptz default null,
  p_sources text[] default null
)
```

Retour :

- `entry_key text`
- `source text`
- `event_type text`
- `title text`
- `body text`
- `actor_user_id uuid`
- `actor_name text`
- `contact_id uuid`
- `quote_id uuid`
- `task_id uuid`
- `occurred_at timestamptz`
- `metadata jsonb`

Sources :

1. `activities` ;
2. `quote_events` joint à `quotes.customer_id` ;
3. `crm_events`.

La fonction doit vérifier `can_access_customer` avant toute lecture et filtrer les métadonnées financières selon `can_view_costs`.

---

# 16. Contraintes relationnelles et intégrité multi-tenant

## 16.1 Règle

Toute relation entre deux tables métier doit garantir que les deux lignes appartiennent à la même organisation.

## 16.2 Stratégie recommandée

Ajouter si nécessaire des contraintes uniques `(organization_id, id)` sur les tables parentes puis utiliser des clés étrangères composites :

```sql
foreign key (organization_id, customer_id)
  references customers (organization_id, id)
```

Appliquer le même principe à contacts, établissements, offres et tags lorsque possible.

## 16.3 Cohérence contact/établissement/client

Une clé étrangère simple ne garantit pas qu’un `contact.location_id` appartient au même `customer_id`. Utiliser l’une des solutions suivantes, par ordre de préférence :

1. clé étrangère composite incluant `customer_id` si le schéma le permet ;
2. trigger de validation ciblé ;
3. fonction serveur transactionnelle accompagnée de tests DB.

Ne pas s’appuyer uniquement sur le formulaire.

## 16.4 Suppression

- `on delete restrict` pour clients liés à offres/activités/tâches.
- `on delete set null` possible pour contact ou établissement sur un brouillon, mais l’archivage est préféré.
- `customer_tags` peut utiliser `on delete cascade` depuis l’association ou le tag.
- `crm_events` reste conservé si l’objet source est archivé.

---

# 17. Plan de migrations Supabase

Le numéro exact doit suivre les migrations déjà présentes. Chaque migration doit être petite, testable et réversible autant que possible.

## M1 - Pré-audit et sauvegarde

- Exécuter les tests existants.
- Capturer le schéma courant.
- Sauvegarder une base de test représentative.
- Lister les noms réels des enums, fonctions RLS et triggers.
- Ajouter une migration vide de validation si le workflow le requiert.

## M2 - Paramètres et champs client

- Ajouter les colonnes `organizations` et `customers`.
- Ajouter les contraintes `check`.
- Backfill des statuts.
- Créer les indexes de listes.
- Aucun champ existant supprimé.

## M3 - Établissements

- Créer `customer_locations`.
- Créer RLS.
- Option de migration des anciennes `shipping_address` vers un établissement principal, sans supprimer l’adresse originale.
- Le backfill doit être idempotent.

## M4 - Contacts

- Créer `contacts`.
- Créer RLS et indexes.
- Backfill depuis `customers.primary_email`, `customers.phone` et éventuellement `trade_name` uniquement si un nom fiable existe.
- Si aucun nom de personne n’existe, créer un contact générique uniquement si le produit le décide explicitement ; par défaut, ne pas inventer de personne.
- Ne jamais créer plusieurs contacts identiques lors d’une nouvelle exécution.

## M5 - Activités et événements CRM

- Créer `activities` et `crm_events`.
- Créer fonctions de permission.
- Créer fonction timeline.
- Ajouter les triggers `updated_at`.

## M6 - Tâches

- Créer `tasks`.
- Index échéance et attribution.
- Fonctions de recalcul du cache prochaine action.
- RLS.

## M7 - Tags

- Créer `tags` et `customer_tags`.
- RLS et contraintes.

## M8 - Intégration des offres

- Ajouter `quotes.contact_id`, `quotes.location_id`.
- Ajouter validation de cohérence.
- Ne pas backfill depuis les snapshots sauf correspondance déterministe et sûre.

## M9 - Indexes, recherche et optimisation

- `pg_trgm` déjà attendu par le PRD 1.0.
- Index trigrammes sur nom client, nom contact et nom établissement.
- Index normalisés téléphone/e-mail si la stratégie du dépôt le permet.
- Index tâches et activités.

## M10 - Seed CRM et réparation

- Ajouter données de démonstration.
- Ajouter fonction ou script `rebuild_customer_crm_caches`.
- Tester migration sur base vide et base issue du MVP 1.0.

## Retour arrière

Le retour arrière ne doit jamais supprimer les colonnes remplies ni les tables contenant des données de production sans export préalable. Pour les pilotes, préférer désactiver la fonctionnalité via flag plutôt que supprimer le schéma.

---

# 18. Index obligatoires

- `customers (organization_id, lifecycle_status, is_active)`.
- `customers (organization_id, owner_user_id, is_active)`.
- `customers (organization_id, next_activity_at)`.
- `customers (organization_id, last_activity_at desc)`.
- index trigramme sur `coalesce(trade_name, legal_name)`.
- `customer_locations (organization_id, customer_id, is_active)`.
- unique partiel établissement principal.
- `contacts (organization_id, customer_id, is_active)`.
- `contacts (organization_id, location_id)`.
- index trigramme sur concaténation prénom/nom ou expression adaptée.
- `contacts (organization_id, email)`.
- unique partiel contact principal.
- `activities (organization_id, customer_id, occurred_at desc)`.
- `activities (organization_id, created_by, occurred_at desc)`.
- `tasks (organization_id, assigned_to, status, due_at)`.
- `tasks (organization_id, customer_id, status, due_at)`.
- unique partiel automation key.
- `crm_events (organization_id, customer_id, occurred_at desc)`.
- `customer_tags (organization_id, customer_id)`.
- `customer_tags (organization_id, tag_id)`.
- `quotes (organization_id, contact_id)`.
- `quotes (organization_id, location_id)`.

---

# 19. Sécurité, permissions et RLS

## 19.1 Règles absolues

- RLS activée sur toutes les nouvelles tables multi-tenant.
- Ne jamais faire confiance à `organization_id`, `customer_id`, `assigned_to` ou `owner_user_id` envoyés par le navigateur.
- Toute mutation vérifie membership, rôle, mode de visibilité et cohérence des relations.
- Les colonnes de coût restent protégées selon les règles du PRD 1.0.
- Les notes et activités ne doivent pas apparaître dans les pages publiques d’offres.

## 19.2 Fonctions SQL recommandées

Ajouter ou adapter :

```sql
can_access_customer(org_id uuid, customer_id uuid)
can_manage_customer(org_id uuid, customer_id uuid)
can_manage_crm_settings(org_id uuid)
can_assign_user(org_id uuid, target_user_id uuid)
can_edit_activity(org_id uuid, activity_id uuid)
can_manage_task(org_id uuid, task_id uuid)
```

Chaque fonction `security definer` doit définir explicitement `search_path`, ne retourner que le strict nécessaire et être testée contre l’escalade de privilèges.

## 19.3 Mode `all_customers`

- owner/admin/manager : tous les clients.
- sales : tous les clients actifs de l’organisation.
- viewer : lecture de tous les clients, sans mutation.

## 19.4 Mode `assigned_customers`

- owner/admin/manager : tous les clients.
- sales : clients dont `owner_user_id=auth.uid()`.
- sales peut également lire les objets nécessaires à ses propres offres si une transition temporaire est documentée, mais le système doit encourager l’attribution du client.
- viewer : lecture de tous les clients sauf configuration future contraire.

## 19.5 Activités

- Lecture : utilisateur ayant accès au client.
- Création : utilisateur autorisé sur le client.
- Mise à jour : auteur pendant 24 heures ou manager/admin/owner.
- Suppression : aucune suppression depuis le client ; correction auditée.

## 19.6 Tâches

- Lecture sales : tâches assignées à l’utilisateur ou liées à un client accessible, selon besoin de collaboration.
- Mutation sales : tâches assignées à lui ou créées par lui, sous réserve de portefeuille.
- Manager/admin/owner : toutes les tâches.
- Réattribution : selon rôle et paramètre.

## 19.7 Protection des données personnelles

- Ne pas journaliser e-mails, téléphones ou contenu de notes dans les logs applicatifs.
- Masquer les coordonnées dans les traces d’erreur.
- Conserver une possibilité d’export/suppression conforme aux procédures de l’organisation.
- `do_not_contact` est un signal opérationnel, pas un moteur de consentement marketing complet.
- Ne pas stocker de données sensibles non nécessaires.

## 19.8 Sémantique 403/404

Pour un identifiant d’une autre organisation, retourner 404 ou une réponse générique sans révéler l’existence de l’objet. Les tests doivent vérifier l’absence de fuite dans le message, le titre, les logs retournés et les compteurs.

---

# 20. Services de domaine

## 20.1 `CustomerCrmService`

Responsabilités :

- créer prospect/client ;
- changer cycle de vie ;
- attribuer propriétaire ;
- archiver/réactiver ;
- recalculer caches CRM ;
- produire le résumé 360 autorisé.

Fonctions suggérées :

```ts
createCustomer(input, actor): Promise<Customer>
changeLifecycle(input, actor): Promise<Customer>
assignCustomer(input, actor): Promise<Customer>
archiveCustomer(input, actor): Promise<void>
rebuildCustomerCrmCache(customerId): Promise<void>
getCustomer360(customerId, actor): Promise<Customer360View>
```

## 20.2 `LocationService`

- CRUD avec archivage.
- Garantie d’un seul principal.
- Validation d’adresse et cohérence organisation/client.

## 20.3 `ContactService`

- CRUD avec archivage.
- Gestion contact principal.
- Validation `do_not_contact`.
- Snapshot de contact pour offre brouillon.

## 20.4 `ActivityService`

- journaliser activité ;
- valider relations ;
- gérer résultat ;
- créer prochaine tâche transactionnellement ;
- mettre à jour `last_activity_at` ;
- résoudre alertes d’inactivité ;
- contrôler fenêtre d’édition.

## 20.5 `TaskService`

- créer, reporter, réattribuer, compléter, annuler ;
- calculer retard ;
- recalculer `next_activity_at` ;
- créer événement CRM ;
- garantir l’idempotence des tâches automatiques.

## 20.6 `TimelineService`

- appeler la fonction SQL consolidée ;
- appliquer filtres et curseur ;
- projeter les métadonnées autorisées ;
- retourner un DTO stable indépendant des tables sources.

## 20.7 `CrmAutomationService`

- offre envoyée -> tâche de suivi ;
- offre acceptée/rejetée -> clôture des tâches ;
- client inactif -> alerte ;
- tâches en retard -> alertes éventuelles ;
- réparation idempotente.

## 20.8 `CrmSearchService`

- recherche groupée ;
- normalisation téléphone ;
- scoring simple et déterministe ;
- respect du portefeuille ;
- aucun contenu sensible dans l’analytics.

---

# 21. Contrats API et actions serveur

Les noms peuvent suivre les conventions du dépôt, mais les comportements sont normatifs. Les listes sont paginées côté serveur et les mutations utilisent Zod.

## 21.1 Clients

### `GET /api/customers`

Filtres : `q`, `lifecycle`, `owner`, `potential`, `segment`, `tag`, `inactiveDays`, `hasOverdueTask`, `hasOpenQuote`, `cursor`, `limit`.

Retour : projection liste autorisée.

### `POST /api/customers`

Crée prospect/client. Le serveur détermine l’organisation active et vérifie le propriétaire.

### `GET /api/customers/:id`

Retourne résumé client autorisé.

### `PATCH /api/customers/:id`

Modifie les informations autorisées.

### `POST /api/customers/:id/lifecycle`

Body : `status`, `reason`.

### `POST /api/customers/:id/assign`

Body : `ownerUserId`, `reassignOpenTasks:boolean`.

### `POST /api/customers/:id/archive`

Archivage logique.

### `POST /api/customers/:id/reactivate`

Réactivation.

### `GET /api/customers/:id/summary`

Retourne la vue 360 compacte.

## 21.2 Établissements

### `GET /api/customers/:id/locations`
### `POST /api/customers/:id/locations`
### `PATCH /api/locations/:locationId`
### `POST /api/locations/:locationId/set-primary`
### `POST /api/locations/:locationId/archive`

## 21.3 Contacts

### `GET /api/customers/:id/contacts`
### `POST /api/customers/:id/contacts`
### `GET /api/contacts/:contactId`
### `PATCH /api/contacts/:contactId`
### `POST /api/contacts/:contactId/set-primary`
### `POST /api/contacts/:contactId/archive`

## 21.4 Activités

### `GET /api/activities`

Filtres : période, utilisateur, type, résultat, client, curseur.

### `POST /api/activities`

Exemple :

```json
{
  "customerId": "uuid",
  "contactId": "uuid-or-null",
  "locationId": "uuid-or-null",
  "quoteId": "uuid-or-null",
  "activityType": "call",
  "direction": "outbound",
  "subject": "Appel de qualification",
  "content": "Le chef souhaite tester la gamme.",
  "outcome": "meeting_booked",
  "occurredAt": "2026-06-24T10:00:00+02:00",
  "durationMinutes": 12,
  "nextTask": {
    "title": "Visite et dégustation",
    "taskType": "visit",
    "dueAt": "2026-07-02T10:00:00+02:00",
    "assignedTo": "uuid"
  }
}
```

L’activité et la tâche suivante doivent être créées dans une transaction ou une unité logique idempotente.

### `PATCH /api/activities/:activityId`

Respecte fenêtre de 24 heures et audit.

### `POST /api/activities/:activityId/pin`

Seulement pour notes et utilisateurs autorisés.

## 21.5 Tâches

### `GET /api/tasks`

Filtres : `assignedTo`, `status`, `dueFrom`, `dueTo`, `overdue`, `customerId`, `quoteId`, `cursor`.

### `POST /api/tasks`

Crée une tâche manuelle.

### `PATCH /api/tasks/:taskId`

Modifie champs autorisés.

### `POST /api/tasks/:taskId/complete`

Body facultatif : `outcome`, `activity`, `nextTask`.

### `POST /api/tasks/:taskId/snooze`

Body : nouvelle échéance et raison facultative.

### `POST /api/tasks/:taskId/reassign`

Body : nouvel utilisateur.

### `POST /api/tasks/:taskId/cancel`

Annulation logique.

## 21.6 Timeline

### `GET /api/customers/:id/timeline`

Query : `before`, `limit`, `sources`.

Retour :

```json
{
  "items": [
    {
      "key": "activity:uuid",
      "source": "activity",
      "eventType": "call",
      "title": "Appel de qualification",
      "body": "...",
      "actor": {"id": "uuid", "name": "Dimitri"},
      "contactId": "uuid",
      "quoteId": null,
      "taskId": null,
      "occurredAt": "2026-06-24T08:00:00Z",
      "metadata": {}
    }
  ],
  "nextCursor": "opaque-or-null"
}
```

## 21.7 Tags

### `GET /api/tags`
### `POST /api/tags`
### `PATCH /api/tags/:id`
### `POST /api/customers/:id/tags/:tagId`
### `DELETE /api/customers/:id/tags/:tagId`

## 21.8 Dashboard et agenda

### `GET /api/crm/dashboard`

Retourne KPI et listes limitées pour l’utilisateur courant.

### `GET /api/crm/agenda`

Query : période et utilisateur autorisé.

## 21.9 Recherche

### `GET /api/search?q=...&scope=crm`

Retour groupé et limité.

## 21.10 Automatisations internes

### `POST /api/internal/cron/crm-daily`

Protégé par secret ou mécanisme de plateforme. Exécute inactivité, alertes et réparations idempotentes.

### Script local

```bash
pnpm crm:daily
```

## 21.11 Format d’erreur

Réutiliser le format du PRD 1.0 :

```json
{
  "error": {
    "code": "CRM_CONTACT_CUSTOMER_MISMATCH",
    "message": "Le contact ne correspond pas au client sélectionné.",
    "fieldErrors": {"contactId": ["Contact incompatible"]},
    "requestId": "..."
  }
}
```

Codes minimum :

- `CRM_CUSTOMER_NOT_ACCESSIBLE`
- `CRM_CONTACT_CUSTOMER_MISMATCH`
- `CRM_LOCATION_CUSTOMER_MISMATCH`
- `CRM_QUOTE_CUSTOMER_MISMATCH`
- `CRM_PRIMARY_CONTACT_CONFLICT`
- `CRM_PRIMARY_LOCATION_CONFLICT`
- `CRM_ACTIVITY_EDIT_WINDOW_EXPIRED`
- `CRM_NEXT_ACTION_REQUIRED`
- `CRM_TASK_ASSIGNMENT_FORBIDDEN`
- `CRM_TASK_ALREADY_COMPLETED`
- `CRM_AUTOMATION_DUPLICATE`
- `CRM_ARCHIVED_ENTITY`

---

# 22. Architecture front-end et arborescence cible

Étendre l’arborescence existante sans déplacer inutilement les modules en production.

```text
src/
  app/
    (app)/
      [orgSlug]/
        dashboard/
        customers/
          page.tsx
          new/
          [customerId]/
            page.tsx
            timeline/
            contacts/
            locations/
            tasks/
        contacts/
        activities/
        tasks/
        agenda/
        settings/
          crm/
    api/
      customers/
      contacts/
      locations/
      activities/
      tasks/
      tags/
      crm/
      internal/cron/crm-daily/
  components/
    crm/
      customer-360/
      timeline/
      activities/
      tasks/
      contacts/
      locations/
      agenda/
      quick-create/
  domain/
    crm/
      customers/
      contacts/
      locations/
      activities/
      tasks/
      timeline/
      automation/
      search/
  repositories/
    crm/
  schemas/
    crm/
  types/
    crm/
  tests/
    crm/
supabase/
  migrations/
  seed.sql
scripts/
  rebuild-crm-caches.ts
  run-crm-daily.ts
  seed-crm-demo.ts
```

## 22.1 État et données

- Favoriser Server Components pour listes et vues initiales.
- Utiliser Server Actions ou Route Handlers pour mutations selon conventions existantes.
- Les filtres de listes sont représentés dans les search params.
- Éviter un store global CRM si les données serveur suffisent.
- Utiliser optimistic UI uniquement pour tâches simples et avec rollback fiable.

## 22.2 Schémas Zod

Créer des schémas distincts :

- `createCustomerSchema`
- `updateCustomerSchema`
- `createLocationSchema`
- `createContactSchema`
- `logActivitySchema`
- `createTaskSchema`
- `completeTaskSchema`
- `crmListFiltersSchema`
- `crmSettingsSchema`

Réutiliser les types inférés pour les formulaires et services, sans exposer directement les types DB aux composants.

---

# 23. Automatisations détaillées

## 23.1 Offre envoyée

Déclencheur : transition réelle vers `sent`.

Étapes :

1. vérifier paramètre ;
2. construire `automation_key = quote-followup:<quoteId>:rev:<revision>` ;
3. vérifier absence de tâche existante ;
4. déterminer responsable ;
5. calculer échéance ;
6. créer tâche ;
7. créer événement CRM ;
8. ne pas faire échouer l’envoi si la création de tâche rencontre une erreur récupérable, mais loguer et rendre l’erreur visible aux administrateurs ;
9. une commande de réparation doit pouvoir recréer les tâches manquantes.

## 23.2 Offre acceptée

- Trouver tâches ouvertes `quote_follow_up` de l’offre/révision.
- Les terminer avec résultat `quote_accepted`.
- Créer événement CRM.
- Proposer, sans imposer, changement du client vers `customer` et tâche d’onboarding commercial.

## 23.3 Offre rejetée

- Clôturer les tâches ouvertes avec résultat `quote_rejected`.
- Afficher la raison issue de l’événement si disponible.
- Proposer une tâche future de reprise de contact.

## 23.4 Client inactif

Activités qualifiantes : appel, e-mail, visite, réunion, vidéo, test, dégustation, relance d’offre. Les notes internes seules ne réinitialisent pas l’inactivité.

Le calcul utilise `last_activity_at` réparé depuis les sources de vérité.

## 23.5 Client sans prochaine action

Un client actif ou qualifié sans tâche ouverte future peut apparaître dans une vue et, optionnellement, produire une alerte. Ne pas créer automatiquement une tâche fictive.

## 23.6 Idempotence

Tous les traitements quotidiens et événements liés aux offres doivent pouvoir être rejoués sans doublon.

---

# 24. Tableau de bord CRM

## 24.1 KPI première ligne

- Tâches aujourd’hui.
- Tâches en retard.
- Clients à relancer.
- Offres à suivre.

## 24.2 KPI performance

- Valeur des offres actives.
- Marge potentielle autorisée.
- Taux d’acceptation sur période.
- Marge moyenne autorisée.

## 24.3 Listes prioritaires

- Cinq prochaines tâches.
- Cinq tâches les plus en retard.
- Cinq offres envoyées sans réponse.
- Cinq clients à potentiel élevé sans prochaine action.
- Activités récentes.

## 24.4 Période

Périodes prédéfinies : aujourd’hui, semaine, 30 jours. Le MVP n’exige pas un builder de dashboard.

---

# 25. Recherche et normalisation

## 25.1 Nom

Normaliser casse, accents et espaces pour le matching de recherche, sans modifier la valeur affichée.

## 25.2 Téléphone

Créer une fonction de normalisation vers chiffres et indicatif lorsque possible. Ne pas bloquer la saisie internationale.

## 25.3 E-mail

Utiliser `citext`. Ne pas rendre unique à l’échelle de l’organisation, car une adresse générique peut être partagée.

## 25.4 Ordre des résultats

1. correspondance exacte code ou numéro d’offre ;
2. début de nom ;
3. correspondance nom complet ;
4. trigramme ;
5. résultats récents accessibles.

---

# 26. Exigences non fonctionnelles

## 26.1 Performance

- Fiche 360 initiale : LCP cible < 2,5 s.
- Liste clients 50 lignes : réponse serveur < 800 ms sur base pilote.
- Recherche : < 1 s pour 10 000 clients et 50 000 contacts.
- Timeline première page : < 800 ms hors latence réseau.
- Mutation activité + tâche : < 1,5 s.
- Aucun chargement non paginé de toutes les activités ou tâches.

## 26.2 Robustesse

- Transactions pour activité + prochaine tâche.
- Idempotency key pour automatisations.
- Recalcul des caches réexécutable.
- Échec du cron sans corruption.
- Conflits de statut de tâche traités proprement.
- Le CRM reste fonctionnel sans provider externe.

## 26.3 Compatibilité

Même matrice que le PRD 1.0. Le quick log et l’agenda doivent être testés sur mobile.

## 26.4 Observabilité

- `requestId` sur erreurs.
- Logs structurés sans PII.
- Compteurs : activités créées, tâches automatiques, échecs d’automatisation, durée timeline, durée recherche.
- Vue admin ou logs permettant d’identifier les automatisations échouées.

## 26.5 Accessibilité

Respect de la section UX, avec tests automatiques de base et vérification clavier des parcours critiques.

---

# 27. Données de démonstration

Étendre `Demo Marée Belgique`.

## 27.1 Utilisateurs

- Owner : Alice Admin.
- Manager : Marc Manager.
- Sales : Dimitri Commercial.
- Sales : Sophie Commerciale.

## 27.2 Clients/prospects

1. Brasserie du Centre - customer - potentiel high - Dimitri.
2. Marché Gourmet - customer - potentiel strategic - Sophie.
3. Cuisine Collective Horizon - customer - potentiel high - Dimitri.
4. Hôtel des Ardennes - qualified - potentiel high - Dimitri.
5. Poissonnerie du Parc - prospect - potentiel medium - Sophie.
6. Restaurant La Vague - dormant - potentiel medium - Dimitri.

## 27.3 Établissements

- Brasserie du Centre - Mons, restaurant principal.
- Marché Gourmet - Namur, siège et magasin.
- Cuisine Horizon - cuisine centrale et adresse de facturation.
- Hôtel des Ardennes - hôtel/restaurant.

## 27.4 Contacts

Au moins deux contacts sur trois clients, avec rôles différents : chef, acheteur, comptabilité, propriétaire.

## 27.5 Activités

- appel abouti ;
- appel sans réponse ;
- visite ;
- dégustation ;
- note épinglée ;
- relance d’offre.

## 27.6 Tâches

- deux tâches du jour ;
- une tâche en retard ;
- une visite future ;
- une relance automatique liée à une offre ;
- une tâche terminée.

## 27.7 Timeline

Au moins un client doit montrer : création contact, appel, visite, offre envoyée, offre vue, relance et tâche terminée.

---

# 28. Tests

## 28.1 Tests unitaires

- transitions de cycle de vie ;
- validation raison de perte ;
- choix du responsable de tâche automatique ;
- calcul échéance offre ;
- détection retard ;
- règle rappel <= échéance ;
- fenêtre d’édition activité ;
- sélection contact/établissement cohérents ;
- choix contact principal ;
- choix établissement principal ;
- calcul client inactif ;
- recalcul prochaine tâche ;
- normalisation téléphone ;
- mapping DTO timeline ;
- filtrage financier timeline ;
- idempotence automation key.

## 28.2 Tests d’intégration

- création client -> établissement -> contact ;
- activité + prochaine tâche transactionnelle ;
- échec de tâche annule la création complète si mode transaction stricte ;
- offre envoyée -> tâche de relance ;
- second traitement -> aucun doublon ;
- offre acceptée -> tâche terminée ;
- tâche complétée -> cache client recalculé ;
- archivage contact -> ancien snapshot intact ;
- changement mode visibilité ;
- recherche filtrée par portefeuille ;
- timeline consolidée paginée.

## 28.3 Tests RLS obligatoires

Créer organisations A et B, plus manager et sales.

Vérifier qu’un membre de A ne peut jamais :

- voir un établissement de B ;
- voir un contact de B ;
- lire une activité de B ;
- modifier une tâche de B ;
- obtenir une entrée timeline de B ;
- retrouver B par recherche ;
- appliquer un tag de A à un client de B ;
- associer un contact de B à une offre de A.

Vérifier en mode `assigned_customers` :

- sales A1 voit ses clients ;
- sales A1 ne voit pas les clients de A2 ;
- manager voit les deux ;
- une URL directe ne contourne pas la règle ;
- les compteurs dashboard ne comptent que les données visibles.

## 28.4 E2E Playwright

### E2E-CRM-01 - Prospect vers prochaine action

1. Connexion sales.
2. Créer prospect.
3. Ajouter établissement.
4. Ajouter contact principal.
5. Journaliser appel.
6. Sélectionner résultat `meeting_booked`.
7. Créer tâche visite.
8. Vérifier fiche 360 et agenda.

### E2E-CRM-02 - Offre et relance

1. Ouvrir client.
2. Créer offre depuis contact.
3. Envoyer en mode email log.
4. Vérifier tâche automatique.
5. Vérifier timeline.
6. Accepter via page publique.
7. Vérifier clôture de tâche.

### E2E-CRM-03 - Portefeuille

1. Activer `assigned_customers`.
2. Attribuer clients à deux sales.
3. Vérifier listes, recherche, URL et dashboard.

### E2E-CRM-04 - Contact historique

1. Envoyer offre à contact A.
2. Modifier son e-mail.
3. Archiver contact A.
4. Vérifier que l’offre conserve le snapshot.
5. Vérifier qu’une nouvelle offre ne propose plus A.

### E2E-CRM-05 - Tâche en retard

1. Créer tâche passée.
2. Vérifier badge retard.
3. Reporter.
4. Terminer avec activité.
5. Vérifier événements et cache.

### E2E-CRM-06 - Mobile quick log

Viewport 390 x 844 : ouvrir tâche, journaliser appel, créer prochaine tâche, consulter confirmation.

### E2E-CRM-07 - Isolation multi-tenant

Tester accès direct aux nouvelles entités avec ID connu.

### E2E-CRM-08 - Visibilité coûts

Sales sans accès coûts ouvre fiche client, timeline et offre ; aucun coût n’apparaît dans DOM, JSON ou export.

## 28.5 CI

- Lint.
- Typecheck.
- Unit tests.
- Integration tests.
- RLS tests.
- E2E smoke.
- Migration base vide.
- Migration depuis snapshot MVP 1.0.
- Build production.

---

# 29. Critères de recette

## R-CRM-01 - Structure client

- Prospect créé.
- Deux établissements.
- Trois contacts.
- Un seul principal.
- Aucune régression sur les clients existants.

## R-CRM-02 - Activité

- Appel enregistré.
- Résultat choisi.
- Tâche suivante créée.
- Timeline mise à jour.
- Temps de parcours raisonnable sur mobile.

## R-CRM-03 - Tâches

- Échéance et retard corrects dans timezone organisation.
- Report et clôture audités.
- Agenda correct.
- Prochaine activité du client mise à jour.

## R-CRM-04 - Offres

- Contact et établissement préremplis.
- Snapshots figés.
- Relance automatique idempotente.
- Acceptation clôture la tâche.

## R-CRM-05 - Client 360

- Résumé disponible en moins de 30 secondes de lecture.
- Dernière activité et prochaine action correctes.
- KPI financiers masqués selon droit.
- Actions rapides fonctionnelles.

## R-CRM-06 - Sécurité

- Isolation cross-tenant.
- Portefeuille respecté.
- Recherche sans fuite.
- RLS sur toutes les nouvelles tables.

---

# 30. Définition of Done CRM Lite

La version 1.1 est terminée uniquement si :

- les tests existants du MVP restent verts ;
- les migrations fonctionnent sur base vide et base existante ;
- un prospect, établissement et contact peuvent être créés ;
- un appel et une visite peuvent être enregistrés ;
- une prochaine tâche peut être créée avec l’activité ;
- l’agenda montre retard, aujourd’hui et semaine ;
- la timeline consolide activités, offres et événements CRM ;
- la fiche 360 affiche contexte, tâches, offres et marges autorisées ;
- une offre utilise contact et établissement ;
- une offre envoyée crée une relance idempotente ;
- une offre acceptée clôture le suivi ;
- les vues prédéfinies fonctionnent ;
- la recherche CRM fonctionne ;
- la visibilité `assigned_customers` est prouvée par tests ;
- aucune donnée cross-tenant ou coût interdit n’est exposé ;
- le parcours critique mobile est testable ;
- `README.md`, `PROGRESS.md` et `DECISIONS.md` sont mis à jour ;
- aucun bug P0/P1 n’est ouvert.

---

# 31. Priorisation MoSCoW

## Must

- Champs cycle de vie.
- Établissements.
- Contacts.
- Activités.
- Tâches.
- Timeline.
- Fiche client 360.
- Agenda.
- Association offres/contact/établissement.
- Relance après offre.
- RLS et portefeuille.
- Tests et migration.

## Should

- Tags.
- Vues prédéfinies complètes.
- Dashboard CRM.
- Client inactif.
- Quick create global.
- Notes épinglées.
- Actions groupées manager.

## Could

- Export CSV de liste.
- Mentions internes.
- Vue semaine graphique.
- Lien carte externe enrichi.
- Suggestions de prochaine action déterministes.

## Won’t

Pipeline, opportunités, e-mail sync, calendrier sync, campagnes, téléphonie, commandes, factures, IA prédictive.

---

# 32. Plan d’implémentation pour agent

## Phase 0 - Audit du dépôt existant

1. Lire le PRD 1.0 et le présent PRD.
2. Exécuter lint, typecheck, tests et build.
3. Cartographier tables, migrations, routes, services et écrans existants.
4. Identifier les divergences de noms.
5. Mettre à jour `PROGRESS.md` et `DECISIONS.md`.
6. Produire un plan de migration sans coder l’UI.

**Gate :** baseline verte ou liste précise des régressions préexistantes ; mapping documenté entre PRD et code.

## Phase 1 - Schéma et sécurité

1. Paramètres organisation.
2. Champs client.
3. Établissements et contacts.
4. Activités, tâches, événements CRM et tags.
5. Modifications offres.
6. Index, fonctions permissions et RLS.
7. Tests migration et isolation.

**Gate :** base migrée depuis MVP 1.0 ; aucune fuite multi-tenant ; aucun écran existant cassé.

## Phase 2 - Clients, établissements et contacts

1. Liste clients enrichie.
2. Formulaire prospect.
3. CRUD établissements.
4. CRUD contacts.
5. Contact/établissement principal.
6. Migration de compatibilité.

**Gate :** E2E structure client vert.

## Phase 3 - Activités et timeline

1. ActivityService.
2. Quick log.
3. Notes et résultats.
4. CRM events.
5. Fonction timeline.
6. Timeline UI.

**Gate :** appel + offre visibles dans timeline paginée et sécurisée.

## Phase 4 - Tâches et agenda

1. TaskService.
2. Liste tâches.
3. Agenda.
4. Report, clôture, réattribution.
5. Recalcul des caches.
6. Tâche suivante depuis activité.

**Gate :** un sales peut gérer sa journée depuis BlueMargin.

## Phase 5 - Intégration offres et automatisations

1. Contact/location sur offre.
2. Préremplissage.
3. Tâche après envoi.
4. Clôture après décision.
5. Traitement quotidien.
6. Réparation idempotente.

**Gate :** E2E offre/relance/acceptation vert en mode email log.

## Phase 6 - Fiche 360, dashboard et recherche

1. Résumé 360.
2. Onglets.
3. Dashboard CRM.
4. Vues prédéfinies.
5. Recherche globale.
6. Tags.

**Gate :** préparation d’un appel en moins de 30 secondes lors d’un test utilisateur interne.

## Phase 7 - Stabilisation

1. Performance.
2. Accessibilité.
3. Mobile.
4. Audit sécurité.
5. Seed démo.
6. Documentation.
7. Recette complète.

**Gate :** Definition of Done satisfaite.

---

# 33. Règles d’exécution pour l’agent

- Ne pas réinitialiser ou remplacer le dépôt fonctionnel.
- Ne pas modifier les formules de prix ou marge sauf bug prouvé et documenté.
- Ne pas supprimer les colonnes historiques client ou offre dans cette version.
- Ne pas introduire d’ORM si le projet n’en utilise pas, sauf justification validée.
- Ne pas désactiver RLS.
- Ne pas exposer la service role key.
- Ne pas faire confiance aux identifiants du client.
- Utiliser des migrations courtes.
- Garder l’application exécutable après chaque phase.
- Exécuter lint, typecheck et tests après chaque sous-phase.
- Ajouter les tests avant ou avec la fonctionnalité.
- Documenter chaque divergence dans `DECISIONS.md`.
- Ne pas développer le pipeline ou les opportunités.
- Ne pas ajouter une dépendance externe obligatoire.
- Toute automatisation doit être idempotente et réparable.

---

# 34. Risques et mesures

| Risque | Impact | Mesure |
|---|---:|---|
| Régression du MVP fonctionnel | Critique | Audit baseline, phases et gates |
| Duplication clients/accounts | Élevé | Réutiliser `customers` |
| RLS trop permissive | Critique | Fonctions d’accès + tests DB |
| Relations cross-tenant | Critique | FK composites/triggers + tests |
| Saisie trop lourde | Élevé | Quick log, préremplissage, champs minimum |
| Timeline lente | Élevé | Cursor, indexes, projection SQL |
| Cache dernière/prochaine action incohérent | Moyen | Source de vérité + rebuild script |
| Doubles tâches de relance | Élevé | `automation_key` unique |
| Contact modifié altère offre | Critique | Snapshots immuables |
| CRM devient généraliste | Élevé | Hors périmètre strict |
| Données coûts exposées | Critique | Projection serveur et tests payload |
| Cron non exécuté | Moyen | Calcul à la lecture + script manuel |
| Mode portefeuille bloque des utilisateurs | Élevé | défaut all_customers + audit avant activation |

---

# 35. Décisions à ne pas rouvrir pendant la version 1.1

- `customers` reste l’entreprise.
- Pas d’opportunités ni pipeline.
- Une activité est passée ; une tâche est future.
- Les offres conservent leurs snapshots.
- Les tâches de relance sont internes.
- Le CRM fonctionne sans Gmail, Outlook ou calendrier externe.
- Les rôles existants sont conservés.
- Le mode portefeuille est configurable et désactivé par défaut.
- Pas de suppression physique des données CRM liées.
- Pas de polymorphisme générique non contraint pour les relations principales.
- Les calculs financiers restent dans le domaine pricing existant.

---

# 36. Questions post-pilote

- Les commerciaux enregistrent-ils réellement leurs appels et visites ?
- Quel résultat d’activité est le plus utile ?
- Le délai de relance par défaut doit-il varier par segment ?
- Les utilisateurs souhaitent-ils une vue carte ?
- La synchronisation e-mail apporte-t-elle plus de valeur que le pipeline ?
- Le pipeline doit-il être basé sur l’offre, le client ou une opportunité séparée ?
- Quelle définition d’un client inactif est pertinente par segment ?
- Les tâches doivent-elles pouvoir être répétitives ?
- Le responsable commercial a-t-il besoin d’objectifs individuels ?
- Les notes de visite doivent-elles avoir un modèle structuré ?

Ces questions ne bloquent pas la version 1.1.

---

# 37. Checklist de livraison

## Code

- [ ] Migrations.
- [ ] RLS.
- [ ] Services domaine.
- [ ] API/actions.
- [ ] Écrans E21 à E36 requis.
- [ ] Seed CRM.
- [ ] Script traitement quotidien.
- [ ] Script reconstruction caches.

## Qualité

- [ ] Baseline MVP toujours verte.
- [ ] Tests unitaires.
- [ ] Tests intégration.
- [ ] Tests RLS.
- [ ] E2E CRM.
- [ ] Build production.
- [ ] Audit accessibilité.
- [ ] Audit performance.

## Documentation

- [ ] README actualisé.
- [ ] PROGRESS actualisé.
- [ ] DECISIONS actualisé.
- [ ] Schéma ERD actualisé.
- [ ] Guide utilisateur CRM court.
- [ ] Script de démo.

---

# 38. Script de démonstration CRM Lite

## Démo de 8 minutes

1. Ouvrir le dashboard CRM et montrer tâches en retard, offres à relancer et marge potentielle.
2. Ouvrir `Hôtel des Ardennes` et montrer la vue 360.
3. Ajouter un contact `Jean Martin - Chef de cuisine`.
4. Journaliser un appel avec résultat `meeting_booked`.
5. Créer dans le même flux une visite/dégustation.
6. Ouvrir l’agenda et montrer la tâche.
7. Depuis le client, créer une offre avec contact et établissement préremplis.
8. Envoyer l’offre en mode email log.
9. Montrer la tâche automatique et la timeline.
10. Accepter l’offre depuis la page publique.
11. Revenir dans le CRM : tâche clôturée, événement visible, proposition de passage au statut client.

## Message commercial

> BlueMargin ne vous dit pas seulement quelle marge vous réalisez. Il vous indique maintenant quel client relancer, avec quelle offre et quelle prochaine action.

---

# 39. Prompt de départ recommandé

> Tu es le lead engineer de BlueMargin. Le MVP 1.0 est déjà fonctionnel. Implémente uniquement l’extension CRM Lite décrite dans `BlueMargin_PRD_CRM_Lite_V1.1.md`, en conservant toutes les fonctionnalités existantes. Commence par auditer le dépôt et exécuter la baseline. Cartographie les noms réels avant toute migration. Ne recrée pas les clients, les offres, les alertes ou l’authentification. Utilise `customers` comme entreprise, conserve les snapshots d’offres, active RLS sur toutes les nouvelles tables et prouve la visibilité par portefeuille. Après chaque phase, exécute lint, typecheck, tests et build, puis mets à jour `PROGRESS.md` et `DECISIONS.md`. Ne commence pas le pipeline ou les opportunités. Ne passe à une phase que lorsque son gate est satisfait.

---

# 40. Livrables attendus de l’agent

- Dépôt mis à jour sans régression.
- Migrations Supabase ordonnées.
- Schéma ERD actualisé.
- Services et actions serveur.
- Interfaces CRM Lite.
- Seed et scénario de démonstration.
- Tests complets.
- README de migration et utilisation.
- Rapport de baseline avant/après.
- Liste des divergences du PRD.
- Résultats lint, typecheck, tests et build.
- URL preview testable.
- Limites et risques restants.
