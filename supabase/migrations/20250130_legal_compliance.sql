-- Legal Compliance Migration
-- Adds fields required for COPPA, GDPR, and CCPA compliance

-- Add COPPA compliance fields (parental consent for users under 13)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS requires_parental_consent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS parental_consent_email VARCHAR,
ADD COLUMN IF NOT EXISTS parental_consent_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS parental_consent_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS parental_consent_token VARCHAR UNIQUE;

-- Add account deletion fields (GDPR/CCPA right to erasure)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deletion_status VARCHAR CHECK (deletion_status IN ('none', 'pending', 'completed')) DEFAULT 'none',
ADD COLUMN IF NOT EXISTS deletion_scheduled_for TIMESTAMPTZ;

-- Add communication preferences (GDPR/CAN-SPAM)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS marketing_emails_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS product_updates_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS educational_content_enabled BOOLEAN DEFAULT true;

-- Create index for parental consent lookup
CREATE INDEX IF NOT EXISTS idx_users_parental_consent_token ON public.users(parental_consent_token) WHERE parental_consent_token IS NOT NULL;

-- Create index for deletion status lookup
CREATE INDEX IF NOT EXISTS idx_users_deletion_status ON public.users(deletion_status) WHERE deletion_status != 'none';

-- Create function to calculate age
CREATE OR REPLACE FUNCTION public.calculate_age(birth_date DATE)
RETURNS INTEGER AS $$
BEGIN
  RETURN EXTRACT(YEAR FROM AGE(birth_date));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create function to check if user requires parental consent
CREATE OR REPLACE FUNCTION public.check_parental_consent_requirement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.date_of_birth IS NOT NULL THEN
    NEW.requires_parental_consent := (calculate_age(NEW.date_of_birth) < 13);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically set requires_parental_consent
DROP TRIGGER IF EXISTS trigger_check_parental_consent ON public.users;
CREATE TRIGGER trigger_check_parental_consent
BEFORE INSERT OR UPDATE OF date_of_birth ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.check_parental_consent_requirement();

-- Create deletion audit log table
CREATE TABLE IF NOT EXISTS public.account_deletion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  email VARCHAR NOT NULL,
  first_name VARCHAR,
  last_name VARCHAR,
  deletion_requested_at TIMESTAMPTZ NOT NULL,
  deletion_completed_at TIMESTAMPTZ,
  reason TEXT,
  user_data JSONB, -- Snapshot of user data at deletion time
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for deletion log lookups
CREATE INDEX IF NOT EXISTS idx_account_deletion_log_user_id ON public.account_deletion_log(user_id);
CREATE INDEX IF NOT EXISTS idx_account_deletion_log_email ON public.account_deletion_log(email);

-- Create parental consent log table
CREATE TABLE IF NOT EXISTS public.parental_consent_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  child_email VARCHAR NOT NULL,
  parent_email VARCHAR NOT NULL,
  consent_token VARCHAR NOT NULL,
  consent_sent_at TIMESTAMPTZ DEFAULT now(),
  consent_verified_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for consent log lookups
CREATE INDEX IF NOT EXISTS idx_parental_consent_log_user_id ON public.parental_consent_log(user_id);
CREATE INDEX IF NOT EXISTS idx_parental_consent_log_token ON public.parental_consent_log(consent_token);

-- Add comment to document purpose
COMMENT ON COLUMN public.users.date_of_birth IS 'User date of birth - required for COPPA age verification';
COMMENT ON COLUMN public.users.requires_parental_consent IS 'Automatically set to true if user is under 13 years old';
COMMENT ON COLUMN public.users.parental_consent_email IS 'Parent/guardian email address for COPPA compliance';
COMMENT ON COLUMN public.users.parental_consent_verified IS 'Whether parent/guardian has verified consent';
COMMENT ON COLUMN public.users.deletion_status IS 'Account deletion status - none, pending (30-day grace period), or completed';
COMMENT ON COLUMN public.users.deletion_scheduled_for IS 'Date when account will be permanently deleted (30 days after request)';
COMMENT ON TABLE public.account_deletion_log IS 'Audit log of account deletions for compliance purposes';
COMMENT ON TABLE public.parental_consent_log IS 'Audit log of parental consent requests and verifications for COPPA compliance';