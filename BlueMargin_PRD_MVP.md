# BlueMargin - Product Requirements Document (PRD)

**Version :** 1.0  
**Statut :** Prêt pour implémentation MVP  
**Langue produit :** français (architecture préparée pour l'internationalisation)  
**Marché initial :** Belgique francophone  
**Cible initiale :** grossistes et distributeurs B2B de produits alimentaires frais ou surgelés  
**Type de produit :** SaaS web multi-tenant, desktop-first, responsive  
**Objectif de ce document :** permettre à un agent de vibe coding de livrer une application testable de bout en bout sans devoir réinterpréter le produit.

---

# 1. Résumé exécutif

BlueMargin est un SaaS B2B de protection de marge et de création d'offres commerciales pour les distributeurs alimentaires. Le produit transforme des listes de prix fournisseurs souvent gérées dans Excel en informations commerciales directement exploitables : variations de coût, marge réelle, prix de vente recommandé, alertes de sous-marge, tarifs clients et offres PDF.

Le MVP doit permettre à une entreprise de :

1. créer son organisation et inviter des utilisateurs ;
2. enregistrer ses fournisseurs, clients et produits ;
3. importer une liste de prix fournisseur au format CSV ou XLSX ;
4. faire correspondre les lignes importées aux produits internes ;
5. calculer un coût rendu et une marge de façon déterministe ;
6. définir des objectifs de marge globaux ou propres à un client ;
7. produire une offre client en quelques minutes ;
8. exporter l'offre en PDF et CSV/XLSX ;
9. envoyer ou partager une offre via un lien public sécurisé ;
10. visualiser les lignes à risque et la marge potentiellement protégée.

Le produit n'est pas un ERP. Il ne gère ni stock, ni comptabilité, ni facturation légale, ni lots, ni traçabilité sanitaire. Il se place au-dessus des outils existants et doit fournir une valeur visible en moins de 30 minutes après inscription.

---

# 2. Vision produit

## 2.1 Vision

Devenir la couche de décision tarifaire la plus simple pour les distributeurs alimentaires européens qui veulent protéger leur marge sans remplacer leur ERP.

## 2.2 Promesse principale

> Chaque prix protège votre marge.

## 2.3 Proposition de valeur

BlueMargin permet à un responsable commercial ou dirigeant de transformer une hausse fournisseur en nouveaux prix clients cohérents, explicables et exportables, sans manipulations répétitives dans Excel.

## 2.4 Job-to-be-done principal

> Lorsque mes fournisseurs modifient leurs prix, je veux connaître immédiatement l'impact sur mes marges et générer des tarifs clients actualisés, afin de ne pas vendre sous mon seuil de rentabilité.

## 2.5 Principes produit

- **Valeur avant sophistication :** chaque fonction doit réduire un risque de marge ou accélérer une vente.
- **Calculs explicables :** toute recommandation de prix doit pouvoir être retracée jusqu'au coût et à la règle appliquée.
- **IA non critique :** aucune formule financiere ne dépend d'un modèle generatif.
- **Import avant intégration :** le MVP fonctionne avec CSV/XLSX avant toute connexion ERP.
- **Contrôle humain :** toute correspondance incertaine et toute recommandation peuvent être validées ou modifiées.
- **Multi-tenant sécurisé :** aucune donnée ne doit pouvoir traverser les frontières d'une organisation.
- **French-first :** libellés, formats et exemples adaptés à la Belgique francophone.

---

# 3. Objectifs et indicateurs

## 3.1 Objectifs MVP

- Permettre un premier calcul de marge en moins de 30 minutes après inscription.
- Reduire d'au moins 70 % le temps nécessaire pour transformer un tarif fournisseur en offre client.
- Detecter toutes les lignes dont la marge est inférieure au seuil configuré.
- Générer une offre partageable en moins de 3 minutes à partir de produits déjà importes.
- Fournir une démo complète avec données fictives, sans configuration externe obligatoire.

## 3.2 Indicateurs produit

| Indicateur | Définition | Cible pilote |
|---|---|---:|
| Time to first value | Temps entre inscription et premier calcul de marge | < 30 min |
| Import success rate | Imports termines sans erreur bloquante | > 90 % |
| Match confirmation rate | Lignes associées automatiquement ou confirmees | > 95 % |
| Quote création time | Temps median de création d'une offre | < 3 min |
| At-risk lines found | Nombre de lignes sous le seuil détectées | mesure absolue |
| Protected margin | Gain theorique entre prix actuel et prix recommandé | mesure en EUR |
| Weekly active organizations | Organisations avec au moins une action coeur/semaine | > 60 % pilotes |
| Quote export rate | Offres exportees ou envoyées | > 50 % |

## 3.3 Événements analytiques minimum

- `signup_completed`
- `onboarding_completed`
- `supplier_created`
- `customer_created`
- `product_created`
- `price_import_started`
- `price_import_completed`
- `price_import_failed`
- `match_review_completed`
- `margin_rule_updated`
- `quote_created`
- `quote_sent`
- `quote_exported_pdf`
- `quote_exported_xlsx`
- `public_quote_viewed`
- `public_quote_accepted`
- `public_quote_rejected`

Ne jamais envoyer de prix, coûts, noms de clients ou contenu d'offre dans les propriétés analytiques externes. Utiliser uniquement des identifiants techniques et des compteurs.

---

# 4. Utilisateurs et personas

## 4.1 Persona A - Dirigeant / administrateur

**Contexte :** PME de distribution de 5 a 50 collaborateurs.  
**Objectifs :** protéger la marge, harmoniser les pratiques, suivre les alertes, controler les accès.  
**Douleurs :** fichiers multiples, absence de vision consolidee, prix negocies oralement, risque d'erreur.  
**Droits :** accès complet, paramètres, équipe, suppression, règles globales.

## 4.2 Persona B - Responsable commercial

**Objectifs :** mettre à jour rapidement les offres, conserver une marge cible, donner une réponse rapide au client.  
**Douleurs :** recherche de prix, calculs manuels, versions incohérentes, mise en page.  
**Droits :** clients, produits, offres, imports, règles clients, sans gestion de facturation SaaS.

## 4.3 Persona C - Commercial terrain

**Objectifs :** créer une offre propre, connaître sa marge, partager un document.  
**Douleurs :** manque d'autonomie, attente de validation, erreurs de formule.  
**Droits :** lecture catalogue, création d'offres, modification de ses brouillons, aucune modification des coûts ou paramètres globaux sauf autorisation.

## 4.4 Persona D - Lecteur / analyste

**Objectifs :** consulter tableaux, alertes et offres.  
**Droits :** lecture seule, export autorisé selon configuration.

## 4.5 Rôles techniques

- `owner` : propriétaire unique de l'organisation, tous droits.
- `admin` : tous droits sauf transfert de propriété et suppression finale de l'organisation.
- `manager` : gestion des données commerciales et imports.
- `sales` : création et gestion de ses offres ; lecture des coûts configurable.
- `viewer` : lecture seule.

Les autorisations doivent être appliquees dans l'interface, les actions serveur et les politiques RLS.

---

# 5. Périmètre

## 5.1 Inclus dans le MVP

- Authentification email/mot de passe et lien magique.
- Création d'une organisation.
- Onboarding guide.
- Gestion des membres et invitations.
- Gestion fournisseurs.
- Gestion clients.
- Gestion catalogue produits.
- Import CSV/XLSX de prix fournisseur.
- Mapping manuel des colonnes.
- Normalisation et validation.
- Matching automatique déterministe.
- Écran de revue des correspondances.
- Historique des coûts.
- Calcul du coût rendu.
- Règles de marge globales, par client, catégorie et produit.
- Tableau des marges et alertes.
- Création, duplication et révision d'offres.
- Export PDF et XLSX/CSV.
- Envoi email ou mode simulation si aucun fournisseur email n'est configuré.
- Lien public d'offre avec accepter/refuser.
- Journal d'audit basique.
- Données de démonstration.
- Tests unitaires, intégration et E2E.
- Déploiement Vercel + Supabase.

## 5.2 Hors périmètre MVP

- Gestion de stock et inventaire.
- Bons de commande fournisseur.
- Factures clients conformes.
- Paiement de facture.
- Comptabilite.
- Traçabilite de lots et conformité sanitaire.
- Gestion des tournees ou transport.
- EDI complet.
- Connexions ERP natives.
- Application mobile native.
- Prevision de demande.
- Optimisation dynamique par elasticite prix.
- Multi-devise avancée.
- Multi-entite comptable dans une même organisation.
- Portail client complet.
- Signature électronique qualifiée.

## 5.3 Extensions post-MVP envisagees

- Connecteurs ERP et comptables.
- API publique.
- Tarification automatique selon segments.
- Simulation de hausse en masse.
- Workflow d'approbation.
- Catalogue multimedia.
- Commande directe depuis l'offre.
- Alertes WhatsApp.
- Multi-langue FR/NL/EN.
- Multi-devise et couverture de change.

---

# 6. Hypotheses et décisions structurantes

- Toutes les valeurs financières sont stockées hors TVA.
- La devise MVP est l'euro (`EUR`). Le schema accepte une devise mais les calculs multi-devises ne sont pas implémentés.
- Les prix sont stockes en `numeric(14,4)` ; les totaux affichés sont arrondis a 2 decimales.
- Le taux de marge par défaut est la marge sur prix de vente, pas le taux de marque sur coût.
- La TVA ne participe pas au calcul de marge.
- Une organisation possède un fuseau horaire, par défaut `Europe/Brussels`.
- Les dates sont stockées en UTC et affichées dans le fuseau de l'organisation.
- Les documents envoyes sont figés. Une modification après envoi créé une révision.
- Un import ne remplace jamais silencieusement des données historiques.
- Le MVP supporte les fichiers jusqu'à 10 000 lignes et 20 Mo.
- Les imports plus grands sont refuses avec un message explicite.
- Le système doit fonctionner sans OpenAI, Resend, Stripe, PostHog ou Sentry. Ces services sont des améliorations, pas des dépendances de fonctionnement local.

---

# 7. Glossaire métier

| Terme | Définition |
|---|---|
| Produit interne | Référence commerciale gérée par l'organisation. |
| Référence fournisseur | Representation d'un produit chez un fournisseur, avec SKU et conditionnement propres. |
| Unité d'achat | Unité dans laquelle le fournisseur facture : caisse, kg, piece, carton, palette. |
| Unité de vente | Unité utilisée dans l'offre client. |
| Facteur de conversion | Nombre d'unités de vente contenu dans une unité d'achat. |
| Coût d'achat | Prix fournisseur hors TVA pour l'unité d'achat. |
| Coût de base unitaire | Coût d'achat converti dans l'unité de vente. |
| Coût rendu | Coût de base unitaire augmenté des frais logistiques, manutention et autres frais. |
| Prix de vente | Prix client hors TVA par unité de vente. |
| Marge brute | Prix de vente moins coût rendu. |
| Taux de marge BlueMargin | Marge brute divisee par prix de vente. |
| Markup | Marge brute divisee par coût rendu. |
| Seuil de marge | Taux minimal accepte. |
| Prix recommandé | Prix minimum permettant d'atteindre la marge cible après arrondi. |
| Offre | Proposition commerciale non fiscale, partageable en PDF ou par lien. |
| Import | Ensemble versionné de lignes provenant d'un fichier fournisseur. |

---

# 8. Règles de calcul

## 8.1 Variables

- `purchase_price` : prix hors TVA de l'unité d'achat.
- `conversion_factor` : nombre d'unités de vente dans une unité d'achat.
- `yield_rate` : rendement utilisable entre 0 et 1, par défaut 1.
- `transport_cost_per_sales_unit` : frais de transport par unité de vente.
- `handling_cost_per_sales_unit` : manutention par unité de vente.
- `other_fixed_cost_per_sales_unit` : autres frais fixes par unité de vente.
- `other_cost_percent` : autres frais proportionnels appliqués au coût de base.
- `sales_price` : prix de vente hors TVA par unité de vente.
- `target_margin_rate` : cible comprise entre 0 et 0,95.

## 8.2 Formules

```text
base_unit_cost = purchase_price / conversion_factor
usable_unit_cost = base_unit_cost / yield_rate
percent_cost = usable_unit_cost * other_cost_percent
landed_cost = usable_unit_cost
              + transport_cost_per_sales_unit
              + handling_cost_per_sales_unit
              + other_fixed_cost_per_sales_unit
              + percent_cost

gross_margin_amount = sales_price - landed_cost
margin_rate = gross_margin_amount / sales_price
markup_rate = gross_margin_amount / landed_cost
recommended_raw_price = landed_cost / (1 - target_margin_rate)
recommended_price = apply_rounding_rule(recommended_raw_price)
protected_margin_per_unit = max(0, recommended_price - current_sales_price)
```

## 8.3 Cas limites

- Si `conversion_factor <= 0`, la ligne est invalide.
- Si `yield_rate <= 0` ou `yield_rate > 1`, la ligne est invalide.
- Si `sales_price <= 0`, le taux de marge est `null` et la ligne est signalée.
- Si `landed_cost < 0`, la ligne est invalide.
- Si `target_margin_rate >= 1`, le calcul est interdit.
- Si le prix de vente est inférieur au coût rendu, la marge est négative et affichée en rouge.
- Les divisions par zero ne doivent jamais remonter une erreur non gérée.

## 8.4 Arrondi des prix recommandés

Règles disponibles par organisation :

- `none` : arrondi monétaire standard a 0,01 EUR.
- `nearest_0_05` : multiple le plus proche de 0,05 EUR.
- `up_0_05` : multiple supérieur de 0,05 EUR.
- `nearest_0_10` : multiple le plus proche de 0,10 EUR.
- `up_0_10` : multiple supérieur de 0,10 EUR.
- `psychological_0_99` : prochain prix finissant par 0,99, uniquement si prix >= 1 EUR.

La valeur par défaut est `up_0_05` pour éviter que l'arrondi fasse repasser sous la marge cible.

## 8.5 Hiérarchie des règles de marge

La première règle applicable gagne :

1. surcharge manuelle sur une ligne d'offre ;
2. règle client + produit ;
3. règle client + catégorie ;
4. règle globale client ;
5. règle organisation + catégorie ;
6. règle globale organisation ;
7. valeur technique de secours : 20 %.

Chaque calcul enregistre `pricing_rule_source` et `pricing_rule_id` pour l'explicabilité.

## 8.6 Exemple de test

```text
Prix d'achat carton : 120,00 EUR
Conversion : 10 kg vendables
Rendement : 0,95
Transport : 0,20 EUR/kg
Manutention : 0,10 EUR/kg
Autres frais : 2 %
Cible de marge : 25 %

Cout de base = 120 / 10 = 12,0000
Cout utilisable = 12 / 0,95 = 12,6316
Frais proportionnels = 12,6316 * 0,02 = 0,2526
Cout rendu = 12,6316 + 0,20 + 0,10 + 0,2526 = 13,1842
Prix brut recommande = 13,1842 / 0,75 = 17,5789
Avec arrondi superieur a 0,05 = 17,60 EUR
Marge obtenue = (17,60 - 13,1842) / 17,60 = 25,09 %
```

Le test automatisé doit accepter une tolérance de 0,0001 sur les calculs intermédiaires.

---

# 9. Architecture fonctionnelle

## 9.1 Modules

1. Authentification et organisations.
2. Onboarding.
3. Fournisseurs.
4. Clients.
5. Catalogue produits.
6. Imports de prix.
7. Moteur de coût et marge.
8. Règles de tarification.
9. Offres.
10. Exports et partage.
11. Alertes et dashboard.
12. Paramètres et équipe.
13. Audit et observabilité.

## 9.2 Navigation principale

Barre latérale desktop :

- Tableau de bord
- Imports
- Produits
- Clients
- Fournisseurs
- Offres
- Alertes
- Paramètres

Barre supérieure :

- recherche globale ;
- bouton `Creer une offre` ;
- notifications ;
- menu utilisateur / organisation.

Sur mobile, utiliser un menu lateral repliable. Le MVP est optimisé pour écran >= 1024 px mais reste utilisable à partir de 390 px.

---

# 10. Parcours utilisateur

## 10.1 Inscription et onboarding

1. L'utilisateur s'inscrit.
2. Il confirme son email si requis.
3. Il créé son organisation : nom, TVA facultative, devise EUR, fuseau Europe/Brussels.
4. Il choisit une marge globale par défaut.
5. Il peut charger les données de démonstration ou commencer vide.
6. Le produit proposé trois actions : créer un fournisseur, importer un tarif, créer un client.
7. La checklist d'onboarding reste visible jusqu'à complétion ou masquage.

**Critere de succès :** un utilisateur peut charger les données démo et générer une offre sans fournir de clé externe.

## 10.2 Import d'un tarif fournisseur

1. Choisir un fournisseur existant ou le créer.
2. Charger CSV/XLSX.
3. Afficher un aperçu des 20 premières lignes.
4. Choisir la feuille XLSX si plusieurs feuilles.
5. Mapper les colonnes.
6. Valider les formats et afficher les erreurs.
7. Lancer la normalisation et le matching.
8. Revoir les lignes incertaines.
9. Confirmer l'import.
10. Créer les snapshots de prix et alertes.

Aucune donnée active n'est modifiée avant confirmation finale.

## 10.3 Création d'une offre

1. Choisir le client.
2. Definir titre, validité, devise, commentaire.
3. Ajouter des produits par recherche, filtre catégorie ou sélection multiple.
4. Le système affiché coût rendu, règle de marge, prix recommandé et prix proposé.
5. L'utilisateur ajuste quantité, prix, unité ou remise si autorisé.
6. Les lignes sous seuil sont visibles et exigent une justification si l'utilisateur choisit de continuer.
7. Enregistrer brouillon.
8. Aperçu PDF.
9. Envoyer, copier le lien public ou exporter.

## 10.4 Révision d'une offre envoyée

1. Une offre envoyée est non modifiable.
2. `Creer une revision` clone l'offre et ses lignes.
3. Le nouveau document porte `R2`, `R3`, etc.
4. L'ancienne révision reste accessible et conserve son lien.

## 10.5 Acceptation par le client

1. Le client ouvre un lien public contenant un jeton aléatoire.
2. Il consulte l'offre sans compte.
3. Il saisit nom, fonction facultative et commentaire.
4. Il accepte ou refuse.
5. BlueMargin enregistre date, adresse IP hachée ou tronquée, user-agent simplifié et décision.
6. Le commercial reçoit une notification interne et, si configuré, un email.

Cette acceptation n'est pas une signature électronique qualifiée. L'interface doit le dire clairement.

---

# 11. Exigences fonctionnelles détaillées

## 11.1 Authentification

### FR-AUTH-001
L'utilisateur peut s'inscrire avec email et mot de passe.

### FR-AUTH-002
L'utilisateur peut se connecter par lien magique.

### FR-AUTH-003
L'utilisateur peut réinitialiser son mot de passe.

### FR-AUTH-004
Une session invalide redirigé vers `/login` en conservant la destination demandee.

### FR-AUTH-005
Les pages publiques d'offre sont accessibles sans session uniquement avec un token validé.

### Critères d'acceptation

- Les erreurs d'authentification sont traduites en français.
- Aucun secret Supabase serveur n'est exposé au navigateur.
- La déconnexion invalide l'état local et redirigé vers `/login`.

## 11.2 Organisations et équipe

### FR-ORG-001
Le premier utilisateur créé une organisation et devient `owner`.

### FR-ORG-002
Un utilisateur peut appartenir à plusieurs organisations, mais l'interface doit toujours afficher l'organisation active.

### FR-ORG-003
Owner et admin peuvent inviter par email avec un rôle.

### FR-ORG-004
Une invitation expire après 7 jours et peut être renvoyee.

### FR-ORG-005
Owner peut changer le rôle, désactiver un membre et transferer la propriété.

### FR-ORG-006
L'organisation configuré : nom, logo, adresse, numéro TVA, email commercial, téléphone, marge par défaut, arrondi, délai de validité par défaut, visibilité des coûts pour les commerciaux.

## 11.3 Fournisseurs

### FR-SUP-001
CRUD fournisseur avec nom obligatoire.

### FR-SUP-002
Champs : code interne, nom, numéro TVA, email, téléphone, adresse, conditions, devise, actif/inactif.

### FR-SUP-003
Un fournisseur ne peut pas être supprime s'il possède des imports ; il est archivé.

### FR-SUP-004
La fiche fournisseur affiché derniers imports, nombre de références et date de dernière mise à jour.

## 11.4 Clients

### FR-CUS-001
CRUD client avec nom obligatoire.

### FR-CUS-002
Champs : code interne, raison sociale, nom commercial, TVA, email principal, emails CC, téléphone, adresse facturation, adresse de livraison, segment, commercial responsable, conditions, actif/inactif.

### FR-CUS-003
Segments par défaut : `horeca`, `retail`, `collectivite`, `grossiste`, `autre`.

### FR-CUS-004
La fiche client affiché règles de marge, offres récentes, valeur totale des offres, dernier contact d'offre et produits fréquents.

### FR-CUS-005
Le client peut avoir une marge globale spécifique.

## 11.5 Produits

### FR-PRO-001
CRUD produit interne.

### FR-PRO-002
Champs obligatoires : SKU interne, nom, unité de vente.

### FR-PRO-003
Champs facultatifs : catégorie, sous-catégorie, EAN, description, origine, espèce, calibre, marque, TVA, conditionnement, poids net, actif.

### FR-PRO-004
Un SKU est unique dans l'organisation, insensible à la casse.

### FR-PRO-005
Un produit peut être associé à plusieurs références fournisseurs.

### FR-PRO-006
La fiche produit affiché coût courant, historique, prix recommandé global, alertes, fournisseurs et offres récentes.

### FR-PRO-007
Un produit utilisé dans un document est archivé, jamais supprime physiquement.

## 11.6 Références fournisseurs

### FR-SPR-001
Une référence fournisseur relie un fournisseur à un produit interne.

### FR-SPR-002
Champs : SKU fournisseur, libellé fournisseur, EAN, unité d'achat, conversion, rendement, frais spécifiques, actif.

### FR-SPR-003
La combinaison fournisseur + SKU fournisseur est unique si le SKU est présent.

### FR-SPR-004
L'utilisateur peut changer le produit lié sans modifier les imports historiques.

## 11.7 Imports

### FR-IMP-001
Formats acceptes : `.csv`, `.xlsx`.

### FR-IMP-002
Taille max : 20 Mo ; lignes max : 10 000.

### FR-IMP-003
Pour CSV, détecter UTF-8, UTF-8 BOM, Windows-1252 et séparateurs virgule, point-virgule, tabulation.

### FR-IMP-004
Pour XLSX, proposer la feuille et ignorer les feuilles vides.

### FR-IMP-005
Colonnes mappables : SKU fournisseur, EAN, désignation, prix d'achat, unité d'achat, conditionnement, conversion, rendement, devise, date d'effet, catégorie, origine, calibre.

### FR-IMP-006
Colonnes minimales : désignation ou SKU, et prix d'achat.

### FR-IMP-007
L'interface mémorisé un modèle de mapping par fournisseur.

### FR-IMP-008
Chaque ligne reçoit un statut : `valid`, `warning`, `error`, `ignored`.

### FR-IMP-009
Les erreurs bloquantes incluent prix non numérique, conversion <= 0, ligne vide, devise non supportee.

### FR-IMP-010
L'utilisateur peut exclure une ligne ou corriger une valeur avant confirmation.

### FR-IMP-011
La confirmation créé un snapshot immuable et met à jour le coût courant de la référence fournisseur.

### FR-IMP-012
Une annulation avant confirmation ne modifie pas le catalogue.

### FR-IMP-013
Un import confirme ne peut pas être supprime par un rôle autre que owner ; une annulation administrative créé une entrée d'audit et recalcule le dernier prix actif.

## 11.8 Matching

### FR-MAT-001
Ordre de matching déterministe :

1. fournisseur + SKU exact normalisé ;
2. EAN exact ;
3. fournisseur + libellé normalisé exact ;
4. similarité de libellé + unité/conditionnement ;
5. aucune correspondance.

### FR-MAT-002
Score de confiance entre 0 et 1.

### FR-MAT-003
Seuils :

- `>= 0.95` : auto-match ;
- `0.75 a 0.9499` : confirmation requise ;
- `< 0.75` : non associé.

### FR-MAT-004
L'utilisateur peut : accepter, choisir un autre produit, créer un produit, ignorer.

### FR-MAT-005
Une décision manuelle est mémorisée pour les imports futurs du même fournisseur.

### FR-MAT-006
L'IA, si activée, peut suggérer une correspondance mais ne peut jamais auto-confirmer seule une ligne sous 0,95.

## 11.9 Règles de coût

### FR-COST-001
L'organisation possède des frais par défaut.

### FR-COST-002
Une référence fournisseur peut surcharger les frais.

### FR-COST-003
Le calcul affiché chaque composante du coût rendu.

### FR-COST-004
Toute modification des paramètres recalcule les vues actives mais ne modifie pas les snapshots d'offres envoyées.

## 11.10 Règles de marge

### FR-MAR-001
L'organisation configuré une marge globale.

### FR-MAR-002
Elle peut ajouter une règle par catégorie.

### FR-MAR-003
Un client peut surcharger la marge globale, par catégorie ou produit.

### FR-MAR-004
Les règles ont une date de début facultative et de fin facultative.

### FR-MAR-005
Deux règles de même niveau ne peuvent pas se chevaucher pour la même cible et période.

### FR-MAR-006
L'écran expliqué quelle règle a ete appliquée.

## 11.11 Tableau de marges

### FR-DAS-001
Afficher quatre KPI : marge moyenne pondérée, produits sous seuil, marge potentiellement protégée, offres ouvertes.

### FR-DAS-002
Afficher un tableau filtrable avec produit, fournisseur, ancien coût, nouveau coût, variation, prix courant, marge, cible, prix recommandé et écart.

### FR-DAS-003
Filtres : fournisseur, catégorie, statut risque, client, date d'import, recherche.

### FR-DAS-004
Tri par risque et export CSV.

### FR-DAS-005
La marge moyenne est pondérée par valeur si des quantités existent, sinon moyenne simple clairement étiquetée.

## 11.12 Alertes

Types MVP :

- `cost_increase` : hausse de coût supérieure au seuil.
- `below_margin` : prix courant sous la marge cible.
- `negative_margin` : prix sous le coût rendu.
- `unmatched_import_rows` : lignes non associées.
- `quote_expiring` : offre expire sous 48 heures.
- `quote_viewed` : offre vue pour la première fois.
- `quote_accepted` / `quote_rejected`.

### FR-ALT-001
Chaque alerte a priorité `low`, `medium`, `high`, `critical`.

### FR-ALT-002
L'utilisateur peut marquer comme lue, résolue ou ignorer.

### FR-ALT-003
Une alerte contient un lien vers l'objet concerné.

### FR-ALT-004
Les seuils de hausse sont configurables, par défaut 5 %.

## 11.13 Offres

### FR-QUO-001
Numéro d'offre automatique : `BM-YYYY-00001` par organisation.

### FR-QUO-002
Statuts : `draft`, `sent`, `viewed`, `accepted`, `rejected`, `expired`, `cancelled`.

### FR-QUO-003
Champs : numéro, client, contact, titre, date émission, date expiration, note publique, note interne, conditions, commercial, révision.

### FR-QUO-004
Une ligne contient snapshot produit, unité, quantité, coût rendu snapshot, prix recommandé snapshot, prix proposé, remise facultative, TVA informative, marge et justification.

### FR-QUO-005
La quantité est facultative pour une simple liste tarifaire. Si absente, aucun total de ligne n'est affiché.

### FR-QUO-006
L'utilisateur peut ordonner, dupliquer ou supprimer des lignes.

### FR-QUO-007
Une ligne sous seuil affiché un avertissement bloqueur pour un commercial et contournable par manager/admin avec justification obligatoire.

### FR-QUO-008
Le owner peut autorisér les commerciaux a depasser le seuil avec justification.

### FR-QUO-009
Une offre envoyée devient immuable.

### FR-QUO-010
La révision clone les snapshots et recalcule uniquement si l'utilisateur choisit `Actualiser les couts`.

### FR-QUO-011
L'offre peut être dupliquee vers un autre client ; les règles sont alors recalculées.

### FR-QUO-012
Le total hors TVA, TVA indicative et total TTC sont affichés seulement si toutes les lignes ont une quantité.

## 11.14 PDF et exports

### FR-EXP-001
Le PDF contient logo, émetteur, client, numéro, dates, tableau, conditions, note et coordonnées.

### FR-EXP-002
Le PDF ne montre jamais le coût ni la marge.

### FR-EXP-003
L'export XLSX client contient produits, description, unité, prix, validité et conditions, mais pas les coûts.

### FR-EXP-004
L'export interne peut inclure coûts et marges uniquement pour les rôles autorisés.

### FR-EXP-005
Nom de fichier : `BlueMargin_<numero>_<client>_<revision>.pdf`.

### FR-EXP-006
Les caractères spéciaux français doivent être correctement rendus.

## 11.15 Envoi email

### FR-EML-001
Avec Resend configuré, l'utilisateur peut envoyer l'offre au contact principal et CC.

### FR-EML-002
Sans Resend, l'action créé une simulation visible dans un `mail outbox` de développement et proposé de copier le texte.

### FR-EML-003
Le modèle inclut objet, message, lien public et PDF facultatif.

### FR-EML-004
L'utilisateur peut modifier le message avant envoi.

### FR-EML-005
Le système journalise succès ou échec sans stocker de contenu sensible chez l'outil analytique.

## 11.16 Lien public

### FR-PUB-001
Le lien utilisé un token aléatoire d'au moins 32 octets, stocké sous forme de hash.

### FR-PUB-002
Le token peut être révoque et régénéré.

### FR-PUB-003
Le lien expire à la date d'expiration de l'offre, avec option de prolongation.

### FR-PUB-004
Le client voit uniquement les données publiques de l'offre.

### FR-PUB-005
La première vue passe le statut de `sent` a `viewed`.

### FR-PUB-006
Accepter ou refuser requiert un nom et un consentement explicite.

### FR-PUB-007
La page affiché : `Cette action confirme votre intention commerciale et ne constitue pas une signature electronique qualifiee.`

## 11.17 Recherche globale

### FR-SRC-001
Recherche produits, clients, fournisseurs et offres.

### FR-SRC-002
Debounce 250 ms, maximum 8 résultats par type.

### FR-SRC-003
La recherche respecté strictement l'organisation active et les droits.

## 11.18 Audit

Actions journalisees : connexion sensible, création/modification/suppression logique, import confirme, modification de règle, envoi, acceptation, rôle change, export interne.

Chaque entrée contient : organisation, acteur, action, type objet, id objet, date, metadata minimale, adresse IP tronquée si disponible.

---

# 12. User stories prioritaires

## Epic A - Première valeur

### US-A1
En tant que dirigeant, je veux charger des données démo afin de comprendre la valeur sans préparér mes fichiers.

**Acceptation :** après un clic, le dashboard contient au moins 10 produits, 3 clients, 2 fournisseurs, 1 import, 2 offres et 5 alertes.

### US-A2
En tant que manager, je veux importer un tarif afin de voir les hausses et nouveaux coûts.

**Acceptation :** fichier exemple de 20 lignes importe en moins de 20 secondes en environnement de test.

### US-A3
En tant que manager, je veux revoir les correspondances incertaines afin d'éviter une mise à jour du mauvais produit.

**Acceptation :** aucune ligne entre 0,75 et 0,95 ne peut être confirmée sans action explicite.

## Epic B - Protection de marge

### US-B1
En tant que dirigeant, je veux définir une marge par défaut afin d'harmoniser les prix.

### US-B2
En tant que commercial, je veux comprendre le prix recommandé afin de pouvoir l'expliquer.

**Acceptation :** un panneau détaillé montre formule, coûts et règle appliquée.

### US-B3
En tant que manager, je veux filtrer les produits sous seuil afin de traiter les risques les plus importants.

## Epic C - Offre commerciale

### US-C1
En tant que commercial, je veux ajouter plusieurs produits à une offre afin de repondre vite.

### US-C2
En tant que manager, je veux empecher un prix sous seuil sans justification afin de controler la marge.

### US-C3
En tant que commercial, je veux générer un PDF professionnel afin de l'envoyer au client.

### US-C4
En tant que client, je veux consulter et accepter une offre sans créer de compte.

## Epic D - Gouvernance

### US-D1
En tant que owner, je veux controler qui voit les coûts afin de protéger une information sensible.

### US-D2
En tant que owner, je veux consulter l'audit afin de comprendre qui a modifie un prix ou une règle.

---

# 13. Spécifications UX/UI

## 13.1 Identite visuelle

- Nom : BlueMargin.
- Ton : fiable, direct, financier, moderne.
- Couleur principale : bleu marine profond.
- Accent : turquoise.
- Danger : corail/rouge uniquement pour les risques.
- Succès : vert.
- Fond : blanc casse ou gris tres clair.
- Police : Inter ou police système équivalente.
- Rayon : 8 a 12 px.
- Ombres discrètes.

Variables conseillees :

```css
--brand-900: #0B1F33;
--brand-700: #123A5A;
--accent-500: #1FB7B1;
--success-600: #16845B;
--warning-600: #C77A00;
--danger-600: #D64747;
--surface: #F7F9FB;
--text: #15202B;
```

Des couleurs équivalents sont acceptables si le contraste WCAG AA est respecté.

## 13.2 Principes d'interface

- Montrer les euros et le risque avant les graphiques.
- Un seul CTA principal par écran.
- Les coûts sont masqués si le rôle ne peut pas les voir.
- Chaque état vide proposé une prochaine action.
- Chaque erreur d'import expliqué la ligne et la correction.
- Les tableaux utilisent en-tête fixe, pagination ou virtualisation au-dela de 200 lignes.
- Les colonnes critiques restent visibles : produit, coût, prix, marge, statut.
- Tous les formulaires ont validation inline et message global.

## 13.3 Écrans a construire

### E01 - Login

- Logo et promesse.
- Email, mot de passe.
- Lien magique.
- Mot de passe oublie.
- Lien inscription.

### E02 - Inscription

- Nom, email, mot de passe, acceptation CGU/confidentialite.

### E03 - Création organisation

- Nom, TVA, pays, fuseau, marge par défaut, arrondi.

### E04 - Onboarding

Checklist : organisation, fournisseur, import, client, première offre.

### E05 - Dashboard

KPI : marge moyenne, lignes sous seuil, marge protégée, offres actives.  
Sections : alertes critiques, variations récentes, offres récentes, progression onboarding.

### E06 - Liste imports

Colonnes : fichier, fournisseur, statut, lignes, valides, erreurs, date, auteur.

### E07 - Assistant import

Etapes : fichier, feuille, mapping, validation, matching, confirmation, resultat.

### E08 - Catalogue produits

Recherche, filtres, import/export, sélection multiple, statut risque.

### E09 - Fiche produit

Résumé, coût courant, détail coût, historique, fournisseurs, règles, offres.

### E10 - Clients

Liste et fiche avec marges, contacts et offres.

### E11 - Fournisseurs

Liste et fiche avec références et imports.

### E12 - Tableau marges

Tableau principal, filtres, détail lateral, action `Creer une offre avec la selection`.

### E13 - Liste offres

Filtres statut/client/commercial/date, duplication, export.

### E14 - Editeur d'offre

En-tete client, paramètres, recherche produits, tableau editable, panneau résumé, controles de seuil.

### E15 - Aperçu offre

Representation proche du PDF, options envoyer/exporter/lien.

### E16 - Page publique offre

Branding, details, produits, totaux, conditions, accepter/refuser.

### E17 - Alertes

Flux filtre par priorité/type/statut.

### E18 - Paramètres organisation

Profil, tarification, coûts, documents, email, sécurité, équipe.

### E19 - Journal audit

Table filtrable réservée owner/admin.

### E20 - Dev mail outbox

Disponible uniquement en développement ou si `EMAIL_MODE=log`.

## 13.4 Etats UI obligatoires

Pour chaque page de données :

- chargement avec skeleton ;
- vide avec CTA ;
- erreur récupérable ;
- erreur non autorisée ;
- données chargees ;
- action en cours ;
- action réussie via toast ;
- confirmation pour action destructive.

## 13.5 Accessibilité

- Navigation clavier complète.
- Labels explicites.
- Focus visible.
- Contraste WCAG AA.
- Ne jamais utiliser la couleur comme seul indicateur.
- Tables avec en-têtes semantiques.
- Dialogues avec focus trap.
- Messages d'erreur associés aux champs.
- PDF lisible et sélectionnable.

---

# 14. Modele de données

Toutes les tables métier contiennent `id uuid primary key default gen_random_uuid()`, `organization_id uuid not null`, `created_at timestamptz`, `updated_at timestamptz` sauf mention contraire.

## 14.1 `organizations`

- `id`
- `name text not null`
- `slug text unique not null`
- `country_code char(2) default 'BE'`
- `currency char(3) default 'EUR'`
- `timezone text default 'Europe/Brussels'`
- `vat_number text`
- `address jsonb`
- `phone text`
- `commercial_email text`
- `logo_path text`
- `default_margin_rate numeric(6,5) default 0.20`
- `default_rounding_rule text default 'up_0_05'`
- `default_quote_validity_days int default 14`
- `cost_increase_alert_rate numeric(6,5) default 0.05`
- `sales_can_view_costs boolean default true`
- `sales_can_override_floor boolean default false`
- `onboarding_completed_at timestamptz`
- `created_by uuid`

## 14.2 `profiles`

- `id uuid primary key references auth.users(id)`
- `full_name text`
- `phone text`
- `locale text default 'fr-BE'`
- `last_active_organization_id uuid`
- `created_at`, `updated_at`

## 14.3 `organization_memberships`

- `organization_id`
- `user_id`
- `role enum owner/admin/manager/sales/viewer`
- `status enum active/invited/disabled`
- `invited_by`
- `invited_at`
- `joined_at`
- unique `(organization_id, user_id)`

## 14.4 `organization_invitations`

- `organization_id`
- `email citext`
- `role`
- `token_hash text`
- `expires_at`
- `accepted_at`
- `invited_by`

## 14.5 `suppliers`

- `code text`
- `name text not null`
- `vat_number text`
- `email text`
- `phone text`
- `address jsonb`
- `currency char(3) default 'EUR'`
- `payment_terms text`
- `notes text`
- `is_active boolean default true`
- unique organisation + lower(code) si code non null.

## 14.6 `customers`

- `code text`
- `legal_name text not null`
- `trade_name text`
- `vat_number text`
- `primary_email text`
- `cc_emails text[] default '{}'`
- `phone text`
- `billing_address jsonb`
- `shipping_address jsonb`
- `segment text`
- `owner_user_id uuid`
- `payment_terms text`
- `public_notes text`
- `internal_notes text`
- `is_active boolean default true`

## 14.7 `product_categories`

- `name text not null`
- `parent_id uuid null`
- `sort_order int default 0`
- unique organisation + parent + lower(name).

## 14.8 `products`

- `internal_sku citext not null`
- `name text not null`
- `description text`
- `category_id uuid`
- `ean text`
- `sales_unit enum kg/unit/box/carton/liter/pallet/other`
- `sales_unit_label text`
- `vat_rate numeric(5,4) default 0.06`
- `brand text`
- `origin text`
- `species text`
- `grade text`
- `packaging text`
- `net_weight numeric(12,4)`
- `is_active boolean default true`
- unique `(organization_id, internal_sku)`.

## 14.9 `supplier_products`

- `supplier_id uuid not null`
- `product_id uuid not null`
- `supplier_sku citext`
- `supplier_label text`
- `ean text`
- `purchase_unit text not null`
- `conversion_factor numeric(12,4) default 1`
- `yield_rate numeric(8,6) default 1`
- `transport_cost numeric(14,4) default 0`
- `handling_cost numeric(14,4) default 0`
- `other_fixed_cost numeric(14,4) default 0`
- `other_cost_percent numeric(8,6) default 0`
- `current_purchase_price numeric(14,4)`
- `current_landed_cost numeric(14,4)`
- `current_price_effective_at date`
- `is_active boolean default true`

## 14.10 `import_templates`

- `supplier_id`
- `name`
- `file_type`
- `sheet_name`
- `delimiter`
- `mapping jsonb`
- `settings jsonb`
- `last_used_at`

## 14.11 `price_imports`

- `supplier_id`
- `file_name`
- `file_path`
- `file_hash text`
- `file_type`
- `sheet_name`
- `status enum uploaded/mapping/validating/review/confirmed/failed/cancelled`
- `total_rows int`
- `valid_rows int`
- `warning_rows int`
- `error_rows int`
- `ignored_rows int`
- `mapping jsonb`
- `started_by uuid`
- `confirmed_by uuid`
- `confirmed_at`
- `failure_reason text`

## 14.12 `price_import_rows`

- `price_import_id`
- `row_number int`
- `raw_data jsonb`
- `normalized_data jsonb`
- `supplier_sku text`
- `ean text`
- `label text`
- `purchase_price numeric(14,4)`
- `currency char(3)`
- `purchase_unit text`
- `conversion_factor numeric(12,4)`
- `yield_rate numeric(8,6)`
- `effective_date date`
- `validation_status enum valid/warning/error/ignored`
- `validation_errors jsonb`
- `match_status enum auto_matched/review_required/matched/create_new/ignored/unmatched`
- `matched_product_id uuid`
- `matched_supplier_product_id uuid`
- `match_score numeric(5,4)`
- `match_method text`
- `manual_decision_by uuid`

## 14.13 `price_snapshots`

- `supplier_product_id`
- `price_import_id`
- `source_row_id`
- `purchase_price numeric(14,4)`
- `base_unit_cost numeric(14,4)`
- `landed_cost numeric(14,4)`
- `currency char(3)`
- `effective_date date`
- `calculation_breakdown jsonb`
- `is_active boolean default true`

Un trigger ou une transaction garantit un seul snapshot actif par référence fournisseur.

## 14.14 `margin_rules`

- `scope enum organization_category/customer/customer_category/customer_product`
- `customer_id uuid`
- `category_id uuid`
- `product_id uuid`
- `target_margin_rate numeric(6,5)`
- `valid_from date`
- `valid_to date`
- `priority int default 0`
- `is_active boolean default true`
- `created_by uuid`

Ajouter une contrainte logique selon le scope.

## 14.15 `product_sales_prices`

Prix courant facultatif utilisé pour comparer la marge hors offre.

- `product_id`
- `customer_id uuid null` (null = global)
- `sales_price numeric(14,4)`
- `effective_from date`
- `effective_to date`
- `source text`
- `is_active boolean`

## 14.16 `quotes`

- `quote_number text not null`
- `revision int default 1`
- `parent_quote_id uuid`
- `customer_id uuid not null`
- `contact_name text`
- `contact_email text`
- `title text not null`
- `status enum draft/sent/viewed/accepted/rejected/expired/cancelled`
- `issue_date date`
- `expires_at timestamptz`
- `currency char(3) default 'EUR'`
- `public_note text`
- `internal_note text`
- `terms text`
- `sales_owner_id uuid`
- `subtotal numeric(14,2)`
- `tax_total numeric(14,2)`
- `grand_total numeric(14,2)`
- `has_complete_quantities boolean`
- `public_token_hash text`
- `public_token_expires_at timestamptz`
- `sent_at`, `viewed_at`, `accepted_at`, `rejected_at`
- `locked_at timestamptz`

Unique `(organization_id, quote_number, revision)`.

## 14.17 `quote_items`

- `quote_id`
- `position int`
- `product_id uuid`
- `product_snapshot jsonb not null`
- `description text`
- `sales_unit text`
- `quantity numeric(12,3)`
- `landed_cost_snapshot numeric(14,4)`
- `target_margin_rate numeric(6,5)`
- `pricing_rule_source text`
- `pricing_rule_id uuid`
- `recommended_price numeric(14,4)`
- `unit_price numeric(14,4)`
- `discount_rate numeric(6,5) default 0`
- `net_unit_price numeric(14,4)`
- `margin_amount numeric(14,4)`
- `margin_rate numeric(8,6)`
- `tax_rate numeric(5,4)`
- `line_subtotal numeric(14,2)`
- `override_justification text`
- `created_by uuid`

## 14.18 `quote_events`

- `quote_id`
- `event_type`
- `actor_type enum user/customer/system`
- `actor_user_id uuid`
- `actor_name text`
- `metadata jsonb`
- `occurred_at`

## 14.19 `alerts`

- `type`
- `priority`
- `status enum unread/read/resolved/ignored`
- `title`
- `message`
- `entity_type`
- `entity_id`
- `assigned_to uuid`
- `metadata jsonb`
- `read_at`, `resolved_at`

## 14.20 `documents`

- `entity_type`
- `entity_id`
- `document_type enum quote_pdf/internal_export/import_source`
- `storage_path`
- `mime_type`
- `size_bytes`
- `checksum`
- `created_by`

## 14.21 `email_messages`

- `quote_id`
- `provider`
- `provider_message_id`
- `to_emails text[]`
- `cc_emails text[]`
- `subject text`
- `status enum queued/sent/failed/logged`
- `error_message text`
- `sent_by`
- `sent_at`

Le corps peut être stocké au maximum 90 jours, configurable. En mode production, privilegier un snapshot minimal ou chiffre.

## 14.22 `audit_logs`

- `actor_user_id`
- `action text`
- `entity_type text`
- `entity_id uuid`
- `metadata jsonb`
- `ip_prefix text`
- `user_agent_family text`
- `created_at`

Interdire update/delete par les utilisateurs applicatifs.

---

# 15. Index et contraintes

Index obligatoires :

- Toutes les tables par `organization_id`.
- `products (organization_id, internal_sku)` unique.
- `products (organization_id, lower(name))`.
- `customers (organization_id, lower(legal_name))`.
- `suppliers (organization_id, lower(name))`.
- `supplier_products (organization_id, supplier_id, supplier_sku)`.
- `price_import_rows (price_import_id, row_number)` unique.
- `price_snapshots (supplier_product_id, effective_date desc)`.
- `quotes (organization_id, status, created_at desc)`.
- `alerts (organization_id, status, priority, created_at desc)`.
- `audit_logs (organization_id, created_at desc)`.

Utiliser `citext` pour emails et SKU lorsque pertinent. Installer extensions `pgcrypto`, `citext`, `pg_trgm`.

---

# 16. Sécurité et RLS

## 16.1 Règle absolue

Toute table contenant `organization_id` doit avoir RLS activée. L'accès exige une membership `active` dans l'organisation correspondante.

## 16.2 Fonctions SQL recommandees

```sql
is_org_member(org_id uuid)
has_org_role(org_id uuid, allowed_roles text[])
can_view_costs(org_id uuid)
current_user_role(org_id uuid)
```

Ces fonctions doivent être `security definer`, définir explicitement `search_path`, et être testees.

## 16.3 Politiques

- Lecture : membre actif.
- Ecriture générale : owner/admin/manager.
- Offres : sales peut créer et modifier ses brouillons ; manager/admin/owner toutes les offres.
- Coûts : si `sales_can_view_costs=false`, ne pas exposer les colonnes via vue/API. Ne pas compter uniquement sur le masquage UI.
- Paramètres : owner/admin.
- Audit : owner/admin en lecture ; insertion uniquement par fonctions serveur.
- Page publique : accès uniquement via fonction serveur utilisant token hash et projection de champs publics.

## 16.4 Secrets

- `SUPABASE_SERVICE_ROLE_KEY` uniquement côté serveur.
- Cle OpenAI uniquement côté serveur.
- Cle Resend uniquement côté serveur.
- Webhook Stripe vérifie par signature.
- Aucun secret dans les variables prefixees `NEXT_PUBLIC_` sauf URL Supabase et clé publique/publishable.

## 16.5 Stockage

Buckets :

- `org-logos` : lecture publique optionnelle, ecriture restreinte.
- `import-files` : privé, URL signée courte.
- `quote-documents` : privé, téléchargement via route autorisée ou URL signée courte.

Chemin obligatoire : `<organization_id>/<entity_id>/<filename>`.

## 16.6 Protection publique

- Rate limiting sur pages et actions publiques.
- Token impossible a énumérer.
- Reponses identiques pour token inconnu ou expire.
- Protection CSRF pour actions mutantes.
- Sanitisation de tous les textes inseres dans HTML/PDF.
- Pas d'exécution de formule lors de la lecture XLSX/CSV.
- Prefixer par apostrophe les cellules exportees commençant par `=`, `+`, `-`, `@` pour éviter CSV injection.

---

# 17. Architecture technique recommandée

## 17.1 Stack

- **Framework :** Next.js App Router, TypeScript strict.
- **UI :** Tailwind CSS + shadcn/ui + Lucide.
- **Backend :** Route Handlers et Server Actions Next.js.
- **Base/Auth/Storage :** Supabase Postgres, Auth, Storage.
- **Validation :** Zod.
- **Formulaires :** React Hook Form ou formulaires React natifs selon composant.
- **Tables :** TanStack Table.
- **Parsing :** SheetJS (`xlsx`) pour XLSX, Papa Parse pour CSV.
- **PDF :** `@react-pdf/renderer`.
- **XLSX export :** `exceljs`.
- **Email :** Resend avec adaptateur `log` local.
- **IA optionnelle :** OpenAI Responses API derrière interface provider.
- **Analytics optionnel :** PostHog, désactivé sans clé.
- **Monitoring optionnel :** Sentry, désactivé sans DSN.
- **Tests :** Vitest, Testing Library, Playwright.
- **Déploiement :** Vercel + Supabase région UE.

Initialiser avec les versions stables disponibles au moment de l'implémentation, committer le lockfile et ne pas utiliser de versions canary.

## 17.2 Architecture logique

```text
Browser
  -> Next.js App Router
      -> Server Components pour lecture
      -> Server Actions/Route Handlers pour mutations
      -> Domain services
          -> Supabase Postgres/RLS
          -> Supabase Storage
          -> Email adapter (Resend ou log)
          -> AI adapter (OpenAI ou heuristique)
          -> PDF/XLSX generators
```

## 17.3 Règles de code

- TypeScript `strict: true`.
- Aucun `any` sauf commentaire justifie.
- Logique métier dans `src/domain`, pas dans les composants.
- Calculs financiers dans fonctions pures avec tests.
- Accès DB dans repositories/services.
- Validation Zod à chaque frontière.
- Toutes les mutations vérifient utilisateur, organisation et rôle côté serveur.
- Ne jamais faire confiance a `organization_id` envoyé par le navigateur sans vérification de membership.
- Utiliser des transactions pour confirmation import et envoi/verrouillage offre.

## 17.4 Arborescence cible

```text
src/
  app/
    (auth)/
      login/
      signup/
      forgot-password/
    (app)/
      [orgSlug]/
        dashboard/
        imports/
        products/
        customers/
        suppliers/
        quotes/
        alerts/
        settings/
      layout.tsx
    q/[token]/
    api/
      imports/
      quotes/
      webhooks/
  components/
    ui/
    layout/
    data-table/
    forms/
    charts/
  domain/
    pricing/
    imports/
    matching/
    quotes/
    alerts/
  lib/
    supabase/
    auth/
    permissions/
    email/
    ai/
    analytics/
    monitoring/
    files/
  repositories/
  actions/
  schemas/
  types/
  tests/
supabase/
  migrations/
  seed.sql
  functions/
scripts/
  create-demo-user.ts
  generate-sample-import.ts
public/
  samples/
```

---

# 18. Services de domaine

## 18.1 `PricingEngine`

Entrées : coût, frais, règle, arrondi, prix actuel.  
Sortie typée : coûts intermédiaires, prix recommandé, marge, markup, écart, statut risque, règle source.

Fonctions pures :

```ts
calculateLandedCost(input): LandedCostResult
calculateMargin(input): MarginResult
calculateRecommendedPrice(input): RecommendedPriceResult
applyRoundingRule(value, rule): Decimal
resolveMarginRule(context, rules): ResolvedRule
```

Utiliser `decimal.js` ou calcul decimal équivalent ; ne pas utiliser les flottants JS pour les montants critiques.

## 18.2 `ImportParser`

- Detecte format.
- Extrait feuilles/en-têtes.
- Retourne valeurs brutes sans évaluation de formule.
- Normalise nombres belges : `1.234,56`, `1234,56`, `1 234,56`.
- Reconnaît pourcentages `95%`, `0,95` selon colonne.
- Detecte dates raisonnablement.
- Ne devine jamais silencieusement un prix ambigu ; produit un warning.

## 18.3 `ProductMatcher`

- Normalise casse, accents, ponctuation, espaces, unités.
- Matching exact avant fuzzy.
- Similarite trigramme ou fonction testable.
- Bonus de score si EAN, unité, calibre ou conditionnement concordent.
- Penalite si unité incompatible.
- Retourne top 3 candidats avec explication.

## 18.4 `QuoteService`

- Créé numéro transactionnel.
- Snapshot produit/coût/règle.
- Recalcule ligne.
- Valide seuil et permission.
- Verrouille offre.
- Genere/révoque token public.
- Créé révision.
- Recalcule totaux.

## 18.5 `AlertService`

Idempotent : une même condition ne doit pas créer des dizaines d'alertes actives identiques. Utiliser une clé de déduplication.

---

# 19. Contrats API / actions serveur

Les noms exacts peuvent varier mais les comportements doivent rester.

## 19.1 Imports

### `POST /api/imports/preview`

Multipart : fichier, supplierId.  
Retour : metadata fichier, feuilles, aperçu, en-têtes, encodage, séparateur.

### `POST /api/imports`

Créé l'import et stocké le fichier privé.

### `POST /api/imports/:id/validate`

Body : mapping, sheet, options.  
Retour : compteurs, erreurs, lignes paginees.

### `PATCH /api/imports/:id/rows/:rowId`

Corrige, ignore ou associé une ligne.

### `POST /api/imports/:id/confirm`

Transaction : vérifie absence d'erreurs bloquantes, créé produits/références approuves, snapshots, alertes, met statut confirmed.

## 19.2 Pricing

### `POST /api/pricing/simulate`

Entree sans persistence ; retourne détail du calcul. Utile pour UI et tests.

### `GET /api/margins`

Filtres pagines. Retourne une projection autorisée selon rôle.

## 19.3 Offres

### `POST /api/quotes`

Créé brouillon.

### `PATCH /api/quotes/:id`

Modifie seulement un brouillon autorisé.

### `POST /api/quotes/:id/items`

Ajoute lignes avec snapshots.

### `POST /api/quotes/:id/send`

Valide, verrouille, génère PDF et lien, envoie ou logge.

### `POST /api/quotes/:id/revise`

Créé révision.

### `GET /api/quotes/:id/pdf`

Autorise puis stream PDF ; peut servir document cache.

### `POST /api/public/quotes/:token/decision`

Body : décision, name, rôle, comment, consent. Rate limited.

## 19.4 Webhooks

- `/api/webhooks/stripe` réservé post-MVP/billing skeleton.
- `/api/webhooks/resend` facultatif pour statut email.

Toutes les routes retournent un format d'erreur cohérent :

```json
{
  "error": {
    "code": "IMPORT_VALIDATION_FAILED",
    "message": "3 lignes contiennent des erreurs bloquantes.",
    "fieldErrors": {},
    "requestId": "..."
  }
}
```

---

# 20. IA optionnelle

## 20.1 Usages permis

- Suggérer le mapping de colonnes.
- Suggérer une correspondance produit.
- Générer un brouillon de message d'accompagnement.
- Resumer les principales variations de coût.

## 20.2 Usages interdits

- Calculer la marge finale.
- Modifier un prix sans validation.
- Confirmer automatiquement une ligne incertaine.
- Envoyer un email sans action utilisateur.
- Produire une décision de conformité légale.

## 20.3 Interface provider

```ts
interface AiProvider {
  suggestColumnMapping(input: MappingInput): Promise<MappingSuggestion>;
  suggestProductMatches(input: MatchInput): Promise<MatchSuggestion[]>;
  draftQuoteEmail(input: QuoteEmailInput): Promise<QuoteEmailDraft>;
  summarizeImport(input: ImportSummaryInput): Promise<string>;
}
```

Implementations :

- `HeuristicAiProvider` obligatoire et par défaut.
- `OpenAiProvider` active uniquement si `OPENAI_API_KEY` existe et feature flag active.

Les réponses IA doivent être validées avec Zod et rejetees si non conformes.

---

# 21. Données de démonstration

## 21.1 Organisation

`Demo Maree Belgique`  
Marge globale : 25 %  
Arrondi : supérieur 0,05 EUR.

## 21.2 Fournisseurs

- OceanNord Import
- Atlantique Frais

## 21.3 Clients

- Brasserie du Centre - horeca - marge 28 %
- Marché Gourmet - retail - marge 32 %
- Cuisine Collective Horizon - collectivité - marge 18 %

## 21.4 Produits minimum

- Saumon Atlantique filet 1,4/1,8 kg - kg
- Cabillaud dos 200/300 g - kg
- Crevettes grises cuites - kg
- Scampis 16/20 surgeles - carton
- Moules de Zelande jumbo - kg
- Thon albacore longe - kg
- Saint-Jacques sans corail - kg
- Calamars tubes U5 - carton
- Sole portion 300/400 g - kg
- Homard canadien vivant - kg

## 21.5 Scénario de démo

- Un import historique puis un nouvel import avec 4 hausses, 2 baisses, 1 nouvelle référence, 2 lignes incertaines et 1 erreur.
- Au moins 3 produits sous marge.
- Une offre brouillon et une offre envoyée.
- Une offre acceptee dans les événements de démo.

## 21.6 Fichiers exemples

Fournir dans `/public/samples` :

- `tarif_oceannord_exemple.xlsx`
- `tarif_atlantique_exemple.csv`
- `clients_exemple.csv`
- `README_IMPORTS.md`

---

# 22. Notifications et emails

## 22.1 Modèles minimum

1. Invitation d'équipe.
2. Offre envoyée au client.
3. Offre acceptee au commercial.
4. Offre refusee au commercial.
5. Offre expire bientot.
6. Reinitialisation gérée par Supabase Auth.

## 22.2 Objet offre

`Offre {{quote_number}} - {{organization_name}}`

## 22.3 Corps par défaut

Ton professionnel, court, modifiable. Inclure date de validité, bouton consulter, coordonnées du commercial. Ne pas inclure coût ou marge.

---

# 23. Exigences non fonctionnelles

## 23.1 Performance

- LCP cible < 2,5 s sur pages principales en connexion correcte.
- Interaction standard < 300 ms hors appels reseau.
- Requetes liste paginees ; aucun `select *` sur grandes tables.
- Import exemple 1 000 lignes < 20 s en environnement hébergé standard.
- Génération PDF 50 lignes < 5 s.
- Recherche globale < 1 s pour 10 000 produits.

## 23.2 Disponibilité et robustesse

- Erreurs externes Resend/OpenAI ne bloquent pas l'enregistrement.
- Retry contrôle pour email ; pas de retry infini.
- Transactions sur operations critiques.
- Idempotency key pour confirmation import, envoi offre et décision publique.
- État d'erreur récupérable après refresh.

## 23.3 Compatibilité

- Chrome, Edge, Safari, Firefox versions stables récentes.
- Écran desktop 1440x900 référence.
- Mobile 390x844 minimum.

## 23.4 Confidentialité

- Region UE pour base et stockage lorsque disponible.
- Politique de rétention configurable pour fichiers imports.
- Export des données organisation.
- Suppression organisation avec délai de sécurité post-MVP ; dans le MVP, demande de suppression et anonymisation manuelle documentée.
- Pas de données clients dans logs applicatifs.

## 23.5 Observabilite

- `requestId` pour erreurs serveur.
- Logs structures JSON en production.
- Sentry optionnel avec rédaction de PII.
- Health endpoint minimal ne revelant aucun secret.
- Tableau des imports échoués et emails échoués.

---

# 24. Tests

## 24.1 Tests unitaires obligatoires

- Toutes les formules de coût et marge.
- Toutes les règles d'arrondi.
- Hiérarchie des règles de marge.
- Normalisation des nombres belges.
- Normalisation des libellés.
- Matching exact et fuzzy.
- Permissions par rôle.
- Recalcul de lignes d'offre.
- Totaux avec et sans quantités.
- Génération de numéro d'offre.
- Hash et validation token public.

## 24.2 Tests intégration

- RLS : un utilisateur d'une organisation ne voit aucune donnée d'une autre.
- Sales sans coût ne reçoit pas le coût dans la réponse.
- Confirmation import créé snapshots et alertes en transaction.
- Echec transaction ne laisse pas de mise à jour partielle.
- Envoi offre verrouille le document.
- Révision ne modifie pas l'original.
- Token expire refuse l'accès.
- Décision publique idempotente.

## 24.3 Tests E2E Playwright

### E2E-01 - Démo rapide

1. Créer compte.
2. Créer organisation.
3. Charger démo.
4. Ouvrir dashboard.
5. Créer offre depuis produits à risque.
6. Exporter PDF.
7. Ouvrir lien public.
8. Accepter.
9. Verifier statut accepte.

### E2E-02 - Import complet

1. Créer fournisseur.
2. Charger fichier exemple.
3. Mapper colonnes.
4. Corriger une erreur.
5. Resoudre deux matches.
6. Confirmer.
7. Verifier historique et alertes.

### E2E-03 - Sécurité multi-tenant

1. Créer org A et org B.
2. Inserer client A.
3. Tenter accès depuis B par URL/id.
4. Attendre 404 ou 403 sans fuite de nom.

### E2E-04 - Seuil de marge

1. Sales créé ligne sous seuil.
2. Envoi bloque.
3. Manager ajoute justification.
4. Envoi reussi.

## 24.4 Fixtures calcul

Prevoir au moins 20 cas : marge positive, négative, zero, rendement, conversion, frais fixes, frais %, arrondis, prix minuscule, valeurs decimales, cible 0, cible 95 %, invalides.

## 24.5 Critere de qualite CI

- Lint sans erreur.
- Typécheck sans erreur.
- Tests unitaires verts.
- Tests intégration verts.
- E2E smoke vert.
- Migration testee sur base vide.
- Aucun secret dans dépôt.

---

# 25. Définition of Done du MVP

Le MVP est terminé uniquement si :

- un nouvel utilisateur peut s'inscrire ;
- une organisation peut être créée ;
- les données démo peuvent être chargees ;
- un fichier CSV et un XLSX exemples peuvent être importes ;
- les colonnes peuvent être mappées ;
- les erreurs et matches incertains peuvent être résolus ;
- la confirmation met à jour l'historique de prix ;
- les coûts et marges sont calcules avec tests ;
- des règles client et catégorie fonctionnent ;
- une offre peut être créée, exportee et partagée ;
- le client peut accepter/refuser ;
- les rôles et RLS sont testés ;
- le produit fonctionne sans OpenAI, Resend, Stripe, PostHog et Sentry ;
- un README permet à un développeur de lancer le projet en moins de 20 minutes ;
- le déploiement preview est accessible ;
- aucun bug bloquant P0/P1 n'est ouvert.

---

# 26. Priorisation MoSCoW

## Must

Auth, organisation, fournisseurs, clients, produits, imports CSV/XLSX, mapping, validation, matching, calculs, règles, dashboard marges, offres, PDF, lien public, rôles, RLS, démo, tests.

## Should

Email Resend, invitations, XLSX export, audit, alertes complètes, modèle mapping mémorisé, historique coût graphique.

## Could

IA OpenAI, PostHog, Sentry, Stripe skeleton, recherche globale avancée, logo PDF, vue mobile optimisée.

## Won't in MVP

ERP, stock, facturation, traçabilité, commande, application native, workflow complexe.

---

# 27. Plan d'implémentation pour agent de coding

## Phase 0 - Initialisation

1. Créer Next.js TypeScript strict.
2. Ajouter Tailwind et shadcn/ui.
3. Configurer ESLint, Prettier, Vitest, Playwright.
4. Configurer Supabase SSR.
5. Ajouter `.env.example` et validation des variables.
6. Créer layout, theme et routes vides.
7. Ecrire README de lancement.

**Gate :** app lancée localement, auth Supabase testable, CI de base verte.

## Phase 1 - Base et sécurité

1. Extensions Postgres.
2. Migrations tables principales.
3. Triggers `updated_at`.
4. Fonctions permissions.
5. RLS et tests multi-tenant.
6. Seed organisation démo.

**Gate :** test automatique prouve l'isolation entre deux organisations.

## Phase 2 - Catalogue

1. CRUD fournisseurs.
2. CRUD clients.
3. CRUD catégories/produits.
4. Références fournisseurs.
5. Permissions et archivage.

**Gate :** parcours CRUD complet et données démo visibles.

## Phase 3 - Pricing engine

1. Decimal library.
2. Fonctions pures.
3. 20+ tests.
4. Règles de marge.
5. Tableau marges initial.

**Gate :** exemples du PRD produisent exactement les résultats attendus.

## Phase 4 - Imports

1. Upload privé.
2. Aperçu CSV/XLSX.
3. Mapping.
4. Validation.
5. Matching.
6. Revue.
7. Confirmation transactionnelle.
8. Alertes.

**Gate :** E2E-02 vert.

## Phase 5 - Offres

1. Liste et éditeur.
2. Snapshot et calcul lignes.
3. Contrôle seuil.
4. PDF.
5. XLSX/CSV.
6. Verrouillage et révisions.

**Gate :** offre 50 lignes générée en PDF validé.

## Phase 6 - Partage

1. Token public hash.
2. Page publique.
3. Acceptation/refus.
4. Email adapter log.
5. Resend optionnel.
6. Notifications.

**Gate :** E2E-01 vert sans clé Resend.

## Phase 7 - Finition

1. Dashboard.
2. Audit.
3. Accessibilité.
4. Etats vides/erreurs.
5. Analytics/monitoring optionnels.
6. Documentation et démo script.
7. Audit sécurité.

**Gate :** Définition of Done complète.

---

# 28. Instructions d'exécution pour l'agent

- Ne pas développer une fonction hors périmètre sans finir les Must.
- Ne pas remplacer les calculs par des prompts IA.
- Après chaque phase, executer lint, typécheck et tests.
- Produire de petites migrations reversibles.
- Documenter toute divergence du PRD dans `DECISIONS.md`.
- Ne jamais désactiver RLS pour contourner un bug.
- Ne jamais exposer la service rôle key.
- Utiliser des données fictives uniquement.
- Conserver l'application exécutable à chaque commit.
- Ajouter un compte de démo via script et non un mot de passe en dur en production.
- Faire un commit logique par sous-phase si l'environnement le permet.

---

# 29. Variables d'environnement

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=

EMAIL_MODE=log
RESEND_API_KEY=
EMAIL_FROM=BlueMargin <offres@example.com>

AI_MODE=heuristic
OPENAI_API_KEY=
OPENAI_MODEL=

NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=
SENTRY_DSN=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER=

PUBLIC_QUOTE_TOKEN_PEPPER=
APP_ENCRYPTION_KEY=
```

Le projet doit valider les variables au démarrage. Les intégrations optionnelles ne doivent pas être requises en mode local.

---

# 30. README attendu

Le README doit contenir :

1. prérequis ;
2. installation ;
3. création projet Supabase ;
4. variables ;
5. migrations ;
6. seed ;
7. création compte démo ;
8. lancement local ;
9. tests ;
10. build ;
11. déploiement Vercel ;
12. mode email log ;
13. activation OpenAI ;
14. architecture ;
15. dépannage courant.

Commandes cibles :

```bash
pnpm install
supabase start
supabase db reset
pnpm demo:user
pnpm dev
pnpm test
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm build
```

Le projet peut proposer une alternative Supabase hébergée si Docker n'est pas disponible.

---

# 31. Script de démonstration commerciale

## Scénario de 7 minutes

1. Ouvrir le dashboard : montrer les lignes sous seuil et euros proteges.
2. Importer `tarif_oceannord_exemple.xlsx`.
3. Montrer le mapping mémorisé.
4. Resoudre une correspondance incertaine.
5. Confirmer et montrer la hausse du saumon.
6. Selectionner trois produits à risque et créer une offre pour Brasserie du Centre.
7. Montrer le prix recommandé et la règle client.
8. Tenter un prix sous seuil puis ajouter justification avec rôle manager.
9. Générer le PDF.
10. Ouvrir le lien public et accepter.
11. Revenir dans l'application et montrer le statut accepte.

## Resultat commercial a raconter

- temps économisé ;
- erreurs de marge détectées ;
- offre produite rapidement ;
- historique et justification conserves.

---

# 32. Critères d'acceptation de recette

## Recette R1 - Onboarding

- Compte et organisation créés.
- Données démo chargees sans erreur.
- Checklist progresse.

## Recette R2 - Import

- CSV belge avec virgules decimales reconnu.
- XLSX multi-feuilles reconnu.
- Mapping sauvegardé.
- Erreur ligne affichée.
- Match incertain bloque confirmation.
- Import confirme créé historique.

## Recette R3 - Pricing

- Coût rendu détaillé.
- Hiérarchie des règles respectée.
- Arrondi ne fait pas passer sous cible.
- Rôle sans coût ne voit aucune valeur de coût, y compris dans JSON et export.

## Recette R4 - Offre

- Création 10 lignes.
- Alerte sous marge.
- PDF sans coût.
- Envoi log local.
- Lien public.
- Acceptation et notification.
- Révision immuable.

## Recette R5 - Sécurité

- Accès cross-tenant impossible.
- URL objet d'une autre org retourne 404/403.
- Fichier privé inaccessible sans URL signée.
- Token expire refuse.
- CSV injection neutralisée.

---

# 33. Risques et mesures

| Risque | Impact | Mesure MVP |
|---|---:|---|
| Fichiers fournisseurs tres hétérogènes | Élevé | Mapping manuel, modèles memorises, validation explicite |
| Confusion marge/markup | Élevé | Afficher les deux, définir le taux principal, aide contextuelle |
| Erreur de conversion unité | Critique | Validation, formule visible, confirmation humaine |
| Vibe coding contourne RLS | Critique | Gate sécurité et tests multi-tenant avant UI avancée |
| Scope devient ERP | Élevé | MoSCoW strict et liste hors scope |
| IA hallucine une correspondance | Élevé | Heuristique d'abord, seuil, confirmation humaine |
| PDF casse avec accents | Moyen | Test snapshot et fichier de recette français |
| Envoi email bloque la démo | Moyen | Adaptateur log obligatoire |
| Données coût exposées à un sales | Critique | Vues/projections serveur + RLS + tests de payload |
| Imports lourds timeout | Moyen | Limite 10 000 lignes, traitement par lots, feedback progressif |

---

# 34. Décisions a ne pas réouvrir pendant le MVP

- Application web, pas mobile native.
- Next.js + Supabase.
- EUR et français d'abord.
- Prix hors TVA.
- Marge sur prix de vente comme indicateur principal.
- Imports fichiers avant intégrations.
- Offre commerciale, pas facture.
- Calculs déterministes.
- Page publique sans compte.
- Multi-tenant des le premier jour.
- Pas de queue externe obligatoire.

---

# 35. Questions produit a traiter après les premiers pilotes

Ces questions ne bloquent pas le MVP :

- Les clients veulent-ils un prix par kg et par colis simultanément ?
- Faut-il gérer des cours journaliers et validites intraday ?
- Quelle part des distributeurs possède déjà un ERP exportable ?
- Le workflow d'approbation est-il indispensable au-dela de 5 commerciaux ?
- Les offres doivent-elles devenir des commandes ?
- Le partage WhatsApp est-il prioritaire ?
- Quel niveau d'historique les clients veulent-ils conserver ?
- Les frais logistiques doivent-ils être répartis selon poids, valeur ou palette ?

---

# 36. Références techniques officielles

- Next.js App Router : https://nextjs.org/docs/app
- Guide Next.js pour agents IA : https://nextjs.org/docs/app/guides/ai-agents
- Supabase Auth avec Next.js : https://supabase.com/docs/guides/auth/quickstarts/nextjs
- Supabase Row Level Security : https://supabase.com/docs/guides/database/postgres/row-level-security
- shadcn/ui pour Next.js : https://ui.shadcn.com/docs/installation/next
- Stripe Billing subscriptions : https://docs.stripe.com/subscriptions

---

# 37. Prompt de départ recommandé pour l'agent

> Tu es le lead engineer de BlueMargin. Construis le MVP en suivant strictement le PRD. Commence par la phase 0 puis la phase 1. Ne développe aucune fonction hors périmètre. Les calculs financiers doivent être déterministes et testés. L'application doit fonctionner sans intégrations optionnelles. Active RLS sur toutes les tables multi-tenant et prouve l'isolation avec des tests. Après chaque phase, execute lint, typécheck et tests, puis mets à jour `PROGRESS.md`, `DECISIONS.md` et `README.md`. Ne passe à la phase suivante que lorsque le gate de la phase courante est satisfait.

---

# 38. Livrables attendus de l'agent

- Depot source complet.
- Migrations Supabase.
- Seed et fichiers exemples.
- `.env.example`.
- README opérationnel.
- `PROGRESS.md` avec checklist du PRD.
- `DECISIONS.md` avec écarts justifiés.
- Tests unitaires, intégration et E2E.
- URL de preview.
- Compte de démo créé par script.
- Rapport final : fonctions terminées, limites connues, résultats tests, risques restants.

---

**Fin du PRD BlueMargin MVP v1.0**
