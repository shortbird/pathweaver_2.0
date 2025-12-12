import { useState } from 'react';
import PropTypes from 'prop-types';
import { X, AlertCircle, Info } from 'lucide-react';
import { createDependent } from '../../services/dependentAPI';

const AddDependentModal = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    display_name: '',
    date_of_birth: '',
    avatar_url: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [ageWarning, setAgeWarning] = useState('');

  const calculateAge = (birthDate) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    return age;
  };

  const handleDateChange = (dateStr) => {
    setFormData({ ...formData, date_of_birth: dateStr });

    // Validate age
    if (dateStr) {
      const age = calculateAge(dateStr);

      if (age >= 13) {
        setAgeWarning(
          `Child is ${age} years old. Dependent profiles are for children under 13. ` +
          'Please create an independent account instead.'
        );
      } else if (age < 5) {
        setAgeWarning(
          `Child is ${age} years old. This feature is designed for children ages 5-12.`
        );
      } else {
        setAgeWarning('');
      }
    } else {
      setAgeWarning('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate required fields
    if (!formData.display_name.trim()) {
      setError('Display name is required');
      return;
    }

    if (!formData.date_of_birth) {
      setError('Date of birth is required');
      return;
    }

    // Validate age
    const age = calculateAge(formData.date_of_birth);
    if (age >= 13) {
      setError(
        `Child must be under 13 years old (currently ${age}). ` +
        'For children 13+, please create an independent account.'
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await createDependent({
        display_name: formData.display_name.trim(),
        date_of_birth: formData.date_of_birth,
        avatar_url: formData.avatar_url.trim() || null
      });

      // Success
      onSuccess({
        message: response.message || `Dependent profile created for ${formData.display_name}`,
        dependent: response.dependent
      });

      // Reset form
      setFormData({
        display_name: '',
        date_of_birth: '',
        avatar_url: ''
      });
      setAgeWarning('');
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create dependent profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setFormData({
        display_name: '',
        date_of_birth: '',
        avatar_url: ''
      });
      setError('');
      setAgeWarning('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-optio-purple to-optio-pink">
          <h2 className="text-xl font-semibold text-white font-['Poppins']">
            Add Child Profile
          </h2>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-white hover:text-gray-200 transition-colors disabled:opacity-50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* COPPA Notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <strong>COPPA Compliance:</strong> Dependent profiles are for children under 13.
              They won't have email/password until promoted to an independent account at age 13.
            </div>
          </div>

          {/* Display Name */}
          <div>
            <label htmlFor="display_name" className="block text-sm font-medium text-gray-700 mb-1">
              Display Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="display_name"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              placeholder="e.g., Alex, Sam, Jordan"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
              disabled={isSubmitting}
            />
          </div>

          {/* Date of Birth */}
          <div>
            <label htmlFor="date_of_birth" className="block text-sm font-medium text-gray-700 mb-1">
              Date of Birth <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              id="date_of_birth"
              value={formData.date_of_birth}
              onChange={(e) => handleDateChange(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
              disabled={isSubmitting}
            />
          </div>

          {/* Age Warning */}
          {ageWarning && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                {ageWarning}
              </div>
            </div>
          )}

          {/* Avatar URL (Optional) */}
          <div>
            <label htmlFor="avatar_url" className="block text-sm font-medium text-gray-700 mb-1">
              Avatar URL <span className="text-gray-400">(Optional)</span>
            </label>
            <input
              type="url"
              id="avatar_url"
              value={formData.avatar_url}
              onChange={(e) => setFormData({ ...formData, avatar_url: e.target.value })}
              placeholder="https://example.com/avatar.png"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
              disabled={isSubmitting}
            />
            <p className="mt-1 text-xs text-gray-500">
              Optional: URL to a profile picture for this dependent
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-800">
                {error}
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !!ageWarning}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:shadow-lg transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Creating...' : 'Create Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

AddDependentModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired
};

export default AddDependentModal;
