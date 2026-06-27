import { env } from './env';

export interface ExtractedTariffItem {
  supplier_sku: string | null;
  ean: string | null;
  label: string;
  purchase_price: number;
  purchase_unit: string | null;
  conversion_factor: number | null;
  yield_rate: number | null;
}

export interface ExtractedTariff {
  items: ExtractedTariffItem[];
}

export class AiDocumentParser {
  /**
   * Extracts tariff data from a base64 encoded document (PDF or image) using Gemini 3.5 Flash via OpenRouter.
   * 
   * @param fileBase64 Base64 data URI (e.g. "data:application/pdf;base64,...")
   * @param fileName Optional filename for context
   * @returns The structured tariff data
   */
  static async extractTariffData(fileBase64: string, fileName?: string): Promise<ExtractedTariff> {
    const apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Clé d'API OpenRouter manquante. Veuillez configurer la variable OPENROUTER_API_KEY dans votre fichier .env."
      );
    }

    // Detect MIME type
    const mimeMatch = fileBase64.match(/^data:([^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : '';
    const isPdf = mimeType === 'application/pdf';

    // Remove the data URI header to get raw base64 if needed, or keep it depending on OpenRouter format.
    // OpenRouter uses data URI format for inline files/images.
    
    const systemPrompt = `Tu es un extracteur de données spécialisé dans les tarifs et catalogues fournisseurs pour le secteur agroalimentaire B2B. 
Analyse le document fourni (qui est un catalogue de tarifs) et extrais de manière exhaustive toutes les lignes de produits avec leurs prix associés.

Pour chaque produit trouvé, fournis :
1. supplier_sku : Le code produit/référence unique du fournisseur (si mentionné, sinon null).
2. ean : Le code-barres EAN/GTIN à 13 chiffres (si présent, sinon null).
3. label : La désignation ou libellé complet du produit.
4. purchase_price : Le prix d'achat unitaire (HT). Ce doit être un nombre strictement positif.
5. purchase_unit : L'unité de facturation (ex: 'kg', 'piece', 'carton', 'colis', 'caisse').
6. conversion_factor : Le facteur de conversion pour passer de l'unité d'achat à l'unité de vente (1.0 par défaut si non précisé).
7. yield_rate : Le rendement de préparation (valeur entre 0 et 1, par défaut 1.0 si non mentionné).

Ne saute aucune ligne de produit valide. Si un prix est nul ou gratuit, ignore le produit.`;

    const userMessageContent: unknown[] = [
      {
        type: 'text',
        text: `Extrais les tarifs du fichier suivant${fileName ? ` (${fileName})` : ''}.`
      }
    ];

    if (isPdf) {
      userMessageContent.push({
        type: 'file',
        file: {
          filename: fileName || 'document.pdf',
          file_data: fileBase64
        }
      });
    } else {
      userMessageContent.push({
        type: 'image_url',
        image_url: {
          url: fileBase64
        }
      });
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          'X-Title': 'BlueMargin'
        },
        body: JSON.stringify({
          model: 'google/gemini-3.5-flash',
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: userMessageContent
            }
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'price_list_extraction',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        supplier_sku: { type: ['string', 'null'] },
                        ean: { type: ['string', 'null'] },
                        label: { type: 'string' },
                        purchase_price: { type: 'number' },
                        purchase_unit: { type: ['string', 'null'] },
                        conversion_factor: { type: ['number', 'null'] },
                        yield_rate: { type: ['number', 'null'] }
                      },
                      required: [
                        'supplier_sku', 
                        'ean', 
                        'label', 
                        'purchase_price', 
                        'purchase_unit', 
                        'conversion_factor', 
                        'yield_rate'
                      ],
                      additionalProperties: false
                    }
                  }
                },
                required: ['items'],
                additionalProperties: false
              }
            }
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenRouter error details:', errorText);
        throw new Error(`Erreur API OpenRouter : ${response.statusText} (${response.status}) - ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("L'API OpenRouter n'a retourné aucun contenu.");
      }

      const parsed: ExtractedTariff = JSON.parse(content);
      
      // Clean and normalize response items
      if (parsed && Array.isArray(parsed.items)) {
        parsed.items = parsed.items.map(item => ({
          supplier_sku: item.supplier_sku || null,
          ean: item.ean || null,
          label: item.label || 'Produit sans nom',
          purchase_price: typeof item.purchase_price === 'number' ? item.purchase_price : 0,
          purchase_unit: item.purchase_unit || null,
          conversion_factor: typeof item.conversion_factor === 'number' ? item.conversion_factor : 1.0,
          yield_rate: typeof item.yield_rate === 'number' ? item.yield_rate : 1.0
        }));
      }

      return parsed;
    } catch (error) {
      console.error('Error during AI tariff extraction:', error);
      throw error;
    }
  }
}
