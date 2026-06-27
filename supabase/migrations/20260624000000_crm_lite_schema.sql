-- CRM Lite V1.1 Schema Migration
-- Created on 2026-06-24

-------------------------------------------------------------------------------
-- 1. Modify organizations and customers
-------------------------------------------------------------------------------

-- 1.1 organizations additions
ALTER TABLE organizations ADD COLUMN crm_visibility_mode text NOT NULL DEFAULT 'all_customers' CHECK (crm_visibility_mode IN ('all_customers', 'assigned_customers'));
ALTER TABLE organizations ADD COLUMN default_quote_follow_up_delay_days int NOT NULL DEFAULT 3 CHECK (default_quote_follow_up_delay_days >= 0 AND default_quote_follow_up_delay_days <= 365);
ALTER TABLE organizations ADD COLUMN inactive_customer_delay_days int NOT NULL DEFAULT 30 CHECK (inactive_customer_delay_days >= 0 AND inactive_customer_delay_days <= 365);
ALTER TABLE organizations ADD COLUMN require_next_action_after_activity boolean NOT NULL DEFAULT false;
ALTER TABLE organizations ADD COLUMN allow_sales_reassignment boolean NOT NULL DEFAULT false;
ALTER TABLE organizations ADD COLUMN crm_activity_outcomes_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE organizations ADD COLUMN auto_create_quote_follow_up_task boolean NOT NULL DEFAULT true;
ALTER TABLE organizations ADD COLUMN require_lost_reason boolean NOT NULL DEFAULT true;

-- 1.2 customers additions
ALTER TABLE customers ADD COLUMN lifecycle_status text NOT NULL DEFAULT 'customer' CHECK (lifecycle_status IN ('prospect', 'qualified', 'customer', 'dormant', 'lost', 'blocked'));
ALTER TABLE customers ADD COLUMN lead_source text CHECK (lead_source IN ('website', 'referral', 'cold_call', 'event', 'inbound', 'other'));
ALTER TABLE customers ADD COLUMN lead_source_detail text;
ALTER TABLE customers ADD COLUMN website text;
ALTER TABLE customers ADD COLUMN industry text;
ALTER TABLE customers ADD COLUMN potential_level text NOT NULL DEFAULT 'unknown' CHECK (potential_level IN ('unknown', 'low', 'medium', 'high', 'strategic'));
ALTER TABLE customers ADD COLUMN preferred_contact_channel text CHECK (preferred_contact_channel IN ('email', 'phone', 'mobile', 'visit', 'other'));
ALTER TABLE customers ADD COLUMN last_activity_at timestamptz;
ALTER TABLE customers ADD COLUMN next_activity_at timestamptz;
ALTER TABLE customers ADD COLUMN customer_since date;
ALTER TABLE customers ADD COLUMN lost_at timestamptz;
ALTER TABLE customers ADD COLUMN lost_reason text;
ALTER TABLE customers ADD COLUMN updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill customers (existing active are customer, inactive are dormant)
UPDATE customers SET lifecycle_status = CASE WHEN is_active THEN 'customer' ELSE 'dormant' END;

-- Add UNIQUE constraints to allow composite foreign keys
ALTER TABLE customers ADD CONSTRAINT unique_customers_org_id UNIQUE (organization_id, id);

-------------------------------------------------------------------------------
-- 2. Create customer_locations and contacts
-------------------------------------------------------------------------------

-- 2.1 customer_locations
CREATE TABLE customer_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  name text NOT NULL,
  location_type text NOT NULL DEFAULT 'other' CHECK (location_type IN ('head_office', 'restaurant', 'hotel', 'shop', 'warehouse', 'central_kitchen', 'billing', 'delivery', 'other')),
  address jsonb NOT NULL DEFAULT '{}',
  phone text,
  email citext,
  delivery_notes text,
  opening_hours jsonb NOT NULL DEFAULT '{}',
  preferred_visit_days smallint[] NOT NULL DEFAULT '{}',
  latitude numeric(9,6) CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  longitude numeric(9,6) CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, customer_id) REFERENCES customers (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT unique_customer_locations_composite UNIQUE (organization_id, customer_id, id)
);

CREATE TRIGGER update_customer_locations_updated_at BEFORE UPDATE ON customer_locations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Partial unique index to enforce single primary active location per customer
CREATE UNIQUE INDEX idx_customer_locations_primary ON customer_locations (customer_id) WHERE (is_primary = true AND is_active = true);

-- 2.2 contacts
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  location_id uuid,
  first_name text,
  last_name text,
  job_title text,
  department text,
  email citext,
  secondary_email citext,
  phone text,
  mobile text,
  preferred_channel text CHECK (preferred_channel IS NULL OR preferred_channel IN ('email', 'phone', 'mobile', 'visit', 'other')),
  language text NOT NULL DEFAULT 'fr-BE',
  decision_role text NOT NULL DEFAULT 'other' CHECK (decision_role IN ('decision_maker', 'influencer', 'user', 'buyer', 'chef', 'owner', 'finance', 'administration', 'gatekeeper', 'other')),
  influence_level text NOT NULL DEFAULT 'unknown' CHECK (influence_level IN ('unknown', 'low', 'medium', 'high')),
  notes text,
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  do_not_contact boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, customer_id) REFERENCES customers (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, customer_id, location_id) REFERENCES customer_locations (organization_id, customer_id, id) ON DELETE SET NULL,
  CONSTRAINT check_name_not_null CHECK (coalesce(nullif(trim(first_name),''), nullif(trim(last_name),'')) is not null),
  CONSTRAINT unique_contacts_composite UNIQUE (organization_id, customer_id, id)
);

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Partial unique index to enforce single primary active contact per customer
CREATE UNIQUE INDEX idx_contacts_primary ON contacts (customer_id) WHERE (is_primary = true AND is_active = true);

-------------------------------------------------------------------------------
-- 3. Modify quotes (Add contact_id and location_id)
-------------------------------------------------------------------------------

ALTER TABLE quotes ADD COLUMN contact_id uuid;
ALTER TABLE quotes ADD COLUMN location_id uuid;

-- Add UNIQUE constraint to quotes for composite foreign keys
ALTER TABLE quotes ADD CONSTRAINT unique_quotes_composite UNIQUE (organization_id, customer_id, id);

-- Composite foreign keys to guarantee coherence
ALTER TABLE quotes ADD CONSTRAINT quotes_contact_composite_fkey FOREIGN KEY (organization_id, customer_id, contact_id) REFERENCES contacts (organization_id, customer_id, id) ON DELETE SET NULL;
ALTER TABLE quotes ADD CONSTRAINT quotes_location_composite_fkey FOREIGN KEY (organization_id, customer_id, location_id) REFERENCES customer_locations (organization_id, customer_id, id) ON DELETE SET NULL;

-- Restrict delete of customer if quotes exist
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_customer_id_fkey;
ALTER TABLE quotes ADD CONSTRAINT quotes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;

-------------------------------------------------------------------------------
-- 4. Create activities, tasks, tags, customer_tags, crm_events
-------------------------------------------------------------------------------

-- 4.1 activities
CREATE TABLE activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  location_id uuid,
  contact_id uuid,
  quote_id uuid,
  activity_type text NOT NULL CHECK (activity_type IN ('call', 'email', 'visit', 'meeting', 'video_call', 'product_test', 'tasting', 'note', 'quote_follow_up', 'internal_action', 'other')),
  direction text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound', 'internal')),
  subject text NOT NULL,
  content text,
  outcome text CHECK (outcome IS NULL OR outcome IN ('successful', 'no_answer', 'voicemail', 'follow_up_needed', 'meeting_booked', 'quote_requested', 'not_interested', 'wrong_contact', 'other')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  duration_minutes int CHECK (duration_minutes IS NULL OR (duration_minutes >= 0 AND duration_minutes <= 1440)),
  is_pinned boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  corrected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, customer_id, location_id) REFERENCES customer_locations (organization_id, customer_id, id) ON DELETE SET NULL,
  FOREIGN KEY (organization_id, customer_id, contact_id) REFERENCES contacts (organization_id, customer_id, id) ON DELETE SET NULL,
  FOREIGN KEY (organization_id, customer_id, quote_id) REFERENCES quotes (organization_id, customer_id, id) ON DELETE SET NULL
);

CREATE TRIGGER update_activities_updated_at BEFORE UPDATE ON activities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4.2 tasks
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE RESTRICT,
  location_id uuid,
  contact_id uuid,
  quote_id uuid,
  title text NOT NULL,
  description text,
  task_type text NOT NULL DEFAULT 'other' CHECK (task_type IN ('call', 'email', 'visit', 'meeting', 'quote', 'quote_follow_up', 'product_sample', 'price_review', 'administrative', 'other')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  due_at timestamptz NOT NULL,
  reminder_at timestamptz,
  assigned_to uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  outcome text,
  snooze_count int NOT NULL DEFAULT 0 CHECK (snooze_count >= 0),
  automation_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, customer_id, location_id) REFERENCES customer_locations (organization_id, customer_id, id) ON DELETE SET NULL,
  FOREIGN KEY (organization_id, customer_id, contact_id) REFERENCES contacts (organization_id, customer_id, id) ON DELETE SET NULL,
  FOREIGN KEY (organization_id, customer_id, quote_id) REFERENCES quotes (organization_id, customer_id, id) ON DELETE SET NULL,
  CONSTRAINT check_completed_fields CHECK (status != 'completed' OR (completed_at IS NOT NULL AND completed_by IS NOT NULL)),
  CONSTRAINT check_relations_need_customer CHECK (
    (contact_id IS NULL AND location_id IS NULL AND quote_id IS NULL) OR customer_id IS NOT NULL
  ),
  CONSTRAINT check_reminder_time CHECK (reminder_at IS NULL OR reminder_at <= due_at)
);

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Unique task automation key index to prevent duplicates
CREATE UNIQUE INDEX idx_tasks_automation_key ON tasks (organization_id, automation_key) WHERE (automation_key IS NOT NULL);

-- 4.3 tags
CREATE TABLE tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name citext NOT NULL,
  color_key text NOT NULL DEFAULT 'blue',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name),
  CONSTRAINT unique_tags_org_id UNIQUE (organization_id, id)
);

CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON tags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4.4 customer_tags
CREATE TABLE customer_tags (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, tag_id),
  FOREIGN KEY (organization_id, customer_id) REFERENCES customers (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, tag_id) REFERENCES tags (organization_id, id) ON DELETE CASCADE
);

-- 4.5 crm_events
CREATE TABLE crm_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  source_type text NOT NULL,
  source_id uuid,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}',
  dedupe_key text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, customer_id) REFERENCES customers (organization_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_crm_events_dedupe_key ON crm_events (organization_id, dedupe_key) WHERE (dedupe_key IS NOT NULL);

-- Trigger to make crm_events append-only
CREATE OR REPLACE FUNCTION block_crm_event_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'CRM events are append-only and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER block_crm_event_mod_trigger
BEFORE UPDATE OR DELETE ON crm_events
FOR EACH ROW EXECUTE FUNCTION block_crm_event_modification();

-------------------------------------------------------------------------------
-- 5. Helper security definer functions for access checks
-------------------------------------------------------------------------------

-- Check if user has access to a specific customer based on role and visibility settings
CREATE OR REPLACE FUNCTION can_access_customer(org_id uuid, cust_id uuid)
RETURNS boolean AS $$
DECLARE
  v_role text;
  v_visibility text;
  v_owner_id uuid;
BEGIN
  -- User must be a member of the organization
  IF NOT is_org_member(org_id) THEN
    RETURN FALSE;
  END IF;

  -- Get user role
  v_role := current_user_role(org_id);
  
  -- Owner, admin, manager have access to all customers
  IF v_role IN ('owner', 'admin', 'manager') THEN
    RETURN TRUE;
  END IF;

  -- Get customer owner and organization visibility setting
  SELECT owner_user_id INTO v_owner_id FROM customers WHERE id = cust_id AND organization_id = org_id;
  SELECT crm_visibility_mode INTO v_visibility FROM organizations WHERE id = org_id;

  -- If visibility mode is all_customers, active member can access
  IF v_visibility = 'all_customers' THEN
    RETURN TRUE;
  END IF;

  -- In assigned_customers mode:
  -- Sales/Viewer can access if they are the owner of the customer
  IF v_owner_id = auth.uid() THEN
    RETURN TRUE;
  END IF;

  -- Or if they are sales/viewer and have an associated quote where they are the sales_owner_id
  IF EXISTS (
    SELECT 1 FROM quotes 
    WHERE customer_id = cust_id 
      AND organization_id = org_id 
      AND sales_owner_id = auth.uid()
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Check if user can manage (update/insert) a customer
CREATE OR REPLACE FUNCTION can_manage_customer(org_id uuid, cust_id uuid)
RETURNS boolean AS $$
DECLARE
  v_role text;
  v_owner_id uuid;
BEGIN
  -- User must be a member of the organization
  IF NOT is_org_member(org_id) THEN
    RETURN FALSE;
  END IF;

  v_role := current_user_role(org_id);
  
  -- Owner, admin, manager can manage all customers
  IF v_role IN ('owner', 'admin', 'manager') THEN
    RETURN TRUE;
  END IF;

  -- Sales can manage if they are the owner of the customer
  IF v_role = 'sales' THEN
    SELECT owner_user_id INTO v_owner_id FROM customers WHERE id = cust_id AND organization_id = org_id;
    RETURN v_owner_id = auth.uid();
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-------------------------------------------------------------------------------
-- 6. Enable Row Level Security (RLS) on all new tables
-------------------------------------------------------------------------------

ALTER TABLE customer_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_locations FORCE ROW LEVEL SECURITY;

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities FORCE ROW LEVEL SECURITY;

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags FORCE ROW LEVEL SECURITY;

ALTER TABLE customer_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tags FORCE ROW LEVEL SECURITY;

ALTER TABLE crm_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_events FORCE ROW LEVEL SECURITY;

-------------------------------------------------------------------------------
-- 7. RLS Policies
-------------------------------------------------------------------------------

-- 7.1 customer_locations
CREATE POLICY customer_locations_select ON customer_locations FOR SELECT USING (can_access_customer(organization_id, customer_id));
CREATE POLICY customer_locations_insert ON customer_locations FOR INSERT WITH CHECK (can_manage_customer(organization_id, customer_id));
CREATE POLICY customer_locations_update ON customer_locations FOR UPDATE USING (can_manage_customer(organization_id, customer_id)) WITH CHECK (can_manage_customer(organization_id, customer_id));
CREATE POLICY customer_locations_delete ON customer_locations FOR DELETE USING (can_manage_customer(organization_id, customer_id));

-- 7.2 contacts
CREATE POLICY contacts_select ON contacts FOR SELECT USING (can_access_customer(organization_id, customer_id));
CREATE POLICY contacts_insert ON contacts FOR INSERT WITH CHECK (can_manage_customer(organization_id, customer_id));
CREATE POLICY contacts_update ON contacts FOR UPDATE USING (can_manage_customer(organization_id, customer_id)) WITH CHECK (can_manage_customer(organization_id, customer_id));
CREATE POLICY contacts_delete ON contacts FOR DELETE USING (can_manage_customer(organization_id, customer_id));

-- 7.3 activities
CREATE POLICY activities_select ON activities FOR SELECT USING (can_access_customer(organization_id, customer_id));
CREATE POLICY activities_insert ON activities FOR INSERT WITH CHECK (can_manage_customer(organization_id, customer_id) AND (created_by = auth.uid() OR has_org_role(organization_id, ARRAY['owner', 'admin', 'manager'])));
CREATE POLICY activities_update ON activities FOR UPDATE USING (
  can_manage_customer(organization_id, customer_id) AND (
    (created_by = auth.uid() AND occurred_at >= now() - interval '24 hours') OR
    has_org_role(organization_id, ARRAY['owner', 'admin', 'manager'])
  )
) WITH CHECK (
  can_manage_customer(organization_id, customer_id) AND (
    (created_by = auth.uid() AND occurred_at >= now() - interval '24 hours') OR
    has_org_role(organization_id, ARRAY['owner', 'admin', 'manager'])
  )
);
CREATE POLICY activities_delete ON activities FOR DELETE USING (has_org_role(organization_id, ARRAY['owner', 'admin']));

-- 7.4 tasks
CREATE POLICY tasks_select ON tasks FOR SELECT USING (
  (customer_id IS NOT NULL AND can_access_customer(organization_id, customer_id)) OR
  (customer_id IS NULL AND (assigned_to = auth.uid() OR created_by = auth.uid() OR has_org_role(organization_id, ARRAY['owner', 'admin', 'manager'])))
);
CREATE POLICY tasks_insert ON tasks FOR INSERT WITH CHECK (
  is_org_member(organization_id) AND 
  (customer_id IS NULL OR can_manage_customer(organization_id, customer_id)) AND
  has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'sales'])
);
CREATE POLICY tasks_update ON tasks FOR UPDATE USING (
  is_org_member(organization_id) AND 
  (customer_id IS NULL OR can_manage_customer(organization_id, customer_id)) AND (
    assigned_to = auth.uid() OR 
    created_by = auth.uid() OR 
    has_org_role(organization_id, ARRAY['owner', 'admin', 'manager'])
  )
);
CREATE POLICY tasks_delete ON tasks FOR DELETE USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

-- 7.5 tags
CREATE POLICY tags_select ON tags FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY tags_all ON tags FOR ALL USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'manager'])) WITH CHECK (has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

-- 7.6 customer_tags
CREATE POLICY customer_tags_select ON customer_tags FOR SELECT USING (can_access_customer(organization_id, customer_id));
CREATE POLICY customer_tags_all ON customer_tags FOR ALL USING (can_manage_customer(organization_id, customer_id)) WITH CHECK (can_manage_customer(organization_id, customer_id));

-- 7.7 crm_events
CREATE POLICY crm_events_select ON crm_events FOR SELECT USING (can_access_customer(organization_id, customer_id));
CREATE POLICY crm_events_insert ON crm_events FOR INSERT WITH CHECK (is_org_member(organization_id));

-- 7.8 Re-define customers policies to respect can_access_customer and can_manage_customer
DROP POLICY IF EXISTS customers_all ON customers;
CREATE POLICY customers_select ON customers FOR SELECT USING (can_access_customer(organization_id, id));
CREATE POLICY customers_insert ON customers FOR INSERT WITH CHECK (is_org_member(organization_id) AND has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'sales']));
CREATE POLICY customers_update ON customers FOR UPDATE USING (can_manage_customer(organization_id, id)) WITH CHECK (can_manage_customer(organization_id, id));
CREATE POLICY customers_delete ON customers FOR DELETE USING (has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']));

-- 7.9 Re-define quotes_select policy to respect portfolio check
DROP POLICY IF EXISTS quotes_select ON quotes;
CREATE POLICY quotes_select ON quotes FOR SELECT USING (is_org_member(organization_id) AND can_access_customer(organization_id, customer_id));

-------------------------------------------------------------------------------
-- 8. Consolidate Timeline Function (get_customer_timeline)
-- Combined query over activities, crm_events and quote_events
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_customer_timeline(
  p_customer_id uuid,
  p_limit int DEFAULT 30,
  p_before timestamptz DEFAULT NULL,
  p_sources text[] DEFAULT NULL
)
RETURNS TABLE (
  entry_key text,
  source text,
  event_type text,
  title text,
  body text,
  actor_user_id uuid,
  actor_name text,
  contact_id uuid,
  quote_id uuid,
  task_id uuid,
  occurred_at timestamptz,
  metadata jsonb
) AS $$
DECLARE
  v_org_id uuid;
  v_can_view_costs boolean;
BEGIN
  -- Find organization of the customer
  SELECT organization_id INTO v_org_id FROM customers WHERE id = p_customer_id;
  
  -- Check access permission
  IF NOT can_access_customer(v_org_id, p_customer_id) THEN
    RAISE EXCEPTION 'Access denied to customer timeline';
  END IF;

  v_can_view_costs := can_view_costs(v_org_id);

  RETURN QUERY
  WITH unioned AS (
    -- 1. Activities
    SELECT
      'activity:' || a.id AS entry_key,
      'activity'::text AS source,
      a.activity_type::text AS event_type,
      a.subject::text AS title,
      a.content::text AS body,
      a.created_by AS actor_user_id,
      COALESCE(p.full_name, 'Utilisateur') AS actor_name,
      a.contact_id,
      a.quote_id,
      NULL::uuid AS task_id,
      a.occurred_at,
      jsonb_build_object(
        'direction', a.direction,
        'outcome', a.outcome,
        'duration_minutes', a.duration_minutes,
        'is_pinned', a.is_pinned
      ) AS metadata
    FROM activities a
    LEFT JOIN profiles p ON p.id = a.created_by
    WHERE a.customer_id = p_customer_id
      AND (p_sources IS NULL OR 'activities' = ANY(p_sources))
      AND (p_before IS NULL OR a.occurred_at < p_before)

    UNION ALL

    -- 2. CRM Events
    SELECT
      'crm_event:' || e.id AS entry_key,
      'crm_event'::text AS source,
      e.event_type::text AS event_type,
      e.title::text AS title,
      e.description::text AS body,
      e.actor_user_id AS actor_user_id,
      COALESCE(p.full_name, 'Système') AS actor_name,
      NULL::uuid AS contact_id,
      CASE WHEN e.source_type = 'quote' THEN e.source_id ELSE NULL END AS quote_id,
      CASE WHEN e.source_type = 'task' THEN e.source_id ELSE NULL END AS task_id,
      e.occurred_at,
      e.metadata
    FROM crm_events e
    LEFT JOIN profiles p ON p.id = e.actor_user_id
    WHERE e.customer_id = p_customer_id
      AND (p_sources IS NULL OR 'system' = ANY(p_sources))
      AND (p_before IS NULL OR e.occurred_at < p_before)

    UNION ALL

    -- 3. Quote Events (excluding financial metadata if user doesn't have rights)
    SELECT
      'quote_event:' || qe.id AS entry_key,
      'quote_event'::text AS source,
      qe.event_type::text AS event_type,
      (COALESCE(qe.actor_name, 'Système') || ' : ' || qe.event_type)::text AS title,
      ('Evénement sur l''offre ' || q.quote_number || ' (R' || q.revision || ')')::text AS body,
      qe.actor_user_id AS actor_user_id,
      COALESCE(p.full_name, qe.actor_name, 'Système') AS actor_name,
      NULL::uuid AS contact_id,
      qe.quote_id,
      NULL::uuid AS task_id,
      qe.occurred_at,
      CASE 
        WHEN v_can_view_costs THEN qe.metadata 
        ELSE qe.metadata - 'subtotal' - 'tax_total' - 'grand_total'
      END AS metadata
    FROM quote_events qe
    JOIN quotes q ON q.id = qe.quote_id
    LEFT JOIN profiles p ON p.id = qe.actor_user_id
    WHERE q.customer_id = p_customer_id
      AND (p_sources IS NULL OR 'quotes' = ANY(p_sources))
      AND (p_before IS NULL OR qe.occurred_at < p_before)
  )
  SELECT * FROM unioned
  ORDER BY occurred_at DESC, entry_key DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-------------------------------------------------------------------------------
-- 9. Create indexes for optimization (Section 18 of PRD)
-------------------------------------------------------------------------------

CREATE INDEX idx_customers_crm_vis_act ON customers(organization_id, lifecycle_status, is_active);
CREATE INDEX idx_customers_crm_owner ON customers(organization_id, owner_user_id, is_active);
CREATE INDEX idx_customers_crm_next_act ON customers(organization_id, next_activity_at);
CREATE INDEX idx_customers_crm_last_act ON customers(organization_id, last_activity_at DESC);
CREATE INDEX idx_customers_trgm_name ON customers USING gin (coalesce(trade_name, legal_name) gin_trgm_ops);

CREATE INDEX idx_customer_locations_lookup ON customer_locations(organization_id, customer_id, is_active);
CREATE INDEX idx_contacts_lookup ON contacts(organization_id, customer_id, is_active);
CREATE INDEX idx_contacts_location ON contacts(organization_id, location_id);
CREATE INDEX idx_contacts_email ON contacts(organization_id, email);
CREATE INDEX idx_contacts_trgm_name ON contacts USING gin ((first_name || ' ' || last_name) gin_trgm_ops);

CREATE INDEX idx_activities_customer_date ON activities(organization_id, customer_id, occurred_at DESC);
CREATE INDEX idx_activities_creator_date ON activities(organization_id, created_by, occurred_at DESC);

CREATE INDEX idx_tasks_assigned_due ON tasks(organization_id, assigned_to, status, due_at);
CREATE INDEX idx_tasks_customer_due ON tasks(organization_id, customer_id, status, due_at);

CREATE INDEX idx_crm_events_customer_date ON crm_events(organization_id, customer_id, occurred_at DESC);
CREATE INDEX idx_customer_tags_tag ON customer_tags(organization_id, tag_id);

CREATE INDEX idx_quotes_crm_contact ON quotes(organization_id, contact_id);
CREATE INDEX idx_quotes_crm_location ON quotes(organization_id, location_id);

-------------------------------------------------------------------------------
-- 10. Data Migration: shipping_address to customer_locations
-------------------------------------------------------------------------------

INSERT INTO customer_locations (organization_id, customer_id, name, location_type, address, is_primary, is_active)
SELECT 
  c.organization_id,
  c.id AS customer_id,
  'Siège social / Livraison' AS name,
  'delivery' AS location_type,
  c.shipping_address AS address,
  true AS is_primary,
  true AS is_active
FROM customers c
WHERE c.shipping_address IS NOT NULL 
  AND c.shipping_address != '{}'::jsonb
  AND NOT EXISTS (
    SELECT 1 FROM customer_locations cl 
    WHERE cl.customer_id = c.id
  );
