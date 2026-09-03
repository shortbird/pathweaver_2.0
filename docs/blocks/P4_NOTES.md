# Blocks P4 — de-hardcoding: what changed and what still needs a prod write

P4 converts org-identity hardcodes into per-org flags **flag-first with the
old hardcode as a transition fallback**, so behavior is identical with zero
data dependency. Retiring each fallback needs one prod `feature_flags` write
after this branch deploys, then the fallback code deletes.

## New flags (all read flag-first, hardcode fallback)

| Flag | Where read | Fallback being retired | Prod write needed |
|---|---|---|---|
| `sis_settings.family_first_home` | `config/optioAcademy.js` (via `school` payload + school-context entries) | `OPTIO_ACADEMY_ORG_ID` UUID | set on Optio Academy (`8ee22671-…`) |
| `feature_flags.simplified_partner_dashboard` | `config/partnerOrgs.js` | `ONFIRE_ORG_ID` UUID | set on OnFire (`1c675e5e-…`) |
| `feature_flags.suppress_support_copy` | `services/email_service.py` | `SUPPORT_COPY_EXCLUDE_ORG_SLUGS = {'icreate'}` | set on iCreate |
| `feature_flags.quest_groups_enabled` | `components/organization/QuestsTab.jsx` | `slug === 'treehouse'` | set on Treehouse |

After each write lands (and the deploy carrying this code is live), delete the
corresponding fallback constant/check — each is marked with a comment pointing
here.

## Registration plumbing

- **Dual-key collapse (half done here, half post-deploy).** The write MIRROR
  in `utils/registration_config.py` is gone (prod has read the canonical
  `registration` key since 2026-08-10). Remaining, post-deploy:
  1. Scrub `feature_flags.icreate_registration` from the org rows that still
     carry it (copy to `registration` first if any row has only the legacy key).
  2. Then delete `LEGACY_REGISTRATION_FLAG` + the read fallback in
     `get_registration_config`, and the secret-stripping twin coverage.
- **Route→route import broken.** `finish_fee_step` / `org_funnel_config`
  moved to `services/registration_funnel_service.py`; both the funnel routes
  and the SIS waive-fee endpoint call the service.
- **`registration_repository.py`** owns the physical table name
  (`icreate_registrations`) in one constant. The ~38 legacy references migrate
  opportunistically; no physical rename (ARCHITECTURE_BLOCKS §7).
- **Neutral funnel URL already shipped**: `/enroll/<code>` is the canonical
  org-neutral path; `register/icreate/*` stays alive forever for distributed
  links (Gryffin's live link). Nothing further needed.

## Program registry

`programs/registry.py` gained `primary_org_slug(key)`; both treehouse modules
derive `TREEHOUSE_SLUG` from it instead of re-declaring the slug.

## Deliberately NOT converted

- `RosterImportPage`'s Hearthwood pre-select and `sisOrgStore`'s iCreate
  default: superadmin UI conveniences, not capability gates — a flag would
  add config surface with zero user value.
- `AcceptInvitationPage`'s `slug === 'icreate'` beside
  `uses_registration_funnel`: the flag check already comes first; the slug
  fallback is load-bearing until iCreate's flags carry
  `registration.enabled` (P0 finding: its funnel config is code-side).
  Retire it in the same pass that moves iCreate's funnel config into flags.
