import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const token = '1|PQpKnvPZdXHXq7nIZDYABn5O8pEeNYpQwvPyadRMbe21b451';
const baseUrl = 'http://69.62.107.47:8000/api/v1';

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const appUuid = process.argv[2];
  if (!appUuid) {
    console.error("❌ Erreur : Veuillez spécifier l'UUID de l'application Coolify.");
    console.log("Usage: npx tsx scripts/deploy-coolify.ts <appUuid>");
    process.exit(1);
  }

  console.log(`🔍 Récupération des informations de l'application ${appUuid}...`);
  let fqdn = '';
  try {
    const res = await fetch(`${baseUrl}/applications/${appUuid}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      throw new Error(`Coolify API returned status ${res.status}`);
    }
    const appInfo = await res.json() as any;
    fqdn = appInfo.fqdn || '';
    console.log(`✅ Application trouvée : ${appInfo.name}`);
    console.log(`🔗 FQDN détecté : ${fqdn || 'Aucun (sslip.io temporaire sera généré par Coolify)'}`);
  } catch (err: any) {
    console.error("❌ Échec de la récupération des détails de l'application :", err.message);
    process.exit(1);
  }

  // Si aucun FQDN n'est défini, on utilise l'adresse sslip.io par défaut
  if (!fqdn) {
    fqdn = `https://${appUuid}.69.62.107.47.sslip.io`;
    console.log(`⚠️ Aucun FQDN configuré dans Coolify. Utilisation du FQDN sslip.io estimé : ${fqdn}`);
  }

  console.log("📂 Lecture du fichier .env...");
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) {
    console.error("❌ Fichier .env introuvable à la racine du projet.");
    process.exit(1);
  }

  const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
  const envsToUpdate: { key: string, value: string }[] = [];

  for (const line of envLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    // Nettoyer les guillemets
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);

    envsToUpdate.push({ key, value });
  }

  // Mettre à jour ou ajouter NEXT_PUBLIC_APP_URL avec le FQDN réel
  const appUrlIndex = envsToUpdate.findIndex(e => e.key === 'NEXT_PUBLIC_APP_URL');
  if (appUrlIndex !== -1) {
    envsToUpdate[appUrlIndex].value = fqdn;
  } else {
    envsToUpdate.push({ key: 'NEXT_PUBLIC_APP_URL', value: fqdn });
  }

  console.log(`⚙️ Envoi de ${envsToUpdate.length} variables d'environnement vers Coolify...`);
  
  for (const { key, value } of envsToUpdate) {
    try {
      // Tenter un PATCH (mise à jour)
      const res = await fetch(`${baseUrl}/applications/${appUuid}/envs`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          key,
          value,
          is_buildtime: key.startsWith('NEXT_PUBLIC_'), // buildtime pour les variables Next.js publiques
          is_literal: false
        })
      });

      if (res.ok) {
        console.log(`  ✅ ${key} mis à jour.`);
      } else {
        // Tenter un POST si la variable n'existe pas
        const postRes = await fetch(`${baseUrl}/applications/${appUuid}/envs`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            key,
            value,
            is_buildtime: key.startsWith('NEXT_PUBLIC_'),
            is_literal: false
          })
        });

        if (postRes.ok) {
          console.log(`  ✅ ${key} créé.`);
        } else {
          const errText = await postRes.text();
          console.error(`  ❌ Échec de la configuration pour ${key} :`, errText);
        }
      }
    } catch (err: any) {
      console.error(`  ❌ Erreur réseau pour ${key} :`, err.message);
    }
  }

  console.log("\n🚀 Déclenchement du déploiement de VoxPilot sur Coolify...");
  try {
    const deployRes = await fetch(`${baseUrl}/deploy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uuid: appUuid })
    });

    if (deployRes.ok) {
      const deployData = await deployRes.json() as any;
      console.log("🎉 Déploiement déclenché avec succès !");
      console.log(`🔗 URL de suivi : ${deployData.deployment_url || 'Consultez votre console Coolify'}`);
    } else {
      const errText = await deployRes.text();
      console.error("❌ Échec du déclenchement du déploiement :", errText);
    }
  } catch (err: any) {
    console.error("❌ Erreur réseau lors du déploiement :", err.message);
  }
}

run();
