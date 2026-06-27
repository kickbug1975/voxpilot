# Guide d'Import de Données - BlueMargin

Ce dossier contient des fichiers d'exemple pour vous aider à importer vos données dans BlueMargin.

## Types d'Imports Supportés

BlueMargin supporte deux grands types d'imports :
1. **Les tarifs fournisseurs** (fichiers Excel `.xlsx` ou CSV `.csv`) : pour mettre à jour vos prix d'achat, rendements, facteurs de conversion, etc.
2. **Les clients** (fichiers CSV `.csv`) : pour importer votre base de clients.

---

## 1. Import des Tarifs Fournisseurs

Vous trouverez deux exemples dans ce dossier :
- `tarif_oceannord_exemple.xlsx` : format Excel standard.
- `tarif_atlantique_exemple.csv` : format CSV (séparateur point-virgule `;`).

### Colonnes Recommandées & Correspondance

Lors de l'import, l'interface de BlueMargin vous permettra d'associer les colonnes de votre fichier aux champs de notre base de données. Voici la liste des champs gérés :

| Champ dans BlueMargin | Description / Contraintes | Exemple de valeur |
| :--- | :--- | :--- |
| **SKU Fournisseur** | Code unique de l'article chez le fournisseur. | `ON-1001` ou `ATL-5001` |
| **Libellé** | Nom/Désignation du produit. | `Filet de Cabillaud` |
| **Code EAN** | Code-barres standard (13 chiffres). Facultatif. | `3250390012345` |
| **Prix d'achat** | Prix d'achat unitaire (Brut). Requis. | `14.50` (Excel) ou `14,50` (CSV) |
| **Unité** | Unité d'achat (ex: `kg`, `colis`, `pièce`). | `kg` |
| **Facteur de conversion** | Coefficient pour convertir l'unité d'achat en unité de vente. Par défaut `1.0`. | `1.0` |
| **Rendement** | Coefficient de rendement après découpe ou parage (entre `0.0` et `1.0`). | `0.85` (soit 85% de rendement) |
| **Coût transport** | Coût logistique ou de transport unitaire additionnel. | `0.50` |
| **Date de tarif** | Date d'effet du prix (format `AAAA-MM-JJ` conseillé). | `2026-06-22` |

### Formats des Nombres et des Dates (CSV)
- **Séparateur de décimales** : Le point (`.`) ou la virgule (`,`) sont tous deux détectés par notre parseur.
- **Format de Date** : Le format standard recommandé est `AAAA-MM-JJ` (ex: `2026-06-22`), mais les formats `JJ/MM/AAAA` sont également supportés.

---

## 2. Import des Clients

Le fichier `clients_exemple.csv` illustre le format d'importation des comptes clients.

### Colonnes Disponibles

| Champ dans BlueMargin | Description / Contraintes | Exemple de valeur |
| :--- | :--- | :--- |
| **Code** | Identifiant unique du client dans votre ERP. | `CLI-001` |
| **Raison sociale** | Nom légal de l'entreprise. Requis. | `Le Bistrot de la Mer` |
| **TVA** | Numéro de TVA intracommunautaire. | `BE0123456789` |
| **Email** | Adresse email principale pour l'envoi des devis. | `contact@bistrotmer.be` |
| **Téléphone** | Numéro de téléphone de contact. | `+3225551234` |
| **Segment** | Catégorie de client. Doit être l'une des valeurs suivantes : `horeca`, `retail`, `collectivite`, `grossiste`, `autre`. | `horeca` |
| **Conditions de paiement** | Description textuelle des conditions de règlement. | `30 jours fin de mois` |
| **Adresse Facturation** | Adresse complète pour la facturation. | `12 Rue des Brasseurs, 1000 Bruxelles` |
| **Adresse Livraison** | Adresse de livraison par défaut. | `12 Rue des Brasseurs, 1000 Bruxelles` |

---

## Conseils pour un Import Réussi

1. **En-têtes de colonnes** : Veillez à ce que la première ligne de votre fichier contienne des en-têtes clairs. L'outil d'import automatique de BlueMargin tentera de pré-sélectionner les correspondances (ex: "SKU" associé à "SKU Fournisseur").
2. **Encodage** : Exportez vos fichiers CSV en encodage **UTF-8** pour garantir le bon affichage des caractères accentués (é, è, à, etc.).
3. **Valeurs manquantes** : Si des informations facultatives (ex: TVA, EAN) manquent, laissez la cellule vide.
