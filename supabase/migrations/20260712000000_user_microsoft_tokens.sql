-- Migration SQL : Table de stockage des jetons Microsoft OAuth 2.0
-- Date de création : 2026-07-12

CREATE TABLE IF NOT EXISTS user_microsoft_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  email text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Activation de RLS
ALTER TABLE user_microsoft_tokens ENABLE ROW LEVEL SECURITY;

-- Politique d'accès : seul l'utilisateur concerné a accès en lecture/écriture
DROP POLICY IF EXISTS user_microsoft_tokens_policy ON user_microsoft_tokens;
CREATE POLICY user_microsoft_tokens_policy ON user_microsoft_tokens
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Trigger pour mettre à jour la colonne updated_at
DROP TRIGGER IF EXISTS update_user_microsoft_tokens_updated_at ON user_microsoft_tokens;
CREATE TRIGGER update_user_microsoft_tokens_updated_at 
  BEFORE UPDATE ON user_microsoft_tokens 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();
