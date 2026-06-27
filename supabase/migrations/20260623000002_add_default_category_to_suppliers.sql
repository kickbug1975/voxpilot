-- Add default_category_id column to suppliers table
ALTER TABLE suppliers ADD COLUMN default_category_id uuid REFERENCES product_categories(id) ON DELETE SET NULL;
