-- Vendor accounts
CREATE TABLE IF NOT EXISTS vendor_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  shop_name text NOT NULL DEFAULT 'Street Food',
  shop_phone text,
  shop_address text,
  shop_hours text DEFAULT '08:00 – 22:00',
  shop_food_type text DEFAULT 'Indonesian & Street Food',
  shop_maps_link text,
  shop_instagram text,
  shop_tiktok text,
  shop_open boolean DEFAULT true,
  slug text UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Menu items for basic vendors
CREATE TABLE IF NOT EXISTS vendor_menu_items (
  id bigserial PRIMARY KEY,
  vendor_id uuid REFERENCES vendor_accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric NOT NULL,
  description text,
  category text DEFAULT 'Nasi Goreng',
  photo_url text,
  available boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_menu_vendor ON vendor_menu_items(vendor_id);
