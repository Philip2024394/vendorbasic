-- Activation codes
CREATE TABLE IF NOT EXISTS activation_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  status text DEFAULT 'unused',
  plan text DEFAULT 'basic',
  days int DEFAULT 30,
  price numeric DEFAULT 35000,
  assigned_to text,
  used_by_vendor uuid REFERENCES vendor_accounts(id),
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_codes_status ON activation_codes(status);

-- Add subscription fields to vendor_accounts
ALTER TABLE vendor_accounts ADD COLUMN IF NOT EXISTS plan text DEFAULT 'basic';
ALTER TABLE vendor_accounts ADD COLUMN IF NOT EXISTS plan_price numeric DEFAULT 35000;
ALTER TABLE vendor_accounts ADD COLUMN IF NOT EXISTS activated_at timestamptz;
ALTER TABLE vendor_accounts ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE vendor_accounts ADD COLUMN IF NOT EXISTS activated_by text;
ALTER TABLE vendor_accounts ADD COLUMN IF NOT EXISTS city text DEFAULT 'Yogyakarta';
ALTER TABLE vendor_accounts ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';

-- Payment tracking
CREATE TABLE IF NOT EXISTS payment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES vendor_accounts(id),
  amount numeric NOT NULL,
  period_start timestamptz,
  period_end timestamptz,
  status text DEFAULT 'paid',
  activation_code text,
  collected_by text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_vendor ON payment_records(vendor_id);
