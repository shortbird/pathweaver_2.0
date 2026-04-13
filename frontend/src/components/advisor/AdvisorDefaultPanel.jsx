import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AdvisorActivityFeed from './AdvisorActivityFeed';

const AdvisorDefaultPanel = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="space-y-6 p-6 overflow-y-auto h-full">
      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
              <h3 className="text-sm font-semibold text-gray-900">Assign Quests</h3>
              <p className="text-xs text-gray-500">Add quests to student libraries</p>
            </div>
          </div>
        </button>

        {user?.role === 'superadmin' && (
          <button
            onClick={() => navigate('/credit-dashboard')}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-left hover:shadow-md transition-shadow group"
          >
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg p-2 group-hover:scale-105 transition-transform">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Credit Review</h3>
                <p className="text-xs text-gray-500">Review and approve credit items</p>
              </div>
            </div>
          </button>
        )}

      </div>

      {/* Activity Feed */}
      <AdvisorActivityFeed />
    </div>
  );
};


export default AdvisorDefaultPanel;
