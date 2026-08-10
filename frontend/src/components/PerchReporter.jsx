import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOrganization } from '../contexts/OrganizationContext';
import { isStaffUser } from '../utils/userRoles';

/**
 * Perch — Shortbird's in-app issue reporting button (perch.shortbird.dev).
 *
 * School staff (teachers, org admins, superadmin — the FeedbackFab audience;
 * this replaced that beta FAB, so reports enter Perch's fix pipeline instead
 * of the /api/bug-reports pile): families and students never see the button.
 * Reports carry the org's slug (PerchConfig.tenant, read by the widget at
 * send time), so each mapped org's feedback lands under its own client in
 * Perch; staff without an org (e.g. platform superadmins) report straight to
 * the Optio project's client.
 *
 * The widget script is injected once per page load when an eligible session
 * appears, and removed (window.__perch.remove) if eligibility goes away —
 * logout, or acting-as dropping the staff role.
 */
const PERCH_SRC = 'https://perch.shortbird.dev/perch.js';
const PERCH_KEY = '6ec0c483-232c-4f0e-85b7-d5b38cbca50f';

export default function PerchReporter() {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const slug = organization?.slug || '';
  const eligible = isStaffUser(user);

  useEffect(() => {
    if (!eligible) {
      window.__perch?.remove?.();
      return;
    }
    // Config before script: perch.js reads key/position at load, tenant at
    // send time — updating tenant here also covers an org switch without a
    // reload.
    window.PerchConfig = Object.assign(window.PerchConfig || {}, {
      key: PERCH_KEY,
      tenant: slug,
      release: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev',
    });
    if (!document.querySelector(`script[src="${PERCH_SRC}"]`)) {
      const s = document.createElement('script');
      s.src = PERCH_SRC;
      s.defer = true;
      document.head.appendChild(s);
    }
  }, [eligible, slug]);

  return null;
}
