import { useState } from 'react';
import PropTypes from 'prop-types';
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';

const AddChildrenModal = ({ isOpen, onClose, onSuccess }) => {
  const [children, setChildren] = useState([
    { first_name: '', last_name: '', email: '' }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const addChildRow = () => {
    setChildren([...children, { first_name: '', last_name: '', email: '' }]);
  };

  const removeChildRow = (index) => {
    if (children.length === 1) return; // Keep at least one row
    setChildren(children.filter((_, i) => i !== index));
  };

  const updateChild = (index, field, value) => {
    const updated = children.map((child, i) =>
      i === index ? { ...child, [field]: value } : child
    );
    setChildren(updated);
  };

  const validateChildren = () => {
    for (const child of children) {
      if (!child.first_name.trim()) return 'First name is required for all children';
      if (!child.last_name.trim()) return 'Last name is required for all children';
      if (!child.email.trim()) return 'Email is required for all children';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(child.email)) {
        return `Invalid email format: ${child.email}`;
      }
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const validationError = validateChildren();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await api.post('/api/parents/submit-connection-requests', {
        children: children.map(child => ({
          first_name: child.first_name.trim(),
          last_name: child.last_name.trim(),
          email: child.email.trim().toLowerCase()
        }))
      });

      // Success
      const { submitted_count, auto_matched_count } = response.data;
      onSuccess({
        message: `Successfully submitted ${submitted_count} connection request(s). ${auto_matched_count} automatically matched to existing students.`,
        submitted_count,
        auto_matched_count
      });

      // Reset form
      setChildren([{ first_name: '', last_name: '', email: '' }]);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit connection requests');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setChildren([{ first_name: '', last_name: '', email: '' }]);
      setError('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-full sm:max-w-2xl mx-2 sm:mx-0 w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-optio-purple to-pink-500">
          <h2 className="text-xl font-semibold text-white font-['Poppins']">
            Add Your Children
          </h2>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-white hover:text-gray-200 transition-colors disabled:opacity-50"
            aria-label="Close modal"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-200px)]">
          <p className="text-gray-600 mb-4 font-['Poppins']">
            Enter the details of your children below. If they already have an Optio account, we'll
            automatically match them by email. Otherwise, we'll hold your request until they create an account.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-['Poppins']">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {children.map((child, index) => (
              <div key={index} className="p-4 bg-gray-50 rounded-lg border border-gray-200 relative">
                {/* Remove button (only show if more than 1 child) */}
                {children.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeChildRow(index)}
                    className="absolute top-2 right-2 text-gray-400 hover:text-red-500 transition-colors"
                    aria-label="Remove child"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 font-['Poppins']">
                      First Name *
                    </label>
                    <input
                      type="text"
                      value={child.first_name}
                      onChange={(e) => updateChild(index, 'first_name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 font-['Poppins'] min-h-[44px] text-base"
                      placeholder="John"
                      required
                      disabled={isSubmitting}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 font-['Poppins']">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      value={child.last_name}
                      onChange={(e) => updateChild(index, 'last_name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 font-['Poppins'] min-h-[44px] text-base"
                      placeholder="Doe"
                      required
                      disabled={isSubmitting}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1 font-['Poppins']">
                      Email *
                    </label>
                    <input
                      type="email"
                      value={child.email}
                      onChange={(e) => updateChild(index, 'email', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 font-['Poppins'] min-h-[44px] text-base"
                      placeholder="john.doe@student.edu"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              </div>
            ))}

            {/* Add Another Child Button */}
            <button
              type="button"
              onClick={addChildRow}
              disabled={isSubmitting}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-purple-500 hover:text-optio-purple transition-colors flex items-center justify-center gap-2 font-['Poppins'] font-medium disabled:opacity-50 min-h-[56px]"
            >
              <PlusIcon className="w-5 h-5" />
              Add Another Child
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3 bg-gray-50">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-['Poppins'] font-medium disabled:opacity-50 min-h-[44px]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-6 py-2 bg-gradient-to-r from-optio-purple to-pink-500 text-white rounded-lg hover:from-purple-700 hover:to-optio-pink transition-all font-['Poppins'] font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 min-h-[44px]"
          >
            {isSubmitting ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Submitting...
              </>
            ) : (
              `Submit ${children.length} Request${children.length > 1 ? 's' : ''}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

AddChildrenModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired,
};

export default AddChildrenModal;
