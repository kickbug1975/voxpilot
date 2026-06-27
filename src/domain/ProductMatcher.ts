export interface MatchingCandidate {
  productId: string;
  name: string;
  sku: string;
  score: number;
  method: 'ean_exact' | 'sku_exact' | 'supplier_sku_exact' | 'fuzzy_label';
}

export interface MatchingResult {
  status: 'auto_matched' | 'review_required' | 'unmatched';
  matchedProductId: string | null;
  score: number;
  method: 'ean_exact' | 'sku_exact' | 'supplier_sku_exact' | 'fuzzy_label' | 'none';
  candidates: MatchingCandidate[];
}

export interface ExistingProduct {
  id: string;
  name: string;
  internal_sku: string;
  barcode: string | null;
}

export interface ExistingSupplierProduct {
  id: string;
  product_id: string;
  supplier_sku: string | null;
}

function getTrigrams(str: string): Set<string> {
  const trigrams = new Set<string>();
  const clean = '  ' + str + '  ';
  for (let i = 0; i < clean.length - 2; i++) {
    trigrams.add(clean.slice(i, i + 3));
  }
  return trigrams;
}

export function trigramSimilarity(str1: string, str2: string): number {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;

  const t1 = getTrigrams(s1);
  const t2 = getTrigrams(s2);
  let intersection = 0;
  t1.forEach(trigram => {
    if (t2.has(trigram)) {
      intersection++;
    }
  });
  const union = t1.size + t2.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // supprime les accents
    .replace(/[^a-z0-9]/g, ' ')      // remplace caractères non-alphanum par des espaces
    .replace(/\s+/g, ' ')            // réduit les espaces consécutifs
    .trim();
}

export class ProductMatcher {
  /**
   * Trouve la meilleure correspondance produit pour une ligne d'import.
   */
  static match(
    input: { ean?: string | null; sku?: string | null; label: string },
    products: ExistingProduct[],
    supplierProducts: ExistingSupplierProduct[]
  ): MatchingResult {
    const candidates: MatchingCandidate[] = [];

    const normLabel = normalizeString(input.label);
    const inputEan = input.ean ? String(input.ean).trim() : null;
    const inputSku = input.sku ? String(input.sku).trim() : null;

    // 1. Correspondance exacte EAN
    if (inputEan) {
      const match = products.find(p => p.barcode && String(p.barcode).trim() === inputEan);
      if (match) {
        const candidate: MatchingCandidate = {
          productId: match.id,
          name: match.name,
          sku: match.internal_sku,
          score: 1.0,
          method: 'ean_exact',
        };
        return {
          status: 'auto_matched',
          matchedProductId: match.id,
          score: 1.0,
          method: 'ean_exact',
          candidates: [candidate],
        };
      }
    }

    // 2. Correspondance exacte SKU Interne
    if (inputSku) {
      const match = products.find(p => p.internal_sku.trim().toLowerCase() === inputSku.toLowerCase());
      if (match) {
        const candidate: MatchingCandidate = {
          productId: match.id,
          name: match.name,
          sku: match.internal_sku,
          score: 1.0,
          method: 'sku_exact',
        };
        return {
          status: 'auto_matched',
          matchedProductId: match.id,
          score: 1.0,
          method: 'sku_exact',
          candidates: [candidate],
        };
      }

      // 3. Correspondance exacte SKU Fournisseur
      const spMatch = supplierProducts.find(
        sp => sp.supplier_sku && sp.supplier_sku.trim().toLowerCase() === inputSku.toLowerCase()
      );
      if (spMatch) {
        const matchProd = products.find(p => p.id === spMatch.product_id);
        if (matchProd) {
          const candidate: MatchingCandidate = {
            productId: matchProd.id,
            name: matchProd.name,
            sku: matchProd.internal_sku,
            score: 0.95,
            method: 'supplier_sku_exact',
          };
          return {
            status: 'auto_matched',
            matchedProductId: matchProd.id,
            score: 0.95,
            method: 'supplier_sku_exact',
            candidates: [candidate],
          };
        }
      }
    }

    // 4. Correspondance floue sur la désignation (trigrammes)
    for (const p of products) {
      const score = trigramSimilarity(normLabel, p.name);
      
      if (score > 0.1) {
        candidates.push({
          productId: p.id,
          name: p.name,
          sku: p.internal_sku,
          score,
          method: 'fuzzy_label',
        });
      }
    }

    // Tri des candidats par score décroissant
    candidates.sort((a, b) => b.score - a.score);

    const topCandidates = candidates.slice(0, 3);

    if (topCandidates.length > 0) {
      const best = topCandidates[0];
      let status: 'auto_matched' | 'review_required' | 'unmatched' = 'unmatched';
      
      if (best.score >= 0.50) {
        status = 'auto_matched';
      } else if (best.score >= 0.25) {
        status = 'review_required';
      }

      return {
        status,
        matchedProductId: status === 'auto_matched' ? best.productId : null,
        score: best.score,
        method: 'fuzzy_label',
        candidates: topCandidates,
      };
    }

    return {
      status: 'unmatched',
      matchedProductId: null,
      score: 0,
      method: 'none',
      candidates: [],
    };
  }
}
