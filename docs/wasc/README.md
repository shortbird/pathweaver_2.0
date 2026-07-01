# WASC Accreditation — rollout notes

Optio Academy (Optio's own full-time online private school) is accredited by the
**Accrediting Commission for Schools, Western Association of Schools and Colleges
(ACS WASC)**, approved ~July 2026.

## What shipped in code
- **Logo asset:** `frontend/public/images/wasc-accredited.png` (unaltered ACS WASC
  "Accredited by" artwork — do NOT recolor/crop/distort per the guidelines).
- **Display copy single source:** `frontend/src/constants/accreditation.js`
  (phrase, school name, commission identity block, `ACCREDITATION_ACTIVE` kill-switch).
- **Reusable mark:** `frontend/src/components/accreditation/WascBadge.jsx`
  (`card` / `inline` / `transcript` variants).
- **Official transcript:** `PublicTranscriptPage` shows the WASC logo + phrase +
  commission block, but ONLY when the backend says the transcript is issued under
  Optio Academy's accreditation (`accreditation.source === 'optio'`).
- **Backend decision:** `backend/utils/accreditation.py` +
  `GET /api/public/transcript/<id>` now return an `accreditation` object.
- **Data model:** `supabase/migrations/20260701_org_accreditation_source.sql` adds
  `organizations.accreditation_source` ('optio' | 'self' | 'none').

## Action required (not automatable here)
1. **Apply the migration** to the DB (Supabase SQL editor or MCP). It is additive
   and safe. Platform-direct students already get the mark without it; the column
   only controls partner orgs.
2. **Set partner org flags** after migrating (see the commented backfill in the
   migration): OpenEd Academy / Hearthwood → `self` (own accreditation, must NOT
   show Optio's WASC mark); unaccredited distance-learning partners → `optio`.
3. **Confirm "Optio Academy" students** are platform-direct (organization_id IS
   NULL). If Optio Academy is instead its own org row, set that org to `optio`.
4. **If accreditation ever lapses:** set `ACCREDITATION_ACTIVE = false` in BOTH
   `frontend/src/constants/accreditation.js` and `backend/utils/accreditation.py`.

## Compliance rules (ACS WASC "Accredited" Logo Use Guidelines, 2/2021)
- Do not alter the logo artwork; no stamps/embossers made from it.
- Every public accreditation claim must include the commission identity block:
  Accrediting Commission for Schools, WASC · 533 Airport Blvd., Suite 200,
  Burlingame, CA 94010 · www.acswasc.org.
- Approved phrase (all grades, no grade note needed): "Accredited by the
  Accrediting Commission for Schools, Western Association of Schools and Colleges."
- Discontinue all use if accreditation lapses.

The source toolkit (logos, guidelines PDF, sample materials) lives in the
gitignored `School Communication Toolkit/` at repo root.
