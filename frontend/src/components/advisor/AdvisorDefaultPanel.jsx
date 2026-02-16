import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import CaseloadEngagementSummary from './CaseloadEngagementSummary';
import AdvisorActivityFeed from './AdvisorActivityFeed';

const AdvisorDefaultPanel = ({ caseloadSummary }) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 p-6 overflow-y-auto h-full">
      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <button
          onClick={() => navigate('/advisor/verification')}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-left hover:shadow-md transition-shadow group"
        >
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg p-2 group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Verify Work</h3>
              <p className="text-xs text-gray-500">Review subject credits</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => navigate('/advisor/invitations')}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-left hover:shadow-md transition-shadow group"
        >
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg p-2 group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Invite to Quests</h3>
              <p className="text-xs text-gray-500">Assign quests to students</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => navigate('/advisor/collaborations')}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-left hover:shadow-md transition-shadow group"
        >
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg p-2 group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Collaborations</h3>
              <p className="text-xs text-gray-500">Manage student teams</p>
            </div>
          </div>
        </button>
      </div>

      {/* Caseload Engagement Summary */}
      <CaseloadEngagementSummary summary={caseloadSummary} />

      {/* Activity Feed */}
      <AdvisorActivityFeed />
    </div>
  );
};

AdvisorDefaultPanel.propTypes = {
  caseloadSummary: PropTypes.object,
};

export default AdvisorDefaultPanel;
