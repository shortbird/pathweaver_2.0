/**
 * This family's own volunteer hours at one school -- the mobile twin of the
 * web hook (web/src/hooks/api/useFamilyVolunteerHours.js), against the same
 * endpoint.
 *
 * iCreate 2fab910a/9db5bde3: "I know you just added a tracker to track hours
 * and also comments for it... I'm not seeing it from the parent side. Is there
 * a way to make it so that the parents can also see the notes and the hours?"
 * Until then the phone had no volunteer hours at all.
 *
 * GET /api/sis/parent/volunteer-hours answers only for the family's own
 * guardians (404 for anyone else). `shown` is the server's call: true when
 * this family has hours or the school has entered hours for any family, so a
 * school that never uses the field shows nothing. `shown` is false while
 * loading and on any failure: the line is a nicety, never an error.
 */
import { useEffect, useState } from 'react';
import api from '@/src/services/api';

export interface FamilyVolunteerHours {
  hours: number | null;
  updatedAt: string | null;
  note: string | null;
  shown: boolean;
}

const NONE: FamilyVolunteerHours = { hours: null, updatedAt: null, note: null, shown: false };

/** The endpoint's answer, as far as this hook reads it. */
interface VolunteerHoursResponse {
  volunteer_hours?: number | string | null;
  updated_at?: string | null;
  note?: string | null;
  shown?: boolean;
}

export function readVolunteerHours(data: VolunteerHoursResponse | null | undefined): FamilyVolunteerHours {
  if (!data) return NONE;
  return {
    hours: Number(data.volunteer_hours || 0),
    updatedAt: data.updated_at || null,
    note: String(data.note || '').trim() || null,
    shown: Boolean(data.shown),
  };
}

export function useFamilyVolunteerHours(
  organizationId?: string | null,
  enabled = true,
): FamilyVolunteerHours {
  const [state, setState] = useState<FamilyVolunteerHours>(NONE);
  useEffect(() => {
    if (!organizationId || !enabled) { setState(NONE); return undefined; }
    let cancelled = false;
    api.get<VolunteerHoursResponse>('/api/sis/parent/volunteer-hours', { params: { organization_id: organizationId } })
      .then(({ data }) => { if (!cancelled) setState(readVolunteerHours(data)); })
      .catch(() => { if (!cancelled) setState(NONE); });
    return () => { cancelled = true; };
  }, [organizationId, enabled]);
  return state;
}
