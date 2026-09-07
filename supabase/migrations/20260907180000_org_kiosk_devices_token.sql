-- Kiosk device codes stay visible to the school.
--
-- Arete Academy, 2026-09-07: the code an admin pastes into a classroom iPad
-- was shown once at provisioning and never again — only its sha256 hash was
-- stored (routes/kiosk.py, modelled on the Treehouse kiosk). Tanner's call:
-- the code does not need to be hidden from the org's own admins, who already
-- manage every student it can log in. Losing it meant deactivating the device
-- and pairing the iPad again.
--
-- So the plaintext is kept alongside the hash. Lookups still go through the
-- hash (UNIQUE); the plaintext exists only so the settings card can show it.
-- Nullable: devices provisioned before this column have no plaintext and the
-- card says so. The table stays deny-all RLS; the backend reads it with the
-- service role and the org check in _caller_org_id is the authorization.

ALTER TABLE public.org_kiosk_devices
  ADD COLUMN IF NOT EXISTS token text;

COMMENT ON COLUMN public.org_kiosk_devices.token IS
  'Plaintext device code, shown on the org settings card. NULL for devices provisioned before 2026-09-07; token_hash remains the lookup key.';
