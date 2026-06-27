import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const dbUrl = process.env.DATABASE_URL;

async function run() {
  if (!dbUrl) {
    console.error('❌ Erreur : DATABASE_URL non définie dans l\'environnement.');
    process.exit(1);
  }

  console.log('🔌 Connexion à la base de données...');
  const client = new Client({ connectionString: dbUrl });
  
  try {
    await client.connect();
    console.log('✅ Connecté avec succès.');

    // 1. Créer la table de suivi des migrations si elle n'existe pas
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    // 2. Lire le dossier des migrations
    const migrationsDir = path.resolve(__dirname, '../supabase/migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.error(`❌ Dossier de migrations introuvable : ${migrationsDir}`);
      process.exit(1);
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Tri alphabétique strict

    console.log(`📂 ${files.length} fichier(s) de migration trouvé(s).`);

    // 3. Récupérer les migrations déjà appliquées
    const { rows } = await client.query('SELECT version FROM public.schema_migrations;');
    const appliedVersions = new Set(rows.map(r => r.version));

    // 4. Appliquer les nouvelles migrations
    let appliedCount = 0;
    for (const file of files) {
      if (appliedVersions.has(file)) {
        // Déjà appliquée, on passe
        continue;
      }

      console.log(`⚙️ Application de la migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      // Débuter une transaction pour cette migration spécifique
      await client.query('BEGIN;');
      try {
        await client.query(sql);
        await client.query('INSERT INTO public.schema_migrations (version) VALUES ($1);', [file]);
        await client.query('COMMIT;');
        console.log(`✅ Migration ${file} appliquée avec succès.`);
        appliedCount++;
      } catch (err: any) {
        await client.query('ROLLBACK;');
        const isAlreadyExists = err.message.includes('already exists') || 
                                err.code === '42P07' || 
                                err.code === '42710' || 
                                err.message.includes('déjà existant') ||
                                err.message.includes('existe déjà');

        if (isAlreadyExists) {
          console.warn(`⚠️ Note : Des objets de ${file} existent déjà dans la base (${err.message}). Enregistrement comme déjà appliquée.`);
          await client.query('INSERT INTO public.schema_migrations (version) VALUES ($1);', [file]);
          appliedCount++;
        } else {
          console.error(`❌ Échec de la migration ${file} :`, err.message);
          throw err; // Arrêter l'exécution de la suite
        }
      }
    }

    if (appliedCount === 0) {
      console.log('✨ Toutes les migrations sont déjà à jour.');
    } else {
      console.log(`🎉 Fin de traitement. ${appliedCount} nouvelle(s) migration(s) traitée(s).`);
    }

  } catch (err: any) {
    console.error('🚨 Erreur générale lors de l\'exécution des migrations :', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
