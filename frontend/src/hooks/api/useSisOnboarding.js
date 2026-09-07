import { useQuery } from '@tanstack/react-query'

import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import { queryKeys } from '../../utils/queryKeys'

/**
 * The onboarding checklists, staff-side and admin-side (QF-03).
 *
 * OnboardingPage carried 17 hand-rolled call sites across four components, and
 * the assignments list was fetched by two of them independently:
 * `AdminOnboarding` renders it, and `ChecklistTemplatesManager` asks for the
 * same list again just to count how many assignments a template has before
 * offering to sync it. Sharing a key makes the second one free.
 *
 * `preview` is an admin looking at somebody else's checklist. It is part of the
 * cache key, not just the URL: without it, an admin who previewed a teacher and
 * then opened their own checklist would be served the teacher's.
 */

const withPreview = (url, preview) =>
  (preview?.id ? `${url}${url.includes('?') ? '&' : '?'}preview_user_id=${preview.id}` : url)

export const useMyOnboarding = (orgId, preview = null) => useQuery({
  queryKey: queryKeys.sis.myOnboarding(orgId, preview?.id || null),
  queryFn: async () => {
    const r = await api.get(withPreview(withOrg('/api/sis/teacher/onboarding', orgId), preview))
    return r.data?.assignments || []
  },
  enabled: !!orgId,
  staleTime: 30 * 1000,
})

export const useOnboardingAssignments = (orgId) => useQuery({
  queryKey: queryKeys.sis.onboardingAssignments(orgId),
  queryFn: async () => {
    const r = await api.get(withOrg('/api/sis/staff-admin/onboarding/assignments', orgId))
    return r.data?.assignments || []
  },
  enabled: !!orgId,
  staleTime: 30 * 1000,
})

export const useOnboardingTemplates = (orgId) => useQuery({
  queryKey: queryKeys.sis.onboardingTemplates(orgId),
  queryFn: async () => {
    const r = await api.get(withOrg('/api/sis/staff-admin/onboarding/templates', orgId))
    return r.data?.templates || []
  },
  enabled: !!orgId,
  staleTime: 60 * 1000,
})

export const sisOnboardingApi = {
  patchItem: (assignmentId, itemKey, orgId, fields) =>
    api.patch(`/api/sis/teacher/onboarding/${assignmentId}/items/${itemKey}`, {
      organization_id: orgId, ...fields,
    }),
  upload: (orgId, file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(withOrg('/api/sis/teacher/onboarding/upload', orgId), form)
  },
  docUrl: (orgId, path) =>
    api.get(withOrg(`/api/sis/teacher/onboarding/doc-url?path=${encodeURIComponent(path)}`, orgId)),
  signDocUrl: (orgId, docId, preview) =>
    api.get(withPreview(withOrg(`/api/sis/teacher/my-documents/${docId}/url`, orgId), preview)),
  // Admin side. `url` is built by the caller: an uploaded blob is addressed by
  // path in the checklist bucket, a filed document by its id in the secure
  // store, and only the caller knows which it is holding.
  signedUrl: (url) => api.get(url),
  attachableDocuments: (assignmentId, orgId) =>
    api.get(withOrg(`/api/sis/staff-admin/onboarding/assignments/${assignmentId}/attachable-documents`, orgId)),
  unassign: (assignmentId, orgId) =>
    api.delete(withOrg(`/api/sis/staff-admin/onboarding/assignments/${assignmentId}`, orgId)),
  saveTemplate: (templateId, body) => (templateId
    ? api.put(`/api/sis/staff-admin/onboarding/templates/${templateId}`, body)
    : api.post('/api/sis/staff-admin/onboarding/templates', body)),
  duplicateTemplate: (templateId) =>
    api.post(`/api/sis/staff-admin/onboarding/templates/${templateId}/duplicate`, {}),
  syncTemplate: (templateId) =>
    api.post(`/api/sis/staff-admin/onboarding/templates/${templateId}/sync`, {}),
  deleteTemplate: (templateId, orgId, force = false) =>
    api.delete(withOrg(`/api/sis/staff-admin/onboarding/templates/${templateId}${force ? '?force=1' : ''}`, orgId)),
}

export default useMyOnboarding
