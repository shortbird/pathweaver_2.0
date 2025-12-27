import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { submitConsentDocuments } from '../services/parentalConsentAPI';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

export default function ParentalConsentUploadPage() {
  const navigate = useNavigate();
  const [idDocument, setIdDocument] = useState(null);
  const [consentForm, setConsentForm] = useState(null);
  const [idPreview, setIdPreview] = useState(null);
  const [formPreview, setFormPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  const maxSize = 10 * 1024 * 1024; // 10MB

  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!allowedTypes.includes(file.type)) {
      setError('Only JPG, PNG, or PDF files are allowed');
      return;
    }

    // Validate file size
    if (file.size > maxSize) {
      setError('File size must be less than 10MB');
      return;
    }

    if (type === 'id') {
      setIdDocument(file);
      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setIdPreview(reader.result);
        };
        reader.readAsDataURL(file);
      } else {
        setIdPreview(null);
      }
    } else {
      setConsentForm(file);
      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setFormPreview(reader.result);
        };
        reader.readAsDataURL(file);
      } else {
        setFormPreview(null);
      }
    }

    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!idDocument) {
      setError('Please upload your government-issued ID');
      return;
    }

    if (!consentForm) {
      setError('Please upload the signed consent form');
      return;
    }

    setLoading(true);

    try {
      await submitConsentDocuments(idDocument, consentForm);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit documents. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full">
          <div className="text-center">
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
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Documents Submitted Successfully</h2>
            <p className="text-gray-600 mb-6">
              Thank you for submitting your parental consent documents. Our team will review them within
              24-48 hours.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-blue-900 mb-2">What Happens Next?</h3>
              <ul className="text-left text-sm text-blue-800 space-y-2">
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Our team will review your ID document and signed consent form</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>We verify that all documents meet COPPA compliance requirements</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>You'll receive an email notification when the review is complete</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Once approved, your child will have full access to the platform</span>
                </li>
              </ul>
            </div>
            <Button onClick={() => navigate('/login')} variant="primary">
              Go to Login
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Parental Consent Verification</h1>
          <p className="text-gray-600">
            Please upload the required documents to complete your child's account verification
          </p>
        </div>

        {error && (
          <Alert variant="error" className="mb-6">
            {error}
          </Alert>
        )}

        <Card className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Required Documents</h2>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-yellow-900 mb-2">Important Requirements</h3>
            <ul className="text-sm text-yellow-800 space-y-1">
              <li>• Clear photo of government-issued ID (driver's license, passport, or state ID)</li>
              <li>• Signed parental consent form (download below if you haven't already)</li>
              <li>• All text must be clearly legible</li>
              <li>• Accepted formats: JPG, PNG, or PDF (max 10MB each)</li>
            </ul>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* ID Document Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                1. Government-Issued ID Photo
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-optio-purple transition-colors">
                <input
                  type="file"
                  id="id-document"
                  accept=".jpg,.jpeg,.png,.pdf"
                  onChange={(e) => handleFileChange(e, 'id')}
                  className="hidden"
                />
                <label
                  htmlFor="id-document"
                  className="cursor-pointer flex flex-col items-center"
                >
                  {idDocument ? (
                    <>
                      {idPreview ? (
                        <img
                          src={idPreview}
                          alt="ID preview"
                          className="max-h-48 rounded-lg mb-4"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-24 w-24 rounded-full bg-green-100 mb-4">
                          <svg
                            className="h-12 w-12 text-green-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </div>
                      )}
                      <p className="text-sm font-medium text-gray-900 mb-1">{idDocument.name}</p>
                      <p className="text-xs text-gray-500">
                        {(idDocument.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      <Button type="button" variant="ghost" size="sm" className="mt-2">
                        Change File
                      </Button>
                    </>
                  ) : (
                    <>
                      <svg
                        className="mx-auto h-12 w-12 text-gray-400"
                        stroke="currentColor"
                        fill="none"
                        viewBox="0 0 48 48"
                      >
                        <path
                          d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <p className="mt-1 text-sm text-gray-600">
                        Click to upload or drag and drop
                      </p>
                      <p className="text-xs text-gray-500">JPG, PNG, or PDF (max 10MB)</p>
                    </>
                  )}
                </label>
              </div>
            </div>

            {/* Consent Form Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                2. Signed Parental Consent Form
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-optio-purple transition-colors">
                <input
                  type="file"
                  id="consent-form"
                  accept=".jpg,.jpeg,.png,.pdf"
                  onChange={(e) => handleFileChange(e, 'form')}
                  className="hidden"
                />
                <label
                  htmlFor="consent-form"
                  className="cursor-pointer flex flex-col items-center"
                >
                  {consentForm ? (
                    <>
                      {formPreview ? (
                        <img
                          src={formPreview}
                          alt="Form preview"
                          className="max-h-48 rounded-lg mb-4"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-24 w-24 rounded-full bg-green-100 mb-4">
                          <svg
                            className="h-12 w-12 text-green-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </div>
                      )}
                      <p className="text-sm font-medium text-gray-900 mb-1">{consentForm.name}</p>
                      <p className="text-xs text-gray-500">
                        {(consentForm.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      <Button type="button" variant="ghost" size="sm" className="mt-2">
                        Change File
                      </Button>
                    </>
                  ) : (
                    <>
                      <svg
                        className="mx-auto h-12 w-12 text-gray-400"
                        stroke="currentColor"
                        fill="none"
                        viewBox="0 0 48 48"
                      >
                        <path
                          d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <p className="mt-1 text-sm text-gray-600">
                        Click to upload or drag and drop
                      </p>
                      <p className="text-xs text-gray-500">JPG, PNG, or PDF (max 10MB)</p>
                    </>
                  )}
                </label>
              </div>
            </div>

            {/* Download Consent Form Link */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800 mb-2">
                Don't have the consent form yet?
              </p>
              <a
                href="/parental-consent-form.pdf"
                download
                className="text-sm font-medium text-optio-purple hover:text-optio-pink"
              >
                Download Parental Consent Form (PDF)
              </a>
            </div>

            {/* Submit Button */}
            <div className="flex gap-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate(-1)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={!idDocument || !consentForm || loading}
                className="flex-1"
              >
                {loading ? 'Submitting...' : 'Submit for Review'}
              </Button>
            </div>
          </form>
        </Card>

        {/* Privacy Notice */}
        <div className="text-center text-xs text-gray-500">
          <p>Your documents will be reviewed by our compliance team and then securely deleted.</p>
          <p className="mt-1">We take your privacy and your child's safety seriously.</p>
        </div>
      </div>
    </div>
  );
}
