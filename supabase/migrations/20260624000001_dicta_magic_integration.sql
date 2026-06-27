-- Migration SQL : Intégration Dicta Magic × BlueMargin CRM
-- Date de création : 2026-06-24

-- 1. Activer l'extension pgvector si elle n'est pas déjà activée
CREATE EXTENSION IF NOT EXISTS vector;

-------------------------------------------------------------------------------
-- 2. Configuration et Prompts IA
-------------------------------------------------------------------------------

-- 2.1 system_config
CREATE TABLE IF NOT EXISTS system_config (
  key text PRIMARY KEY,
  value numeric NOT NULL,
  description text,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE system_config IS 'Configurations globales éditables pour la logique métier de l''orchestrateur.';

-- Injection du seuil de poids par défaut pour la Centrale
INSERT INTO system_config (key, value, description)
VALUES (
  'poids_seuil_centrale',
  30,
  'Seuil de poids en kg au-dessus duquel (strictement) ou si le cumul > 50kg, la commande est routée à la Centrale.'
) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- 2.2 ai_prompts
CREATE TABLE IF NOT EXISTS ai_prompts (
  prompt_id text PRIMARY KEY,
  system_prompt text NOT NULL,
  active boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE ai_prompts IS 'Registre de prompts système IA pour les différents modules d''intégration.';

-------------------------------------------------------------------------------
-- 3. Mémoire Vectorielle (RAG)
-------------------------------------------------------------------------------

-- 3.1 dicta_magic_memory
CREATE TABLE IF NOT EXISTS dicta_magic_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  text_content text not null,          -- La transcription brute ou un résumé de la dictée
  embedding vector(1536),              -- Le vecteur généré par text-embedding-3-small
  metadata jsonb,                      -- Méta-données optionnelles
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index HNSW pour pgvector
CREATE INDEX IF NOT EXISTS idx_dicta_magic_memory_embedding ON dicta_magic_memory USING hnsw (embedding vector_cosine_ops);

-- RPC match_dicta_memory
CREATE OR REPLACE FUNCTION match_dicta_memory (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  text_content text,
  metadata jsonb,
  created_at timestamp with time zone,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    text_content,
    metadata,
    created_at,
    1 - (embedding <=> query_embedding) as similarity
  FROM dicta_magic_memory
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-------------------------------------------------------------------------------
-- 4. Comptes-Rendus de Réunions et Commandes Vocales (ERP)
-------------------------------------------------------------------------------

-- 4.1 meetings
CREATE TABLE IF NOT EXISTS meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  client_name text NOT NULL,
  report_md text NOT NULL,
  behavior_alert boolean DEFAULT false NOT NULL,
  alert_reason text,
  score_risque_global integer DEFAULT 1 NOT NULL,
  
  -- Dimension Friction Opérationnelle
  friction_op_score integer DEFAULT 1 NOT NULL,
  friction_op_verbatim text,
  
  -- Dimension Pression Tarifaire / Concurrence
  pression_tarif_score integer DEFAULT 1 NOT NULL,
  pression_tarif_verbatim text,
  
  -- Dimension Désengagement Relationnel
  desengagement_rel_score integer DEFAULT 1 NOT NULL,
  desengagement_rel_verbatim text,
  
  -- Dimension Risque Structurel
  risque_struct_score integer DEFAULT 1 NOT NULL,
  risque_struct_verbatim text,
  
  microsoft_event_id text,
  date timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meetings_client_name ON meetings(client_name, date DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_org_client_date ON meetings(organization_id, client_name, date DESC);

-- 4.2 orders
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  order_number serial UNIQUE,
  client_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending_validation', -- 'pending_validation', 'transmitted_to_central', 'transmitted_to_service_orders', 'validated', 'cancelled'
  total_weight_kg numeric,
  source_channel text NOT NULL DEFAULT 'meeting', -- 'meeting', 'whatsapp', 'vapi'
  delivery_date date,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_client_name ON orders(client_name);
CREATE INDEX IF NOT EXISTS idx_orders_org_client ON orders(organization_id, client_name);

-- 4.3 order_items
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  product_name text NOT NULL,
  quantity_kg numeric NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-------------------------------------------------------------------------------
-- 5. Clarifications, Géolocalisation et Synonymes
-------------------------------------------------------------------------------

-- 5.1 pending_clarifications
CREATE TABLE IF NOT EXISTS pending_clarifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  phone_number text not null,
  original_transcription text not null,
  context_data jsonb not null,
  question_asked text not null,
  status text not null default 'pending', -- 'pending' ou 'resolved'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

CREATE INDEX IF NOT EXISTS idx_pending_clarifications_phone ON pending_clarifications(phone_number, status);
CREATE INDEX IF NOT EXISTS idx_pending_clarifications_org_phone ON pending_clarifications(organization_id, phone_number, status);

-- 5.2 client_coordinates
CREATE TABLE IF NOT EXISTS client_coordinates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name VARCHAR UNIQUE NOT NULL,
  address TEXT NOT NULL,
  latitude NUMERIC(10, 8) NOT NULL,
  longitude NUMERIC(11, 8) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_coordinates_name ON client_coordinates (client_name);

-- 5.3 catalog_synonyms
CREATE TABLE IF NOT EXISTS catalog_synonyms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_term VARCHAR(255) UNIQUE NOT NULL, -- ex: 'cabi haut'
    normalized_term VARCHAR(255) NOT NULL, -- ex: 'Cabillaud'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_catalog_synonyms_raw ON catalog_synonyms(raw_term);

-- 5.4 proposed_synonyms
CREATE TABLE IF NOT EXISTS proposed_synonyms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_term VARCHAR(255) UNIQUE NOT NULL,
    normalized_term VARCHAR(255) NOT NULL,
    confidence_score NUMERIC(3, 2) NOT NULL, -- ex: 0.85
    occurrences INT DEFAULT 1 NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proposed_synonyms_raw ON proposed_synonyms(raw_term);

-------------------------------------------------------------------------------
-- 6. Suivi des Canaux et Alertes (WhatsApp & Outlook)
-------------------------------------------------------------------------------

-- 6.1 whatsapp_messages
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text not null,
  role text not null CHECK (role IN ('user', 'assistant')),
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone ON whatsapp_messages(phone_number, created_at DESC);

-- 6.2 last_delivery_checks
CREATE TABLE IF NOT EXISTS last_delivery_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text UNIQUE not null,
  client_name text not null,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6.3 last_email_alerts
CREATE TABLE IF NOT EXISTS last_email_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text UNIQUE not null,
  message_id text not null,
  sender_email text not null,
  sender_name text not null,
  subject text not null,
  summary text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6.4 pending_emails
CREATE TABLE IF NOT EXISTS pending_emails (
  message_id text PRIMARY KEY,
  conversation_id text not null,
  sender_email text not null,
  sender_name text not null,
  subject text not null,
  summary text not null,
  status text not null default 'pending', -- 'pending', 'processed'
  received_at timestamp with time zone not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

CREATE INDEX IF NOT EXISTS idx_pending_emails_status ON pending_emails(status);

-------------------------------------------------------------------------------
-- 7. Activation RLS (Row Level Security)
-------------------------------------------------------------------------------

ALTER TABLE dicta_magic_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_clarifications ENABLE ROW LEVEL SECURITY;

-- Politiques RLS de base basées sur l'appartenance à l'organisation
CREATE POLICY dicta_magic_memory_policy ON dicta_magic_memory FOR ALL USING (is_org_member(organization_id));
CREATE POLICY meetings_policy ON meetings FOR ALL USING (is_org_member(organization_id));
CREATE POLICY orders_policy ON orders FOR ALL USING (is_org_member(organization_id));
CREATE POLICY order_items_policy ON order_items FOR ALL USING (
  EXISTS (
    SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND is_org_member(orders.organization_id)
  )
);
CREATE POLICY pending_clarifications_policy ON pending_clarifications FOR ALL USING (is_org_member(organization_id));
