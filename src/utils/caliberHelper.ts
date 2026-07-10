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
  // Regex capturant un nombre suivi de "kg", "kilo" ou "kilos"
  const kgMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|kilo|kilos)(?![a-z])/);
  if (kgMatch) {
    const val = parseFloat(kgMatch[1].replace(',', '.'));
    if (!isNaN(val) && val > 0) {
      return val;
    }
  }

  // 2. Détection d'une quantité en pièces (ex: "8 pces sole 2", "2 pqt lolligot")
  // Regex capturant un nombre suivi de pces, pc, pce, pqt, bts, etc.
  const pcsMatch = text.match(/(\d+)\s*(?:pces|pc|pce|piece|pieces|pqt|paquet|paquets|cs|carton|cartons|sac|sacs|box|boite|boites|bts|bt)(?![a-z])/);
  const quantity = pcsMatch ? parseInt(pcsMatch[1], 10) : 1;

  // 3. Détection du calibre (Soles, Homards)
  let unitWeight = 1.0; // Poids par défaut si pas de calibre
  let hasCaliber = false;

  // Recherche de "sole X"
  const soleMatch = text.match(/sole\s*(\d)/);
  if (soleMatch) {
    const caliber = soleMatch[1];
    if (CALIBERS_WEIGHTS.sole[caliber]) {
      unitWeight = CALIBERS_WEIGHTS.sole[caliber];
      hasCaliber = true;
    }
  }

  // Recherche de "homard X"
  if (!hasCaliber) {
    const homardMatch = text.match(/homard\s*(\d)/);
    if (homardMatch) {
      const caliber = homardMatch[1];
      if (CALIBERS_WEIGHTS.homard[caliber]) {
        unitWeight = CALIBERS_WEIGHTS.homard[caliber];
        hasCaliber = true;
      }
    }
  }

  // 4. Calcul du poids final
  // Si on a trouvé des pièces et un calibre (ex: 8 pces sole 2 -> 8 * 0.45 = 3.6kg)
  // Si on a un calibre sans pièces spécifiées (ex: "sole 2" -> 1 * 0.45 = 0.45kg)
  // Si on a des pièces sans calibre (ex: "10 turbot" ou "10 pces turbot" -> 10 * 1.0 = 10.0kg)
  if (hasCaliber) {
    return quantity * unitWeight;
  }

  // Cas particulier : détection d'un nombre brut en début de ligne (ex: "2 bar de ligne")
  const leadingNumMatch = text.match(/^\s*(\d+)(?!\s*(?:kg|kilo|kilos|pces|pc|pce|piece|pieces|pqt|paquet|paquets|cs|carton|cartons|sac|sacs|box|boite|boites|bts|bt))/);
  if (leadingNumMatch && !pcsMatch) {
    const leadingQty = parseInt(leadingNumMatch[1], 10);
    if (leadingQty > 0) {
      return leadingQty * unitWeight;
    }
  }

  return quantity * unitWeight;
}
