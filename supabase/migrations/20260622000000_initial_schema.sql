-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Enable citext for case-insensitive text (SKUs, emails)
CREATE EXTENSION IF NOT EXISTS citext;
-- Enable pg_trgm for fuzzy text matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigger function to update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-------------------------------------------------------------------------------
-- 1. Core Tables
-------------------------------------------------------------------------------

-- 14.1 Organizations
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  country_code char(2) DEFAULT 'BE',
  currency char(3) DEFAULT 'EUR',
  timezone text DEFAULT 'Europe/Brussels',
  vat_number text,
  address jsonb,
  phone text,
  commercial_email text,
  logo_path text,
  default_margin_rate numeric(6,5) DEFAULT 0.20,
  default_rounding_rule text DEFAULT 'up_0_05',
  default_quote_validity_days int DEFAULT 14,
  cost_increase_alert_rate numeric(6,5) DEFAULT 0.05,
  sales_can_view_costs boolean DEFAULT true,
  sales_can_override_floor boolean DEFAULT false,
  onboarding_completed_at timestamptz,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 14.2 Profiles
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  locale text DEFAULT 'fr-BE',
  last_active_organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 14.3 Organization Memberships
CREATE TABLE organization_memberships (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'sales', 'viewer')),
  status text NOT NULL CHECK (status IN ('active', 'invited', 'disabled')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

-- 14.4 Organization Invitations
CREATE TABLE organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email citext NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'sales', 'viewer')),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 14.5 Suppliers
CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  vat_number text,
  email text,
  phone text,
  address jsonb,
  currency char(3) DEFAULT 'EUR',
  payment_terms text,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 14.6 Customers
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text,
  legal_name text NOT NULL,
  trade_name text,
  vat_number text,
  primary_email text,
  cc_emails text[] DEFAULT '{}',
  phone text,
  billing_address jsonb,
  shipping_address jsonb,
  segment text CHECK (segment IN ('horeca', 'retail', 'collectivite', 'grossiste', 'autre')),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_terms text,
  public_notes text,
  internal_notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 14.7 Product Categories
CREATE TABLE product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  parent_id uuid REFERENCES product_categories(id) ON DELETE SET NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 14.8 Products
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  internal_sku citext NOT NULL,
  name text NOT NULL,
  description text,
  category_id uuid REFERENCES product_categories(id) ON DELETE SET NULL,
  ean text,
  barcode text,
  default_yield_rate numeric(8,6) DEFAULT 1.0,
  sales_unit text NOT NULL CHECK (sales_unit IN ('kg', 'unit', 'box', 'carton', 'liter', 'pallet', 'other')),
  sales_unit_label text,
  vat_rate numeric(5,4) DEFAULT 0.06,
  brand text,
  origin text,
  species text,
  grade text,
  packaging text,
  net_weight numeric(12,4),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (organization_id, internal_sku)
);

-- 14.9 Supplier Products
CREATE TABLE supplier_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_sku citext,
  supplier_label text,
  ean text,
  purchase_unit text NOT NULL,
  conversion_factor numeric(12,4) DEFAULT 1,
  yield_rate numeric(8,6) DEFAULT 1,
  transport_cost numeric(14,4) DEFAULT 0,
  handling_cost numeric(14,4) DEFAULT 0,
  other_fixed_cost numeric(14,4) DEFAULT 0,
  other_cost_percent numeric(8,6) DEFAULT 0,
  current_purchase_price numeric(14,4),
  current_landed_cost numeric(14,4),
  current_price_effective_at date,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 14.10 Import Templates
CREATE TABLE import_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  name text,
  file_type text,
  sheet_name text,
  delimiter text,
  mapping jsonb,
  settings jsonb,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 14.11 Price Imports
CREATE TABLE price_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  file_name text,
  file_path text,
  file_hash text,
  file_type text,
  sheet_name text,
  status text NOT NULL CHECK (status IN ('uploaded', 'mapping', 'validating', 'review', 'confirmed', 'failed', 'cancelled')),
  total_rows int,
  valid_rows int,
  warning_rows int,
  error_rows int,
  ignored_rows int,
  mapping jsonb,
  started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  failure_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 14.12 Price Import Rows
CREATE TABLE price_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  price_import_id uuid NOT NULL REFERENCES price_imports(id) ON DELETE CASCADE,
  row_number int NOT NULL,
  raw_data jsonb,
  normalized_data jsonb,
  supplier_sku text,
  ean text,
  label text,
  purchase_price numeric(14,4),
  currency char(3),
  purchase_unit text,
  conversion_factor numeric(12,4),
  yield_rate numeric(8,6),
  effective_date date,
  validation_status text CHECK (validation_status IN ('valid', 'warning', 'error', 'ignored')),
  validation_errors jsonb,
  match_status text CHECK (match_status IN ('auto_matched', 'review_required', 'matched', 'create_new', 'ignored', 'unmatched')),
  matched_product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  matched_supplier_product_id uuid REFERENCES supplier_products(id) ON DELETE SET NULL,
  match_score numeric(5,4),
  match_method text,
  manual_decision_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (price_import_id, row_number)
);

-- 14.13 Price Snapshots
CREATE TABLE price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_product_id uuid NOT NULL REFERENCES supplier_products(id) ON DELETE CASCADE,
  price_import_id uuid REFERENCES price_imports(id) ON DELETE SET NULL,
  source_row_id uuid REFERENCES price_import_rows(id) ON DELETE SET NULL,
  purchase_price numeric(14,4),
  base_unit_cost numeric(14,4),
  landed_cost numeric(14,4),
  currency char(3) DEFAULT 'EUR',
  effective_date date,
  calculation_breakdown jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 14.14 Margin Rules
CREATE TABLE margin_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('organization_category', 'customer', 'customer_category', 'customer_product')),
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  category_id uuid REFERENCES product_categories(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  target_margin_rate numeric(6,5) NOT NULL CHECK (target_margin_rate >= 0 AND target_margin_rate <= 0.95),
  valid_from date,
  valid_to date,
  priority int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 14.15 Product Sales Prices
CREATE TABLE product_sales_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE, -- null means global
  sales_price numeric(14,4) NOT NULL,
  effective_from date,
  effective_to date,
  source text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 14.16 Quotes
CREATE TABLE quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_number text NOT NULL,
  revision int DEFAULT 1,
  parent_quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  contact_name text,
  contact_email text,
  title text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'cancelled')),
  issue_date date NOT NULL,
  expires_at timestamptz,
  currency char(3) DEFAULT 'EUR',
  public_note text,
  internal_note text,
  terms text,
  sales_owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subtotal numeric(14,2),
  tax_total numeric(14,2),
  grand_total numeric(14,2),
  has_complete_quantities boolean,
  public_token_hash text,
  public_token_expires_at timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (organization_id, quote_number, revision)
);

-- 14.17 Quote Items
CREATE TABLE quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  position int NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_snapshot jsonb NOT NULL,
  description text,
  sales_unit text,
  quantity numeric(12,3),
  landed_cost_snapshot numeric(14,4),
  target_margin_rate numeric(6,5),
  pricing_rule_source text,
  pricing_rule_id uuid,
  recommended_price numeric(14,4),
  unit_price numeric(14,4),
  discount_rate numeric(6,5) DEFAULT 0,
  net_unit_price numeric(14,4),
  margin_amount numeric(14,4),
  margin_rate numeric(8,6),
  tax_rate numeric(5,4),
  line_subtotal numeric(14,2),
  override_justification text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 14.18 Quote Events
CREATE TABLE quote_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'customer', 'system')),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text,
  metadata jsonb,
  occurred_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 14.19 Alerts
CREATE TABLE alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL CHECK (status IN ('unread', 'read', 'resolved', 'ignored')),
  title text NOT NULL,
  message text,
  entity_type text,
  entity_id uuid,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb,
  read_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 14.20 Documents
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('quote_pdf', 'internal_export', 'import_source')),
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  checksum text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 14.21 Email Messages
CREATE TABLE email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES quotes(id) ON DELETE CASCADE,
  provider text,
  provider_message_id text,
  to_emails text[],
  cc_emails text[],
  subject text,
  status text NOT NULL CHECK (status IN ('queued', 'sent', 'failed', 'logged')),
  error_message text,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 14.22 Audit Logs
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  ip_prefix text,
  user_agent_family text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-------------------------------------------------------------------------------
-- 2. Triggers for updated_at
-------------------------------------------------------------------------------
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_organization_memberships_updated_at BEFORE UPDATE ON organization_memberships FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_organization_invitations_updated_at BEFORE UPDATE ON organization_invitations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_product_categories_updated_at BEFORE UPDATE ON product_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_supplier_products_updated_at BEFORE UPDATE ON supplier_products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_import_templates_updated_at BEFORE UPDATE ON import_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_price_imports_updated_at BEFORE UPDATE ON price_imports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_price_import_rows_updated_at BEFORE UPDATE ON price_import_rows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_price_snapshots_updated_at BEFORE UPDATE ON price_snapshots FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_margin_rules_updated_at BEFORE UPDATE ON margin_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_product_sales_prices_updated_at BEFORE UPDATE ON product_sales_prices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_quote_items_updated_at BEFORE UPDATE ON quote_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_quote_events_updated_at BEFORE UPDATE ON quote_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON alerts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_email_messages_updated_at BEFORE UPDATE ON email_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_audit_logs_updated_at BEFORE UPDATE ON audit_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-------------------------------------------------------------------------------
-- 3. Security Definer helper functions
-------------------------------------------------------------------------------

-- Check if current user is an active member of organization
CREATE OR REPLACE FUNCTION is_org_member(org_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Check if current user has role in organization
CREATE OR REPLACE FUNCTION has_org_role(org_id uuid, allowed_roles text[])
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND role = ANY(allowed_roles)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Get current user's role in organization
CREATE OR REPLACE FUNCTION current_user_role(org_id uuid)
RETURNS text AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM organization_memberships
  WHERE organization_id = org_id
    AND user_id = auth.uid()
    AND status = 'active';
  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Check if current user can view costs in organization
CREATE OR REPLACE FUNCTION can_view_costs(org_id uuid)
RETURNS boolean AS $$
DECLARE
  v_sales_can_view_costs boolean;
  v_role text;
BEGIN
  -- Get organization setting
  SELECT sales_can_view_costs INTO v_sales_can_view_costs
  FROM organizations
  WHERE id = org_id;
  
  -- Get user role
  v_role := current_user_role(org_id);
  
  -- If user is owner, admin, manager, they can always view costs.
  -- If user is sales, check organization setting (defaults to true if null).
  -- If user is viewer, they can view costs if they are a member.
  IF v_role IN ('owner', 'admin', 'manager') THEN
    RETURN TRUE;
  ELSIF v_role = 'sales' THEN
    RETURN COALESCE(v_sales_can_view_costs, TRUE);
  ELSIF v_role = 'viewer' THEN
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-------------------------------------------------------------------------------
-- 4. Enable Row Level Security (RLS) on all tables
-------------------------------------------------------------------------------
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers FORCE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
ALTER TABLE supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_products FORCE ROW LEVEL SECURITY;
ALTER TABLE import_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE price_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_imports FORCE ROW LEVEL SECURITY;
ALTER TABLE price_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_import_rows FORCE ROW LEVEL SECURITY;
ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE margin_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE margin_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE product_sales_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_sales_prices FORCE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes FORCE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items FORCE ROW LEVEL SECURITY;
ALTER TABLE quote_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_events FORCE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts FORCE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-------------------------------------------------------------------------------
-- 5. Row Level Security Policies
-------------------------------------------------------------------------------

-- 5.1 organizations
CREATE POLICY organizations_select ON organizations FOR SELECT USING (is_org_member(id));
CREATE POLICY organizations_insert ON organizations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY organizations_update ON organizations FOR UPDATE USING (has_org_role(id, ARRAY['owner', 'admin']));

-- 5.2 profiles
CREATE POLICY profiles_select ON profiles FOR SELECT USING (
  id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM organization_memberships m1 
    JOIN organization_memberships m2 ON m1.organization_id = m2.organization_id 
    WHERE m1.user_id = auth.uid() AND m2.user_id = id AND m1.status = 'active' AND m2.status = 'active'
  )
);
CREATE POLICY profiles_insert ON profiles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (id = auth.uid());

-- 5.3 organization_memberships
CREATE POLICY memberships_select ON organization_memberships FOR SELECT USING (
  user_id = auth.uid() OR is_org_member(organization_id)
);
CREATE POLICY memberships_insert ON organization_memberships FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);
CREATE POLICY memberships_update ON organization_memberships FOR UPDATE USING (
  has_org_role(organization_id, ARRAY['owner', 'admin'])
);
CREATE POLICY memberships_delete ON organization_memberships FOR DELETE USING (
  has_org_role(organization_id, ARRAY['owner', 'admin'])
);

-- 5.4 organization_invitations
CREATE POLICY invitations_select ON organization_invitations FOR SELECT USING (
  is_org_member(organization_id) OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
);
CREATE POLICY invitations_insert ON organization_invitations FOR INSERT WITH CHECK (
  has_org_role(organization_id, ARRAY['owner', 'admin'])
);
CREATE POLICY invitations_update ON organization_invitations FOR UPDATE USING (
  has_org_role(organization_id, ARRAY['owner', 'admin'])
);
CREATE POLICY invitations_delete ON organization_invitations FOR DELETE USING (
  has_org_role(organization_id, ARRAY['owner', 'admin'])
);

-- 5.5 Tenant Tables general RLS (active members can read, owner/admin/manager/sales can write)
CREATE POLICY suppliers_all ON suppliers FOR ALL USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id) AND has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'sales']));
CREATE POLICY customers_all ON customers FOR ALL USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id) AND has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'sales']));
CREATE POLICY categories_all ON product_categories FOR ALL USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id) AND has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'sales']));
CREATE POLICY products_all ON products FOR ALL USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id) AND has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'sales']));
CREATE POLICY supplier_products_all ON supplier_products FOR ALL USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id) AND has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'sales']));
CREATE POLICY import_templates_all ON import_templates FOR ALL USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id) AND has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'sales']));
CREATE POLICY price_imports_all ON price_imports FOR ALL USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id) AND has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'sales']));
CREATE POLICY price_import_rows_all ON price_import_rows FOR ALL USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id) AND has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'sales']));
CREATE POLICY price_snapshots_all ON price_snapshots FOR ALL USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id) AND has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'sales']));
CREATE POLICY margin_rules_all ON margin_rules FOR ALL USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id) AND has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'sales']));
CREATE POLICY sales_prices_all ON product_sales_prices FOR ALL USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id) AND has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'sales']));
CREATE POLICY alerts_all ON alerts FOR ALL USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id) AND has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'sales']));
CREATE POLICY documents_all ON documents FOR ALL USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id) AND has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'sales']));
CREATE POLICY email_messages_all ON email_messages FOR ALL USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id) AND has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'sales']));

-- 5.6 Quotes Custom RLS (Sales can only write/update their own drafts, managers/admins/owners can write/update all)
CREATE POLICY quotes_select ON quotes FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY quotes_insert ON quotes FOR INSERT WITH CHECK (
  is_org_member(organization_id) AND has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'sales'])
);
CREATE POLICY quotes_update ON quotes FOR UPDATE USING (
  is_org_member(organization_id) AND (
    has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']) OR
    (has_org_role(organization_id, ARRAY['sales']) AND status = 'draft' AND sales_owner_id = auth.uid())
  )
);
CREATE POLICY quotes_delete ON quotes FOR DELETE USING (
  is_org_member(organization_id) AND has_org_role(organization_id, ARRAY['owner', 'admin', 'manager'])
);

-- 5.7 Quote Items Custom RLS (Sales can only write/update items of their own drafts)
CREATE POLICY quote_items_select ON quote_items FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY quote_items_insert ON quote_items FOR INSERT WITH CHECK (
  is_org_member(organization_id) AND has_org_role(organization_id, ARRAY['owner', 'admin', 'manager', 'sales'])
);
CREATE POLICY quote_items_update ON quote_items FOR UPDATE USING (
  is_org_member(organization_id) AND (
    has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']) OR
    (has_org_role(organization_id, ARRAY['sales']) AND EXISTS (
      SELECT 1 FROM quotes WHERE id = quote_id AND status = 'draft' AND sales_owner_id = auth.uid()
    ))
  )
);
CREATE POLICY quote_items_delete ON quote_items FOR DELETE USING (
  is_org_member(organization_id) AND (
    has_org_role(organization_id, ARRAY['owner', 'admin', 'manager']) OR
    (has_org_role(organization_id, ARRAY['sales']) AND EXISTS (
      SELECT 1 FROM quotes WHERE id = quote_id AND status = 'draft' AND sales_owner_id = auth.uid()
    ))
  )
);

-- 5.8 Quote Events Custom RLS
CREATE POLICY quote_events_select ON quote_events FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY quote_events_insert ON quote_events FOR INSERT WITH CHECK (
  is_org_member(organization_id)
);

-- 5.9 Audit Logs Custom RLS (Only owner/admin can read, insert only via server function/trigger, NO updates/deletions)
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT USING (
  is_org_member(organization_id) AND has_org_role(organization_id, ARRAY['owner', 'admin'])
);
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT WITH CHECK (
  is_org_member(organization_id)
);

-- Trigger to completely block updates and deletions on audit_logs
CREATE OR REPLACE FUNCTION block_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER block_audit_log_mod_trigger
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION block_audit_log_modification();

-------------------------------------------------------------------------------
-- 6. Cost-Secure Views (with security_invoker = true)
-------------------------------------------------------------------------------

CREATE VIEW view_supplier_products WITH (security_invoker = true) AS
SELECT
  id,
  organization_id,
  supplier_id,
  product_id,
  supplier_sku,
  supplier_label,
  ean,
  purchase_unit,
  conversion_factor,
  yield_rate,
  CASE WHEN can_view_costs(organization_id) THEN transport_cost ELSE NULL END as transport_cost,
  CASE WHEN can_view_costs(organization_id) THEN handling_cost ELSE NULL END as handling_cost,
  CASE WHEN can_view_costs(organization_id) THEN other_fixed_cost ELSE NULL END as other_fixed_cost,
  CASE WHEN can_view_costs(organization_id) THEN other_cost_percent ELSE NULL END as other_cost_percent,
  CASE WHEN can_view_costs(organization_id) THEN current_purchase_price ELSE NULL END as current_purchase_price,
  CASE WHEN can_view_costs(organization_id) THEN current_landed_cost ELSE NULL END as current_landed_cost,
  current_price_effective_at,
  is_active,
  created_at,
  updated_at
FROM supplier_products;

CREATE VIEW view_price_snapshots WITH (security_invoker = true) AS
SELECT
  id,
  organization_id,
  supplier_product_id,
  price_import_id,
  source_row_id,
  CASE WHEN can_view_costs(organization_id) THEN purchase_price ELSE NULL END as purchase_price,
  CASE WHEN can_view_costs(organization_id) THEN base_unit_cost ELSE NULL END as base_unit_cost,
  CASE WHEN can_view_costs(organization_id) THEN landed_cost ELSE NULL END as landed_cost,
  currency,
  effective_date,
  CASE WHEN can_view_costs(organization_id) THEN calculation_breakdown ELSE NULL END as calculation_breakdown,
  is_active,
  created_at,
  updated_at
FROM price_snapshots;

CREATE VIEW view_quote_items WITH (security_invoker = true) AS
SELECT
  id,
  organization_id,
  quote_id,
  position,
  product_id,
  product_snapshot,
  description,
  sales_unit,
  quantity,
  CASE WHEN can_view_costs(organization_id) THEN landed_cost_snapshot ELSE NULL END as landed_cost_snapshot,
  target_margin_rate,
  pricing_rule_source,
  pricing_rule_id,
  recommended_price,
  unit_price,
  discount_rate,
  net_unit_price,
  margin_amount,
  margin_rate,
  tax_rate,
  line_subtotal,
  override_justification,
  created_by,
  created_at,
  updated_at
FROM quote_items;

-------------------------------------------------------------------------------
-- 7. Indexes (Section 15 of PRD)
-------------------------------------------------------------------------------
CREATE INDEX idx_organizations_slug ON organizations(slug);

CREATE UNIQUE INDEX idx_products_org_sku ON products(organization_id, internal_sku);
CREATE INDEX idx_products_org_name_lower ON products(organization_id, lower(name));

CREATE INDEX idx_customers_org_name_lower ON customers(organization_id, lower(legal_name));
CREATE INDEX idx_suppliers_org_name_lower ON suppliers(organization_id, lower(name));

CREATE UNIQUE INDEX idx_suppliers_org_code ON suppliers(organization_id, lower(code)) WHERE code IS NOT NULL;
CREATE UNIQUE INDEX idx_product_categories_org_parent_name ON product_categories(organization_id, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

CREATE UNIQUE INDEX idx_supplier_products_org_supp_sku ON supplier_products(organization_id, supplier_id, supplier_sku) WHERE supplier_sku IS NOT NULL;

CREATE UNIQUE INDEX idx_price_import_rows_import_row ON price_import_rows(price_import_id, row_number);
CREATE INDEX idx_price_snapshots_product_date ON price_snapshots(supplier_product_id, effective_date DESC);

CREATE INDEX idx_quotes_org_status_created ON quotes(organization_id, status, created_at DESC);
CREATE INDEX idx_alerts_org_status_priority_created ON alerts(organization_id, status, priority, created_at DESC);
CREATE INDEX idx_audit_logs_org_created ON audit_logs(organization_id, created_at DESC);
