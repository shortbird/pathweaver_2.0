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
    <div className="bg-gray-50 min-h-0">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Back to feed */}
        <button
          onClick={handleBack}
          className="flex items-center gap-2 mb-4 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Activity Feed
        </button>
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
