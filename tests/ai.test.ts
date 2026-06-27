import { describe, test, expect, vi, beforeEach } from 'vitest';
import { AiDocumentParser } from '../src/lib/ai';

// Mock env
vi.mock('../src/lib/env', () => ({
  env: {
    OPENROUTER_API_KEY: 'test-api-key',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000'
  }
}));

describe('AiDocumentParser - Extraction IA via OpenRouter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('Appelle correctement l\'API OpenRouter et retourne les tarifs structurés', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              items: [
                {
                  supplier_sku: 'SKU-001',
                  ean: '5400123456789',
                  label: 'Bar de ligne frais',
                  purchase_price: 18.95,
                  purchase_unit: 'kg',
                  conversion_factor: 1.0,
                  yield_rate: 0.40
                },
                {
                  supplier_sku: null,
                  ean: null,
                  label: 'Cabillaud portion',
                  purchase_price: 12.50,
                  purchase_unit: 'piece',
                  conversion_factor: null,
                  yield_rate: null
                }
              ]
            })
          }
        }
      ]
    };

    const globalFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });
    vi.stubGlobal('fetch', globalFetch);

    const result = await AiDocumentParser.extractTariffData(
      'data:application/pdf;base64,JVBERi0xLjQK...', 
      'tarifs.pdf'
    );

    expect(globalFetch).toHaveBeenCalledTimes(1);
    expect(globalFetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'BlueMargin'
        }
      })
    );

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      supplier_sku: 'SKU-001',
      ean: '5400123456789',
      label: 'Bar de ligne frais',
      purchase_price: 18.95,
      purchase_unit: 'kg',
      conversion_factor: 1.0,
      yield_rate: 0.40
    });
    expect(result.items[1]).toEqual({
      supplier_sku: null,
      ean: null,
      label: 'Cabillaud portion',
      purchase_price: 12.50,
      purchase_unit: 'piece',
      conversion_factor: 1.0, // defaults applied
      yield_rate: 1.0 // defaults applied
    });
  });

  test('Gère les erreurs réseau ou HTTP de l\'API OpenRouter', async () => {
    const globalFetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Unauthorized',
      status: 401,
      text: async () => 'Invalid API Key'
    });
    vi.stubGlobal('fetch', globalFetch);

    await expect(
      AiDocumentParser.extractTariffData('data:application/pdf;base64,JVBERi0xLjQK...', 'tarifs.pdf')
    ).rejects.toThrow('Erreur API OpenRouter : Unauthorized (401) - Invalid API Key');
  });
});
