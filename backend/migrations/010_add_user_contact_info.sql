-- Migration: Add phone number and address fields to users table
-- Description: Adds optional contact information fields for user registration
-- Date: 2025-10-16

-- Add phone and address columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address_line1 TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address_line2 TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT;

-- Add comments for documentation
COMMENT ON COLUMN users.phone_number IS 'User phone number (optional)';
COMMENT ON COLUMN users.address_line1 IS 'User address line 1 (optional)';
COMMENT ON COLUMN users.address_line2 IS 'User address line 2 (optional)';
COMMENT ON COLUMN users.city IS 'User city (optional)';
COMMENT ON COLUMN users.state IS 'User state/province (optional)';
COMMENT ON COLUMN users.postal_code IS 'User postal/zip code (optional)';
COMMENT ON COLUMN users.country IS 'User country (optional)';
