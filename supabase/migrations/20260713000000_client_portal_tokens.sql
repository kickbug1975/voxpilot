-- Migration SQL : Table de stockage des jetons d'accès temporaires pour le portail client B2B
-- Date de création : 2026-07-13

CREATE TABLE IF NOT EXISTS client_portal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Activation de RLS
ALTER TABLE client_portal_tokens ENABLE ROW LEVEL SECURITY;

-- Politique d'accès : permettre la lecture du token pour valider l'accès
-- (S'applique à tout utilisateur public/anonyme qui présente le token dans le lien)
DROP POLICY IF EXISTS "Permettre la lecture publique des tokens" ON client_portal_tokens;
CREATE POLICY "Permettre la lecture publique des tokens" ON client_portal_tokens
  FOR SELECT TO public USING (true);

-- Index pour optimiser la recherche de token
CREATE INDEX IF NOT EXISTS idx_portal_tokens_lookup ON client_portal_tokens(token);
