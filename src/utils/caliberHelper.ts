/**
 * Helper utilitaire pour l'extraction et le calcul des poids (volumes en kg)
 * et des calibres à partir de la description textuelle des articles WhatsApp.
 */

// Poids unitaires moyens par calibre (en kg)
const CALIBERS_WEIGHTS: Record<string, Record<string, number>> = {
  sole: {
    '1': 0.600,
    '2': 0.450,
    '3': 0.350,
    '4': 0.250,
    '5': 0.180,
    '6': 0.150,
    '7': 0.120
  },
  homard: {
    '1': 0.450,
    '2': 0.600,
    '3': 0.800,
    '4': 1.200
  }
};

/**
 * Extrait le volume total en kg d'un article à partir de son nom textuel brut.
 * Gère :
 * - Le poids brut explicite (ex : "4kg Moules", "2.5 kg Palourdes")
 * - Les pièces avec calibre unitaire (ex : "8 pces sole 2" -> 8 * 0.450 = 3.6 kg)
 * - Les pièces simples sans calibre (ex : "10 pces turbot" -> 10 * 1.0 = 10.0 kg)
 * - Le calibre simple (ex : "sole 2" -> 1 * 0.450 = 0.450 kg)
 */
export function extractWeightFromArticleName(productName: string): number {
  if (!productName) return 1.0;
  
  const text = productName.toLowerCase().trim();

  // 1. Détection d'un poids brut explicite en kg (ex: "4kg moules", "1.5 kg coques")
  const kgMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|kilo|kilos)(?![a-z])/);
  if (kgMatch) {
    const val = parseFloat(kgMatch[1].replace(',', '.'));
    if (!isNaN(val) && val > 0) {
      return val;
    }
  }

  // 2. Détection de la quantité en pièces
  let quantity = 1;
  
  // A. Si la ligne commence par un nombre (ex: "8 pces sole 2", "3 homard 2", "2 bar")
  const leadingQtyMatch = text.match(/^\s*(\d+)\b/);
  if (leadingQtyMatch) {
    // S'assurer que le nombre de début n'est pas suivi de "kg" (déjà traité à l'étape 1)
    const isKgNext = text.match(/^\s*\d+\s*(?:kg|kilo|kilos)(?![a-z])/);
    if (!isKgNext) {
      quantity = parseInt(leadingQtyMatch[1], 10);
    }
  } else {
    // B. Sinon, chercher un indicateur de pièce n'importe où dans le texte (ex: "sole 2 - 10 pces")
    const pcsMatch = text.match(/(\d+)\s*(?:pces|pc|pce|piece|pieces|pqt|paquet|paquets|cs|carton|cartons|sac|sacs|box|boite|boites|bts|bt)(?![a-z])/);
    if (pcsMatch) {
      quantity = parseInt(pcsMatch[1], 10);
    }
  }

  // 3. Détection du calibre (Soles, Homards)
  let unitWeight = 1.0; // Poids par défaut si pas de calibre
  let hasCaliber = false;

  // Recherche de "sole" suivi plus loin d'un chiffre de calibre de 1 à 7
  const soleMatch = text.match(/sole\b.*?([1-7])\b/);
  if (soleMatch) {
    const caliber = soleMatch[1];
    if (CALIBERS_WEIGHTS.sole[caliber]) {
      unitWeight = CALIBERS_WEIGHTS.sole[caliber];
      hasCaliber = true;
    }
  }

  // Recherche de "homard" suivi plus loin d'un chiffre de calibre de 1 à 4
  if (!hasCaliber) {
    const homardMatch = text.match(/homard\b.*?([1-4])\b/);
    if (homardMatch) {
      const caliber = homardMatch[1];
      if (CALIBERS_WEIGHTS.homard[caliber]) {
        unitWeight = CALIBERS_WEIGHTS.homard[caliber];
        hasCaliber = true;
      }
    }
  }

  // 4. Calcul du poids final
  return quantity * unitWeight;
}
