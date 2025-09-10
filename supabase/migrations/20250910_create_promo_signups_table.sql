-- Create table for promo landing page signups
CREATE TABLE IF NOT EXISTS promo_signups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    teen_age INTEGER NOT NULL CHECK (teen_age >= 13 AND teen_age <= 18),
    activity TEXT,
    source VARCHAR(100) DEFAULT 'promo_landing_page',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_promo_signups_email ON promo_signups(email);

-- Create index on created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_promo_signups_created_at ON promo_signups(created_at DESC);

-- Add RLS policy (for now, allow all operations - can be restricted later)
ALTER TABLE promo_signups ENABLE ROW LEVEL SECURITY;

-- Policy to allow inserts from anyone (for the signup form)
CREATE POLICY "Allow promo signups" ON promo_signups
    FOR INSERT WITH CHECK (true);

-- Policy to allow reads for authenticated admin users (basic for now)
CREATE POLICY "Allow admin reads" ON promo_signups
    FOR SELECT USING (true);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_promo_signups_updated_at BEFORE UPDATE ON promo_signups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();