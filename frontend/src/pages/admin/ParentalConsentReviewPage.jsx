import { useState, useEffect } from 'react';
import { getPendingReviews, approveConsent, rejectConsent } from '../../services/parentalConsentAPI';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';

export default function ParentalConsentReviewPage() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [viewingDocument, setViewingDocument] = useState(null);

  const fetchReviews = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getPendingReviews();
      setReviews(data.pending_reviews || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load pending reviews');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const handleApprove = async (review) => {
    if (!window.confirm(`Approve parental consent for ${review.child_name}?`)) {
      return;
    }

    setProcessingId(review.child_id);
    setError(null);

    try {
      await approveConsent(review.child_id, '');
      setReviews(reviews.filter((r) => r.child_id !== review.child_id));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to approve consent');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      setError('Rejection reason is required');
      return;
    }

    setProcessingId(selectedReview.child_id);
    setError(null);

    try {
      await rejectConsent(selectedReview.child_id, rejectionReason);
      setReviews(reviews.filter((r) => r.child_id !== selectedReview.child_id));
      setRejectModalOpen(false);
      setRejectionReason('');
      setSelectedReview(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reject consent');
    } finally {
      setProcessingId(null);
    }
  };

  const openRejectModal = (review) => {
    setSelectedReview(review);
    setRejectionReason('');
    setRejectModalOpen(true);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple mx-auto mb-4"></div>
          <p className="text-gray-600">Loading pending reviews...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Parental Consent Reviews</h1>
          <p className="text-gray-600 mt-1">
            Review and verify parent identity for COPPA compliance
          </p>
        </div>
        <div className="bg-optio-purple text-white px-4 py-2 rounded-lg">
          <span className="font-semibold">{reviews.length}</span> Pending
        </div>
      </div>

      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {reviews.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
              <svg
                className="h-6 w-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">All Caught Up!</h3>
            <p className="text-gray-600">No pending parental consent reviews at this time.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <Card key={review.child_id}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-lg font-semibold text-gray-900">{review.child_name}</h3>
                    {review.child_age && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                        Age {review.child_age}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-gray-500">Parent Email</p>
                      <p className="text-sm font-medium text-gray-900">
                        {review.parent_email || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Child Email</p>
                      <p className="text-sm font-medium text-gray-900">
                        {review.child_email || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Submitted</p>
                      <p className="text-sm font-medium text-gray-900">
                        {formatDate(review.submitted_at)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Child ID</p>
                      <p className="text-sm font-mono text-gray-600 truncate">
                        {review.child_id}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 mb-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewingDocument({ type: 'id', url: review.id_document_url, childName: review.child_name })}
                    >
                      <svg
                        className="w-4 h-4 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                      View ID Document
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewingDocument({ type: 'form', url: review.consent_form_url, childName: review.child_name })}
                    >
                      <svg
                        className="w-4 h-4 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      View Consent Form
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col gap-2 ml-4">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleApprove(review)}
                    disabled={processingId === review.child_id}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {processingId === review.child_id ? 'Processing...' : 'Approve'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openRejectModal(review)}
                    disabled={processingId === review.child_id}
                    className="border-red-300 text-red-700 hover:bg-red-50"
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Reject Parental Consent
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Please provide a reason for rejecting {selectedReview?.child_name}'s parental consent
              documents. This will be sent to the parent via email.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g., ID photo is unclear, please retake with better lighting"
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              rows={4}
            />
            <div className="flex gap-3 mt-6">
              <Button
                variant="ghost"
                onClick={() => {
                  setRejectModalOpen(false);
                  setRejectionReason('');
                  setSelectedReview(null);
                }}
                disabled={processingId}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleReject}
                disabled={!rejectionReason.trim() || processingId}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                {processingId ? 'Rejecting...' : 'Reject and Send Email'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      {viewingDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                {viewingDocument.type === 'id' ? 'ID Document' : 'Consent Form'} -{' '}
                {viewingDocument.childName}
              </h3>
              <button
                onClick={() => setViewingDocument(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[calc(90vh-4rem)]">
              <img
                src={viewingDocument.url}
                alt={viewingDocument.type === 'id' ? 'ID Document' : 'Consent Form'}
                className="max-w-full h-auto mx-auto"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'block';
                }}
              />
              <div className="hidden text-center py-12">
                <p className="text-gray-600 mb-4">
                  Unable to display image. The file might be a PDF.
                </p>
                <a
                  href={viewingDocument.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-optio-purple hover:text-optio-pink font-medium"
                >
                  Open in New Tab
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
