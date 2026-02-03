import { useNavigate } from 'react-router-dom';
import Button from '../ui/Button';
import Card from '../ui/Card';

/**
 * ConsentBlockedOverlay Component
 * Displays when a user requires parental consent but hasn't been verified
 * COPPA compliance blocking UI
 */
export default function ConsentBlockedOverlay({ consentStatus, onRetry }) {
  const navigate = useNavigate();

  const getStatusConfig = () => {
    switch (consentStatus) {
      case 'pending_submission':
        return {
          icon: (
            <svg className="w-16 h-16 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ),
          color: 'yellow',
          title: 'Parental Consent Required',
          message: 'Your account requires parental consent verification before you can access the platform.',
          action: 'Submit Documents',
          actionVariant: 'primary',
          onAction: () => navigate('/parental-consent'),
          steps: [
            'Have your parent or guardian upload their government-issued ID',
            'Upload a signed parental consent form',
            'Wait 24-48 hours for verification',
            'Access the platform once approved'
          ]
        };

      case 'pending_review':
        return {
          icon: (
            <svg className="w-16 h-16 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
          color: 'blue',
          title: 'Documents Under Review',
          message: 'Your parental consent documents are being reviewed by our team. This typically takes 24-48 hours.',
          action: 'Refresh Status',
          actionVariant: 'outline',
          onAction: onRetry,
          steps: [
            'Your documents have been received',
            'Our compliance team is reviewing the submitted ID and consent form',
            'You will receive an email when the review is complete',
            'Check back soon for updates'
          ]
        };

      case 'rejected':
        return {
          icon: (
            <svg className="w-16 h-16 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
          color: 'red',
          title: 'Additional Information Needed',
          message: 'Your parental consent documents need to be resubmitted. Please check your parent\'s email for details.',
          action: 'Resubmit Documents',
          actionVariant: 'primary',
          onAction: () => navigate('/parental-consent'),
          steps: [
            'Review the feedback sent to your parent\'s email',
            'Prepare clear, legible photos of required documents',
            'Resubmit the corrected documents',
            'Wait for the new review (24-48 hours)'
          ]
        };

      default:
        return {
          icon: (
            <svg className="w-16 h-16 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
          color: 'gray',
          title: 'Verification Required',
          message: 'Your account requires parental consent verification.',
          action: 'Contact Support',
          actionVariant: 'outline',
          onAction: () => window.location.href = 'mailto:support@optioeducation.com',
          steps: []
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <Card className="max-w-2xl w-full">
        <div className="text-center">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            {config.icon}
          </div>

          {/* Title and Message */}
          <h2 className="text-2xl font-bold text-gray-900 mb-3">{config.title}</h2>
          <p className="text-gray-600 mb-8 text-lg">{config.message}</p>

          {/* Progress Steps */}
          {config.steps.length > 0 && (
            <div className={`bg-${config.color}-50 border border-${config.color}-200 rounded-lg p-6 mb-8 text-left`}>
              <h3 className={`font-semibold text-${config.color}-900 mb-4`}>What You Need to Do:</h3>
              <ol className="space-y-3">
                {config.steps.map((step, index) => (
                  <li key={index} className="flex items-start">
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full bg-${config.color}-200 text-${config.color}-800 flex items-center justify-center text-sm font-medium mr-3`}>
                      {index + 1}
                    </span>
                    <span className={`text-${config.color}-800 text-sm mt-0.5`}>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Action Button */}
          <div className="flex gap-4 justify-center">
            <Button
              variant={config.actionVariant}
              size="lg"
              onClick={config.onAction}
              className="min-w-[200px]"
            >
              {config.action}
            </Button>
          </div>

          {/* Support Link */}
          <p className="text-sm text-gray-500 mt-6">
            Questions?{' '}
            <a
              href="mailto:support@optioeducation.com"
              className="text-optio-purple hover:text-optio-pink font-medium"
            >
              Contact Support
            </a>
          </p>

          {/* Legal Notice */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              This verification is required for COPPA compliance to protect users under 13 years old.
              Your privacy and safety are our top priorities.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
