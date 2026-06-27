import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

const samplesDir = path.join(__dirname, '../public/samples');

// Ensure directory exists
if (!fs.existsSync(samplesDir)) {
  fs.mkdirSync(samplesDir, { recursive: true });
}

// 1. Generate tarif_oceannord_exemple.xlsx
const xlsxData = [
  ['SKU Fournisseur', 'Libellé', 'Code EAN', 'Prix d\'achat', 'Unité', 'Facteur de conversion', 'Rendement', 'Coût transport', 'Date de tarif'],
  ['ON-1001', 'Filet de Cabillaud de l\'Atlantique Nord', '3250390012345', 14.50, 'kg', 1.0, 0.85, 0.50, '2026-06-22'],
  ['ON-1002', 'Saumon Entier Elevage Norvège', '3250390012346', 9.80, 'kg', 1.0, 0.70, 0.35, '2026-06-22'],
  ['ON-2003', 'Filet d\'Eglefin avec peau', '3250390012347', 12.20, 'kg', 1.0, 0.90, 0.50, '2026-06-22'],
  ['ON-3004', 'Crevettes grises décortiquées', '3250390012348', 24.00, 'kg', 1.0, 1.00, 0.80, '2026-06-22'],
  ['ON-4005', 'Moules de Bouchot (Saco)', '3250390012349', 4.10, 'kg', 1.0, 1.00, 0.20, '2026-06-22']
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(xlsxData);
XLSX.utils.book_append_sheet(wb, ws, 'OceanNord_Tarifs');
const xlsxPath = path.join(samplesDir, 'tarif_oceannord_exemple.xlsx');
XLSX.writeFile(wb, xlsxPath);
console.log(`✓ Generated ${xlsxPath}`);

// 2. Generate tarif_atlantique_exemple.csv
const csvAtlantiqueContent = [
  'SKU Fournisseur;Libellé;Code EAN;Prix d\'achat;Unité;Facteur de conversion;Rendement;Coût transport;Date de tarif',
  'ATL-5001;Filet de Lieu Noir;3250390056789;8,90;kg;1,0;0,88;0,40;2026-06-22',
  'ATL-5002;Pavé de Saumon Portions;3250390056790;18,50;kg;1,0;1,00;0,50;2026-06-22',
  'ATL-5003;Cabillaud Dos sans peau;3250390056791;21,20;kg;1,0;0,95;0,60;2026-06-22',
  'ATL-5504;Roussette vidée sans tête;3250390056792;7,30;kg;1,0;0,80;0,30;2026-06-22',
  'ATL-6001;Bulots cuits;3250390056793;6,80;kg;1,0;1,00;0,25;2026-06-22'
].join('\r\n'); // Use standard CRLF for CSV on Windows / Excel

const csvAtlantiquePath = path.join(samplesDir, 'tarif_atlantique_exemple.csv');
fs.writeFileSync(csvAtlantiquePath, csvAtlantiqueContent, 'utf-8');
console.log(`✓ Generated ${csvAtlantiquePath}`);

// 3. Generate clients_exemple.csv
const csvClientsContent = [
  'Code;Raison sociale;TVA;Email;Téléphone;Segment;Conditions de paiement;Adresse Facturation;Adresse Livraison',
  'CLI-001;Le Bistrot de la Mer;BE0123456789;contact@bistrotmer.be;+3225551234;horeca;30 jours fin de mois;12 Rue des Brasseurs, 1000 Bruxelles;12 Rue des Brasseurs, 1000 Bruxelles',
  'CLI-002;Poissonnerie Centrale;BE0987654321;info@poissonneriecentrale.com;+3293339988;retail;Paiement à la livraison;45 Chaussée de Gand, 9000 Gand;45 Chaussée de Gand, 9000 Gand',
  'CLI-003;Resto-Co Collectivité;BE0456123789;achats@restoco.be;+3237778899;collectivite;45 jours;88 Zone Industrielle, 2000 Anvers;88 Zone Industrielle, 2000 Anvers',
  'CLI-004;Marée Distribution;BE0789456123;admin@mareedist.be;+3248887766;grossiste;60 jours;14 Quai des Armateurs, 4000 Liège;14 Quai des Armateurs, 4000 Liège',
  'CLI-005;Association Marine;BE0321654987;contact@assomarine.org;+3281443322;autre;15 jours;5 Avenue des Mouettes, Namur;5 Avenue des Mouettes, Namur'
].join('\r\n');

const csvClientsPath = path.join(samplesDir, 'clients_exemple.csv');
fs.writeFileSync(csvClientsPath, csvClientsContent, 'utf-8');
console.log(`✓ Generated ${csvClientsPath}`);
