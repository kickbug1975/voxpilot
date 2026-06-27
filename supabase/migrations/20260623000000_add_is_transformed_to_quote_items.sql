-- Add is_transformed column to quote_items table
ALTER TABLE quote_items ADD COLUMN is_transformed boolean DEFAULT true;

-- Recreate view_quote_items to include is_transformed
DROP VIEW IF EXISTS view_quote_items;

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
  is_transformed,
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
