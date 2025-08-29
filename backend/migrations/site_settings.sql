-- Create site_settings table for storing site configuration
CREATE TABLE IF NOT EXISTS site_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    logo_url TEXT,
    favicon_url TEXT,
    site_name VARCHAR(255) DEFAULT 'Optio',
    site_description TEXT,
    meta_keywords TEXT,
    footer_text TEXT,
    primary_color VARCHAR(7),
    secondary_color VARCHAR(7),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable Row Level Security
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access
CREATE POLICY "Public can read site settings" ON site_settings
    FOR SELECT
    USING (true);

-- Create policy for admin write access
CREATE POLICY "Admins can manage site settings" ON site_settings
    FOR ALL
    USING (
        auth.jwt() ->> 'role' = 'admin'
    );

-- Create storage bucket for site assets (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-assets', 'site-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy for public read access
CREATE POLICY "Public can view site assets" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'site-assets');

-- Create storage policy for admin upload access
CREATE POLICY "Admins can upload site assets" ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'site-assets' 
        AND auth.jwt() ->> 'role' = 'admin'
    );

-- Create storage policy for admin update access
CREATE POLICY "Admins can update site assets" ON storage.objects
    FOR UPDATE
    USING (
        bucket_id = 'site-assets' 
        AND auth.jwt() ->> 'role' = 'admin'
    );

-- Create storage policy for admin delete access
CREATE POLICY "Admins can delete site assets" ON storage.objects
    FOR DELETE
    USING (
        bucket_id = 'site-assets' 
        AND auth.jwt() ->> 'role' = 'admin'
    );

-- Insert default settings (only if table is empty)
INSERT INTO site_settings (id, site_name, footer_text, created_at, updated_at)
SELECT 
    gen_random_uuid(),
    'Optio',
    '© 2025 Optio. All rights reserved.',
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM site_settings LIMIT 1);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_site_settings_updated_at 
    BEFORE UPDATE ON site_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();