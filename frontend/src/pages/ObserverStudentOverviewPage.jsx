import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import ChildOverviewContent from '../components/parent/ChildOverviewContent';

/**
 * Observer Student Overview Page
 *
 * Displays a student's overview when clicking their profile from the observer feed.
 * Has a prominent back button to return to the feed.
 */
const ObserverStudentOverviewPage = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();

  const handleBack = () => {
    navigate('/observer/feed');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky header with back button */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg font-medium transition-colors"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Back to Activity Feed
          </button>
        </div>
      </div>

      {/* Student overview content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <ChildOverviewContent
          studentId={studentId}
          isDependent={false}
          viewMode="observer"
        />
      </div>
    </div>
  );
};

export default ObserverStudentOverviewPage;
