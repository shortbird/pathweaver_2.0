-- School-friendly defaults: enable due_dates and scheduled_publish for
-- organizations that have not explicitly set those flags. New orgs get these
-- defaults at creation (organization_service.create_organization); this
-- backfills existing orgs so teachers don't hit "not enabled for this
-- organization" errors on day one. Orgs that explicitly set a flag (true or
-- false) are left untouched.

UPDATE public.organizations
SET feature_flags = jsonb_build_object('due_dates', true, 'scheduled_publish', true)
                    || COALESCE(feature_flags, '{}'::jsonb)
WHERE feature_flags IS NULL
   OR NOT (feature_flags ? 'due_dates')
   OR NOT (feature_flags ? 'scheduled_publish');
