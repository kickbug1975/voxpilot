-- Migration SQL : Préparation Production & Idempotence & RLS
-- Date de création : 2026-06-26

-- 1. Table processed_events pour l'idempotence des événements externes
CREATE TABLE IF NOT EXISTS processed_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL, -- ex: message_id de WhatsApp ou message_id de Microsoft
  event_type text NOT NULL, -- 'whatsapp', 'outlook_email', etc.
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'processed', 'failed'
  payload jsonb NOT NULL,
  error_message text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  processed_at timestamp with time zone
);

ALTER TABLE processed_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS processed_events_policy ON processed_events;
CREATE POLICY processed_events_policy ON processed_events FOR ALL USING (is_org_member(organization_id));

-- 2. Sécurisation et multi-tenant pour client_coordinates
ALTER TABLE client_coordinates ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE client_coordinates DROP CONSTRAINT IF EXISTS client_coordinates_client_name_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_coordinates_org_client_unique'
  ) THEN
    ALTER TABLE client_coordinates ADD CONSTRAINT client_coordinates_org_client_unique UNIQUE (organization_id, client_name);
  END IF;
END
$$;
ALTER TABLE client_coordinates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_coordinates_policy ON client_coordinates;
CREATE POLICY client_coordinates_policy ON client_coordinates FOR ALL USING (is_org_member(organization_id));

-- 3. Sécurisation et multi-tenant pour catalog_synonyms
ALTER TABLE catalog_synonyms ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE catalog_synonyms DROP CONSTRAINT IF EXISTS catalog_synonyms_raw_term_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'catalog_synonyms_org_raw_unique'
  ) THEN
    ALTER TABLE catalog_synonyms ADD CONSTRAINT catalog_synonyms_org_raw_unique UNIQUE (organization_id, raw_term);
  END IF;
END
$$;
ALTER TABLE catalog_synonyms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS catalog_synonyms_policy ON catalog_synonyms;
CREATE POLICY catalog_synonyms_policy ON catalog_synonyms FOR ALL USING (is_org_member(organization_id));

-- 4. Sécurisation et multi-tenant pour proposed_synonyms
ALTER TABLE proposed_synonyms ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE proposed_synonyms DROP CONSTRAINT IF EXISTS proposed_synonyms_raw_term_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'proposed_synonyms_org_raw_unique'
  ) THEN
    ALTER TABLE proposed_synonyms ADD CONSTRAINT proposed_synonyms_org_raw_unique UNIQUE (organization_id, raw_term);
  END IF;
END
$$;
ALTER TABLE proposed_synonyms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS proposed_synonyms_policy ON proposed_synonyms;
CREATE POLICY proposed_synonyms_policy ON proposed_synonyms FOR ALL USING (is_org_member(organization_id));

-- 5. Sécurisation et multi-tenant pour whatsapp_messages
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whatsapp_messages_policy ON whatsapp_messages;
CREATE POLICY whatsapp_messages_policy ON whatsapp_messages FOR ALL USING (is_org_member(organization_id));

-- 6. Sécurisation et multi-tenant pour last_delivery_checks
ALTER TABLE last_delivery_checks ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE last_delivery_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS last_delivery_checks_policy ON last_delivery_checks;
CREATE POLICY last_delivery_checks_policy ON last_delivery_checks FOR ALL USING (is_org_member(organization_id));

-- 7. Sécurisation et multi-tenant pour last_email_alerts
ALTER TABLE last_email_alerts ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE last_email_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS last_email_alerts_policy ON last_email_alerts;
CREATE POLICY last_email_alerts_policy ON last_email_alerts FOR ALL USING (is_org_member(organization_id));

-- 8. Sécurisation et multi-tenant pour pending_emails
ALTER TABLE pending_emails ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE pending_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pending_emails_policy ON pending_emails;
CREATE POLICY pending_emails_policy ON pending_emails FOR ALL USING (is_org_member(organization_id));
