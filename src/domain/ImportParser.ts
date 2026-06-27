import * as XLSX from 'xlsx';

export interface ParsedSheet {
  name: string;
  headers: string[];
  rows: unknown[][];
}

export class ImportParser {
  /**
   * Normalise les nombres au format belge/européen et les pourcentages.
   * Exemples : "1.234,56" -> 1234.56, "1234,56" -> 1234.56, "95%" -> 0.95
   */
  static parseBelgianNumber(val: string | number | null | undefined): number | null {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') {
      if (isNaN(val)) return null;
      return val;
    }

    let clean = String(val).trim();
    if (clean === '') return null;

    // Détecte les pourcentages
    const isPercent = clean.endsWith('%');
    if (isPercent) {
      clean = clean.slice(0, -1).trim();
    }

    // Supprime tous les espaces
    clean = clean.replace(/\s+/g, '');

    // Détecte les séparateurs de milliers et décimaux
    if (clean.includes('.') && clean.includes(',')) {
      if (clean.indexOf('.') < clean.indexOf(',')) {
        // Le point est le séparateur des milliers, la virgule est décimale (ex: 1.234,56)
        clean = clean.replace(/\./g, '').replace(/,/g, '.');
      } else {
        // La virgule est le séparateur des milliers, le point est décimal (ex: 1,234.56)
        clean = clean.replace(/,/g, '');
      }
    } else if (clean.includes(',')) {
      // Virgule seule -> décimale (ex: 1234,56)
      clean = clean.replace(/,/g, '.');
    }

    const parsed = parseFloat(clean);
    if (isNaN(parsed)) return null;

    return isPercent ? parsed / 100 : parsed;
  }

  /**
   * Analyse et convertit les dates au format standard DD/MM/YYYY ou serial Excel.
   */
  static parseDate(val: unknown): Date | null {
    if (val === null || val === undefined) return null;
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return null;
      return val;
    }

    if (typeof val === 'number') {
      // Date sérialisée Excel (ex: 44561 -> Jan 1, 2022)
      if (val > 25569 && val < 60000) {
        const utcDays = Math.floor(val - 25569);
        return new Date(Date.UTC(1970, 0, 1 + utcDays));
      }
      return null;
    }

    if (typeof val === 'string') {
      const clean = val.trim();
      if (clean === '') return null;

      // DD/MM/YYYY ou DD-MM-YYYY ou YYYY-MM-DD
      const parts = clean.split(/[-/]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          // YYYY-MM-DD
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const day = parseInt(parts[2], 10);
          const d = new Date(Date.UTC(year, month, day));
          if (!isNaN(d.getTime())) return d;
        } else {
          // DD/MM/YYYY
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const year = parseInt(parts[2], 10);
          const d = new Date(Date.UTC(year, month, day));
          if (!isNaN(d.getTime())) return d;
        }
      }

      const parsed = new Date(clean);
      if (!isNaN(parsed.getTime())) return parsed;
    }

    return null;
  }

  /**
   * Lit un buffer de fichier (CSV ou Excel) et en extrait les en-têtes et lignes brutes.
   */
  static parseFile(buffer: Buffer): ParsedSheet[] {
    const sheets: ParsedSheet[] = [];

    // cellDates: true permet de convertir automatiquement les dates Excel en Date JS
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
      if (rawRows.length === 0) continue;

      // Cherche la première ligne non-vide pour y trouver les en-têtes
      let headerRowIndex = 0;
      while (headerRowIndex < rawRows.length && (!rawRows[headerRowIndex] || rawRows[headerRowIndex].every(cell => cell === null))) {
        headerRowIndex++;
      }

      if (headerRowIndex >= rawRows.length) continue;

      const rawHeaders = rawRows[headerRowIndex] as unknown[];
      const headers = rawHeaders.map((h, i) => h !== null ? String(h).trim() : `Colonne ${i + 1}`);
      const dataRows = rawRows.slice(headerRowIndex + 1) as unknown[][];

      sheets.push({
        name: sheetName,
        headers,
        rows: dataRows,
      });
    }

    return sheets;
  }
}
