-- Migration SQL : Table de configuration SMTP par utilisateur
-- Date de création : 2026-06-28

CREATE TABLE IF NOT EXISTS user_email_configs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  smtp_host text NOT NULL,
  smtp_port int NOT NULL,
  smtp_user text NOT NULL,
  smtp_pass text NOT NULL, -- Chiffré en AES-255-CBC
  sender_name text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Activation de RLS
ALTER TABLE user_email_configs ENABLE ROW LEVEL SECURITY;

-- Politique d'accès : seul l'utilisateur concerné a accès en lecture/écriture
DROP POLICY IF EXISTS user_email_configs_policy ON user_email_configs;
CREATE POLICY user_email_configs_policy ON user_email_configs
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Trigger pour mettre à jour la colonne updated_at
DROP TRIGGER IF EXISTS update_user_email_configs_updated_at ON user_email_configs;
CREATE TRIGGER update_user_email_configs_updated_at 
  BEFORE UPDATE ON user_email_configs 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();
