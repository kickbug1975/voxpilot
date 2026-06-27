-- BlueMargin Minimal Seed Data

-- Create default demo organization
INSERT INTO organizations (
  id,
  name,
  slug,
  country_code,
  currency,
  timezone,
  default_margin_rate,
  default_rounding_rule,
  default_quote_validity_days,
  cost_increase_alert_rate,
  sales_can_view_costs,
  sales_can_override_floor
) VALUES (
  'e6326d9c-df7c-4860-93a0-c65d6c8b9a11',
  'Demo Maree Belgique',
  'demo-maree-belgique',
  'BE',
  'EUR',
  'Europe/Brussels',
  0.25000,
  'up_0_05',
  14,
  0.05000,
  true,
  false
) ON CONFLICT (slug) DO NOTHING;
