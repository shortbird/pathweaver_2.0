-- Create subscription_tiers table for admin-editable tier configuration
-- This replaces hardcoded tier pricing across the application

CREATE TABLE IF NOT EXISTS subscription_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_key TEXT UNIQUE NOT NULL, -- 'Explore', 'Accelerate', 'Achieve', 'Excel'
  display_name TEXT NOT NULL,
  price_monthly NUMERIC(10,2) NOT NULL,
  price_yearly NUMERIC(10,2),
  description TEXT,
  features JSONB DEFAULT '[]'::jsonb,
  limitations JSONB DEFAULT '[]'::jsonb,
  badge_text TEXT,
  badge_color TEXT, -- 'gradient', 'green', etc.
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial tier data with correct pricing
INSERT INTO subscription_tiers (tier_key, display_name, price_monthly, price_yearly, description, features, limitations, badge_text, badge_color, sort_order) VALUES
('Explore', 'Explore', 0.00, 0.00, 'Perfect for exploring',
 '["Quest library access", "Track quests"]'::jsonb,
 '["Earn XP", "Portfolio Diploma"]'::jsonb,
 NULL, NULL, 1),

('Accelerate', 'Accelerate', 50.00, 498.00, 'For dedicated learners',
 '["Educator support", "Portfolio Diploma", "Team collaboration", "Earn XP"]'::jsonb,
 '[]'::jsonb,
 'POPULAR', 'gradient', 2),

('Achieve', 'Achieve', 300.00, 2988.00, 'Advanced learning',
 '["Advanced AI tutor", "Priority support", "Custom paths", "Everything in Accelerate"]'::jsonb,
 '[]'::jsonb,
 NULL, NULL, 3),

('Excel', 'Excel', 600.00, 5976.00, 'Private school experience',
 '["TWO diplomas", "1-on-1 mentorship", "Business network", "Everything in Achieve"]'::jsonb,
 '[]'::jsonb,
 'ACCREDITED', 'green', 4);

-- Create index for faster lookups
CREATE INDEX idx_subscription_tiers_tier_key ON subscription_tiers(tier_key);
CREATE INDEX idx_subscription_tiers_active ON subscription_tiers(is_active);

-- Enable Row Level Security
ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;

-- Public can read active tiers (for frontend display)
CREATE POLICY "Public can read active tiers" ON subscription_tiers
  FOR SELECT
  TO public
  USING (is_active = true);

-- Admins can manage all tiers
CREATE POLICY "Admins can manage tiers" ON subscription_tiers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_subscription_tiers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscription_tiers_updated_at
  BEFORE UPDATE ON subscription_tiers
  FOR EACH ROW
  EXECUTE FUNCTION update_subscription_tiers_updated_at();
