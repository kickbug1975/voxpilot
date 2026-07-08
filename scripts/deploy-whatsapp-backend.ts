import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const token = '1|PQpKnvPZdXHXq7nIZDYABn5O8pEeNYpQwvPyadRMbe21b451';
const baseUrl = 'http://69.62.107.47:8000/api/v1';
const appUuid = 'tt8vuvzasc9ma1fk78u3z9m0'; // UUID de whatsapp-app:main-tt8vuvzasc9ma1fk78u3z9m0

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
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
    console.log(`🔗 FQDN détecté : ${fqdn}`);
  } catch (err: any) {
    console.error("❌ Échec de la récupération des détails de l'application :", err.message);
    process.exit(1);
  }

  if (!fqdn) {
    fqdn = `https://${appUuid}.69.62.107.47.sslip.io`;
    console.log(`⚠️ Aucun FQDN configuré dans Coolify. Utilisation du FQDN sslip.io estimé : ${fqdn}`);
  }

  console.log("📂 Lecture du fichier .env du backend Dicta Magic...");
  // Lire le fichier .env de dicta magic/backend
  const envPath = path.resolve('C:/Users/Dimitri/dicta magic/backend/.env');
  if (!fs.existsSync(envPath)) {
    console.error(`❌ Fichier .env introuvable à l'adresse : ${envPath}`);
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

  // Mettre à jour BACKEND_URL avec la valeur réelle FQDN de Coolify si besoin
  const backendUrlIndex = envsToUpdate.findIndex(e => e.key === 'BACKEND_URL');
  if (backendUrlIndex !== -1) {
    envsToUpdate[backendUrlIndex].value = fqdn;
  } else {
    envsToUpdate.push({ key: 'BACKEND_URL', value: fqdn });
  }

  // Forcer EVOLUTION_API_URL vers l'URL publique de production d'Evolution API
  const evoUrlIndex = envsToUpdate.findIndex(e => e.key === 'EVOLUTION_API_URL');
  const prodEvoUrl = 'https://ifywthbh9sag5j3n75u1x126.69.62.107.47.sslip.io';
  if (evoUrlIndex !== -1) {
    envsToUpdate[evoUrlIndex].value = prodEvoUrl;
  } else {
    envsToUpdate.push({ key: 'EVOLUTION_API_URL', value: prodEvoUrl });
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
          is_buildtime: false, // pas d'obligation buildtime pour le backend Node standard
          is_literal: true
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
            is_buildtime: false,
            is_literal: true
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

  console.log("\n🚀 Déclenchement du déploiement de whatsapp-app sur Coolify...");
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

run().catch(console.error);
