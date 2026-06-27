-- Add default cost columns to suppliers table
ALTER TABLE suppliers ADD COLUMN default_transport_cost numeric(14,4) DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN default_handling_cost numeric(14,4) DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN default_other_fixed_cost numeric(14,4) DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN default_other_cost_percent numeric(8,6) DEFAULT 0;
