import { describe, test, expect } from 'vitest';
import { ImportParser } from '../src/domain/ImportParser';
import { ProductMatcher, ExistingProduct, ExistingSupplierProduct } from '../src/domain/ProductMatcher';

describe('ImportParser - Normalisation Numérique Belge', () => {
  test('Convertit les formats de nombre belges / européens', () => {
    expect(ImportParser.parseBelgianNumber('1.234,56')).toBe(1234.56);
    expect(ImportParser.parseBelgianNumber('1 234,56')).toBe(1234.56);
    expect(ImportParser.parseBelgianNumber('1234,56')).toBe(1234.56);
    expect(ImportParser.parseBelgianNumber('12.50')).toBe(12.50);
    expect(ImportParser.parseBelgianNumber('0,95')).toBe(0.95);
  });

  test('Gère les pourcentages', () => {
    expect(ImportParser.parseBelgianNumber('95%')).toBe(0.95);
    expect(ImportParser.parseBelgianNumber('5.5%')).toBe(0.055);
  });

  test('Gère les nombres déjà typés', () => {
    expect(ImportParser.parseBelgianNumber(1234.56)).toBe(1234.56);
    expect(ImportParser.parseBelgianNumber(null)).toBeNull();
  });

  test('Gère les entrées textuelles invalides', () => {
    expect(ImportParser.parseBelgianNumber('abc')).toBeNull();
    expect(ImportParser.parseBelgianNumber('')).toBeNull();
  });
});

describe('ImportParser - Parsing de Dates', () => {
  test('Convertit les formats de chaînes de date standards', () => {
    const d1 = ImportParser.parseDate('22/06/2026');
    expect(d1?.getUTCFullYear()).toBe(2026);
    expect(d1?.getUTCMonth()).toBe(5); // 0-indexed
    expect(d1?.getUTCDate()).toBe(22);

    const d2 = ImportParser.parseDate('2026-06-22');
    expect(d2?.getUTCFullYear()).toBe(2026);
    expect(d2?.getUTCDate()).toBe(22);
  });

  test('Convertit les dates sérialisées Excel', () => {
    // 44562 -> Jan 1, 2022
    const d = ImportParser.parseDate(44562);
    expect(d?.getUTCFullYear()).toBe(2022);
    expect(d?.getUTCMonth()).toBe(0);
    expect(d?.getUTCDate()).toBe(1);
  });

  test('Gère les entrées de date invalides', () => {
    expect(ImportParser.parseDate('non-date')).toBeNull();
    expect(ImportParser.parseDate(null)).toBeNull();
  });
});

describe('ProductMatcher - Correspondance Produit', () => {
  const products: ExistingProduct[] = [
    { id: 'p1', name: 'Saumon Atlantique Frais', internal_sku: 'SAUM-ATL-FR', barcode: '5400123456789' },
    { id: 'p2', name: 'Filet de Cabillaud', internal_sku: 'CAB-FIL-01', barcode: '5400987654321' },
    { id: 'p3', name: 'Crevettes Roses Cuites', internal_sku: 'CREV-ROSE', barcode: null },
  ];

  const supplierProducts: ExistingSupplierProduct[] = [
    { id: 'sp1', product_id: 'p1', supplier_sku: 'SUP-SAUM-01' },
    { id: 'sp2', product_id: 'p3', supplier_sku: 'SUP-CREV-X' },
  ];

  test('Associe exactement par Code EAN', () => {
    const result = ProductMatcher.match(
      { ean: '5400123456789', label: 'Produit Inconnu' },
      products,
      supplierProducts
    );

    expect(result.status).toBe('auto_matched');
    expect(result.matchedProductId).toBe('p1');
    expect(result.method).toBe('ean_exact');
  });

  test('Associe exactement par SKU Interne', () => {
    const result = ProductMatcher.match(
      { sku: 'CAB-FIL-01', label: 'Produit Inconnu' },
      products,
      supplierProducts
    );

    expect(result.status).toBe('auto_matched');
    expect(result.matchedProductId).toBe('p2');
    expect(result.method).toBe('sku_exact');
  });

  test('Associe exactement par SKU Fournisseur', () => {
    const result = ProductMatcher.match(
      { sku: 'SUP-CREV-X', label: 'Produit Inconnu' },
      products,
      supplierProducts
    );

    expect(result.status).toBe('auto_matched');
    expect(result.matchedProductId).toBe('p3');
    expect(result.method).toBe('supplier_sku_exact');
  });

  test('Associe par similarité floue sur la désignation', () => {
    // "Saumon Atlantique" ressemble fortement à "Saumon Atlantique Frais"
    const result = ProductMatcher.match(
      { label: 'Saumon Atlantique' },
      products,
      supplierProducts
    );

    expect(result.status).toBe('auto_matched'); // High score expected
    expect(result.matchedProductId).toBe('p1');
    expect(result.score).toBeGreaterThan(0.50);
  });

  test('Suggère une revue manuelle si le score est moyen', () => {
    // "Cabillaud Frais" ressemble moyennement à "Filet de Cabillaud"
    const result = ProductMatcher.match(
      { label: 'Cabillaud Frais' },
      products,
      supplierProducts
    );

    expect(result.status).toBe('review_required');
    expect(result.matchedProductId).toBeNull();
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0].productId).toBe('p2');
  });

  test('Déclare non associé si aucun produit ne correspond', () => {
    const result = ProductMatcher.match(
      { label: 'Pommes de Terre Grenailles' },
      products,
      supplierProducts
    );

    expect(result.status).toBe('unmatched');
    expect(result.matchedProductId).toBeNull();
    expect(result.candidates.length).toBe(0);
  });
});
