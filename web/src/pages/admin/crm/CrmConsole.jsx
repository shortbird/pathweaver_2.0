import React from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import GlassTabBar from '../../../components/ui/GlassTabBar'
import FunnelOverview from './FunnelOverview'
import FunnelEditor from './FunnelEditor'
import StepEditor from './StepEditor'
import LeadsList from './LeadsList'
import LeadDetail from './LeadDetail'
import SuppressionList from './SuppressionList'
import PeopleList from './PeopleList'
import PersonDetail from './PersonDetail'
import TodayPage from './TodayPage'

const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'funnels', label: 'Funnels' },
  { id: 'leads', label: 'Leads' },
  { id: 'people', label: 'People' },
  { id: 'suppressions', label: 'Suppressions' },
]

/**
 * CRM admin console shell. Mounted at /admin/crm/* from AdminPage; nested
 * routes keep every screen deep-linkable (docs/CRM_REPLACEMENT_PLAN.md).
 */
const CrmConsole = () => {
  const location = useLocation()
  const navigate = useNavigate()

  const activeTab =
    TABS.find((tab) => location.pathname.startsWith(`/admin/crm/${tab.id}`))?.id || 'funnels'

  return (
    <div>
      <div className="mb-6">
        <GlassTabBar
          size="md"
          aria-label="CRM sections"
          tabs={TABS}
          active={activeTab}
          onSelect={(id) => navigate(`/admin/crm/${id}`)}
        />
      </div>

      <Routes>
        <Route index element={<Navigate to="funnels" replace />} />
        <Route path="today" element={<TodayPage />} />
        <Route path="funnels" element={<FunnelOverview />} />
        <Route path="funnels/new" element={<FunnelEditor />} />
        <Route path="funnels/:funnelId" element={<FunnelEditor />} />
        <Route path="funnels/:funnelId/steps/:stepId" element={<StepEditor />} />
        <Route path="leads" element={<LeadsList />} />
        <Route path="leads/:leadId" element={<LeadDetail />} />
        <Route path="people" element={<PeopleList />} />
        <Route path="people/:personId" element={<PersonDetail />} />
        <Route path="suppressions" element={<SuppressionList />} />
        {/* Absolute on purpose: a relative "funnels" resolves against the
            unmatched path, so /admin/crm/people/x on a build without that
            route redirected to .../x/funnels, which also missed, forever. */}
        <Route path="*" element={<Navigate to="/admin/crm/funnels" replace />} />
      </Routes>
    </div>
  )
}

export default CrmConsole
