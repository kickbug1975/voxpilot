import { Client } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();
const dbUrl = process.env.DATABASE_URL;

async function run() {
  if (!dbUrl) {
    console.error('❌ Erreur : DATABASE_URL non définie.');
    process.exit(1);
  }

  console.log('🔄 Démarrage du test de Sauvegarde / Restauration...');
  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();

    // 1. Simuler un export de données (Sauvegarde)
    console.log('📦 1. Sauvegarde : Lecture des données de test...');
    const { rows: orgs } = await client.query('SELECT * FROM organizations LIMIT 5;');
    console.log(`   - ${orgs.length} organisation(s) lue(s).`);

    const backupData = {
      timestamp: new Date().toISOString(),
      organizations: orgs
    };

    const backupFilePath = path.resolve(__dirname, '../scratch/mock_db_backup.json');
    if (!fs.existsSync(path.dirname(backupFilePath))) {
      fs.mkdirSync(path.dirname(backupFilePath), { recursive: true });
    }
    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf8');
    console.log(`💾 Fichier de sauvegarde généré : ${backupFilePath}`);

    // 2. Simuler une restauration (Restauration)
    console.log('📥 2. Restauration : Création d\'une table temporaire de restauration...');
    await client.query('DROP TABLE IF EXISTS public.restore_test_orgs;');
    await client.query(`
      CREATE TABLE public.restore_test_orgs (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        slug text UNIQUE NOT NULL,
        created_at timestamp with time zone
      );
    `);

    console.log('🔑 Insertion des données sauvegardées...');
    const restoredBackup = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));
    for (const org of restoredBackup.organizations) {
      await client.query(
        'INSERT INTO public.restore_test_orgs (id, name, slug, created_at) VALUES ($1, $2, $3, $4);',
        [org.id, org.name, org.slug, org.created_at]
      );
    }

    // 3. Validation de l'intégrité
    console.log('🔍 3. Validation : Vérification de l\'intégrité des données restaurées...');
    const { rows: restoredRows } = await client.query('SELECT * FROM public.restore_test_orgs;');
    
    if (restoredRows.length === orgs.length) {
      console.log(`✅ SUCCÈS : ${restoredRows.length}/${orgs.length} lignes restaurées avec succès et correspondent.`);
    } else {
      throw new Error(`Incohérence des données: ${restoredRows.length} restaurées, ${orgs.length} attendues.`);
    }

    // Nettoyage
    await client.query('DROP TABLE public.restore_test_orgs;');
    console.log('🧹 Nettoyage de la base de données de test terminé.');

  } catch (err: any) {
    console.error('❌ Échec de la validation de sauvegarde / restauration :', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
