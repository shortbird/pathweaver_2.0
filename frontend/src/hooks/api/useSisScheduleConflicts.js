import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'

/**
 * Answering a schedule double-booking warning.
 *
 * iCreate, 2026-09-05 (8479edee): "I'd like to have a button to hit that allows
 * me to acknowledge I've seen it, but I think it's ok, so clear it from the
 * warnings."
 *
 * A plain function rather than a hook: this is a write with no cached read of
 * its own — the Classes page already holds the conflict lists, and the server
 * returns them split into live and acknowledged on the next load. It lives here
 * rather than inline on the page so pages/ keeps no request of its own (see
 * __tests__/dataFetchingParadigm.test.js).
 *
 * The acknowledgement is org-wide and reversible; the key comes from the
 * conflict row and carries the day and hour, so rescheduling either class
 * raises the warning again.
 */
export const acknowledgeScheduleConflict = (orgId, key, acknowledged = true) =>
  api.post(withOrg('/api/sis/schedule-conflicts/acknowledge', orgId), { key, acknowledged })

export default acknowledgeScheduleConflict
