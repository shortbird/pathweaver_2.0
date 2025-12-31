import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function AcceptInvitationPage() {
  const { code } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    first_name: '',
    last_name: '',
    date_of_birth: ''
  });
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    validateInvitation();
  }, [code]);

  const validateInvitation = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/admin/organizations/invitations/validate/${code}`);

      if (response.data.valid) {
        setInvitation(response.data.invitation);
        // Pre-fill email and name from invitation
        setFormData(prev => ({
          ...prev,
          email: response.data.invitation.email || '',
          first_name: response.data.invitation.invited_name?.split(' ')[0] || '',
          last_name: response.data.invitation.invited_name?.split(' ').slice(1).join(' ') || ''
        }));
      } else {
        setError(response.data.error || 'Invalid invitation');
      }
    } catch (err) {
      console.error('Failed to validate invitation:', err);
      setError(err.response?.data?.error || 'This invitation is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.first_name.trim()) {
      errors.first_name = 'First name is required';
    }

    if (!formData.last_name.trim()) {
      errors.last_name = 'Last name is required';
    }

    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }

    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await api.post(`/api/admin/organizations/invitations/accept/${code}`, {
        email: formData.email,
        password: formData.password,
        first_name: formData.first_name,
        last_name: formData.last_name,
        date_of_birth: formData.date_of_birth || null
      });

      if (response.data.success) {
        setSuccess(true);
      } else {
        setError(response.data.error || 'Failed to accept invitation');
      }
    } catch (err) {
      console.error('Failed to accept invitation:', err);
      setError(err.response?.data?.error || 'Failed to create account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple mx-auto mb-4"></div>
          <p className="text-gray-600">Verifying invitation...</p>
        </div>
      </div>
    );
  }

  // Error state (invalid/expired invitation)
  if (error && !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Invitation</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link
            to="/login"
            className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium rounded-lg hover:opacity-90"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Optio!</h1>
          <p className="text-gray-600 mb-2">
            Your account has been created successfully.
          </p>
          <p className="text-gray-600 mb-6">
            You've joined <strong>{invitation?.organization?.name}</strong> as a <strong>{invitation?.role}</strong>.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium rounded-lg hover:opacity-90"
          >
            Log In Now
          </Link>
        </div>
      </div>
    );
  }

  // Registration form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-block mb-6">
            <img src="/optio-logo.svg" alt="Optio" className="h-10 mx-auto" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Join {invitation?.organization?.name}
          </h1>
          <p className="text-gray-600">
            You've been invited to join as a <strong>{invitation?.role}</strong>
          </p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email (read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                disabled
                className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-600"
              />
              <p className="text-xs text-gray-500 mt-1">This email is linked to your invitation</p>
            </div>

            {/* Name fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none ${
                    formErrors.first_name ? 'border-red-300' : 'border-gray-200'
                  }`}
                  placeholder="John"
                />
                {formErrors.first_name && (
                  <p className="text-xs text-red-600 mt-1">{formErrors.first_name}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none ${
                    formErrors.last_name ? 'border-red-300' : 'border-gray-200'
                  }`}
                  placeholder="Doe"
                />
                {formErrors.last_name && (
                  <p className="text-xs text-red-600 mt-1">{formErrors.last_name}</p>
                )}
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none ${
                  formErrors.password ? 'border-red-300' : 'border-gray-200'
                }`}
                placeholder="At least 8 characters"
              />
              {formErrors.password && (
                <p className="text-xs text-red-600 mt-1">{formErrors.password}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none ${
                  formErrors.confirmPassword ? 'border-red-300' : 'border-gray-200'
                }`}
                placeholder="Confirm your password"
              />
              {formErrors.confirmPassword && (
                <p className="text-xs text-red-600 mt-1">{formErrors.confirmPassword}</p>
              )}
            </div>

            {/* Date of Birth (optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date of Birth <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="date"
                value={formData.date_of_birth}
                onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {submitting ? 'Creating Account...' : 'Create Account & Join'}
            </button>
          </form>

          {/* Login link */}
          <p className="text-center text-sm text-gray-600 mt-4">
            Already have an account?{' '}
            <Link to="/login" className="text-optio-purple hover:underline font-medium">
              Log in
            </Link>
          </p>
        </div>

        {/* Terms */}
        <p className="text-center text-xs text-gray-500 mt-4">
          By creating an account, you agree to our{' '}
          <Link to="/terms" className="text-optio-purple hover:underline">Terms of Service</Link>
          {' '}and{' '}
          <Link to="/privacy" className="text-optio-purple hover:underline">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}
