import React, { useState, useEffect } from 'react';
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';

const ServiceFormModal = ({ service, isCreating, onClose }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    price: '',
    price_display: '',
    price_type: 'one-time',
    features: [],
    is_active: true,
    sort_order: 0
  });
  const [newFeature, setNewFeature] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (service) {
      setFormData({
        name: service.name || '',
        description: service.description || '',
        category: service.category || '',
        price: service.price || '',
        price_display: service.price_display || '',
        price_type: service.price_type || 'one-time',
        features: service.features || [],
        is_active: service.is_active !== undefined ? service.is_active : true,
        sort_order: service.sort_order || 0
      });
    }
  }, [service]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    setError('');
  };

  const handleAddFeature = () => {
    if (!newFeature.trim()) return;

    setFormData(prev => ({
      ...prev,
      features: [...prev.features, newFeature.trim()]
    }));
    setNewFeature('');
  };

  const handleRemoveFeature = (index) => {
    setFormData(prev => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.name.trim()) {
      setError('Please enter a service name');
      return;
    }
    if (!formData.description.trim()) {
      setError('Please enter a description');
      return;
    }
    if (!formData.category.trim()) {
      setError('Please enter a category');
      return;
    }
    if (!formData.price || parseFloat(formData.price) < 0) {
      setError('Please enter a valid price');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        ...formData,
        price: parseFloat(formData.price),
        sort_order: parseInt(formData.sort_order)
      };

      if (isCreating) {
        await api.post('/api/admin/services', payload);
      } else {
        await api.put(`/api/admin/services/${service.id}`, payload);
      }

      onClose(true); // true = refresh services list
    } catch (err) {
      console.error('Error saving service:', err);
      setError(err.response?.data?.message || 'Failed to save service');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-full sm:max-w-2xl w-full mx-2 sm:mx-0 p-8 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={() => onClose(false)}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          aria-label="Close modal"
        >
          <XMarkIcon className="w-6 h-6" />
        </button>

        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          {isCreating ? 'Create New Service' : 'Edit Service'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-1">
              Service Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent min-h-[44px] text-base"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-semibold text-gray-700 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none min-h-[100px] text-base"
              required
            />
          </div>

          {/* Category */}
          <div>
            <label htmlFor="category" className="block text-sm font-semibold text-gray-700 mb-1">
              Category <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="category"
              name="category"
              value={formData.category}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent min-h-[44px] text-base"
              placeholder="e.g., Educational Consultations"
              required
            />
          </div>

          {/* Price (numeric) and Price Display (row) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="price" className="block text-sm font-semibold text-gray-700 mb-1">
                Price (numeric) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                id="price"
                name="price"
                value={formData.price}
                onChange={handleChange}
                min="0"
                step="0.01"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent min-h-[44px] text-base"
                placeholder="19.00"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Internal price value (not shown to public)</p>
            </div>

            <div>
              <label htmlFor="price_display" className="block text-sm font-semibold text-gray-700 mb-1">
                Price Display <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="price_display"
                name="price_display"
                value={formData.price_display}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent min-h-[44px] text-base"
                placeholder="e.g., $49/session (first FREE)"
                required
              />
              <p className="text-xs text-gray-500 mt-1">How price appears to users</p>
            </div>
          </div>

          {/* Price Type */}
          <div>
            <label htmlFor="price_type" className="block text-sm font-semibold text-gray-700 mb-1">
              Price Type <span className="text-red-500">*</span>
            </label>
            <select
              id="price_type"
              name="price_type"
              value={formData.price_type}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent min-h-[44px] text-base"
              required
            >
              <option value="one-time">One-time Payment</option>
              <option value="monthly">Monthly Subscription</option>
              <option value="per-session">Per Session</option>
              <option value="per-credit">Per Credit</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">How the service is billed</p>
          </div>

          {/* Sort Order */}
          <div>
            <label htmlFor="sort_order" className="block text-sm font-semibold text-gray-700 mb-1">
              Sort Order
            </label>
            <input
              type="number"
              id="sort_order"
              name="sort_order"
              value={formData.sort_order}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent min-h-[44px] text-base"
              placeholder="0"
            />
            <p className="text-xs text-gray-500 mt-1">Lower numbers appear first</p>
          </div>

          {/* Features */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Features
            </label>
            <div className="space-y-2">
              {/* Existing features */}
              {formData.features.map((feature, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="flex-1 px-3 py-2 bg-gray-50 rounded-lg text-sm">{feature}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFeature(index)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {/* Add new feature */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newFeature}
                  onChange={(e) => setNewFeature(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddFeature();
                    }
                  }}
                  placeholder="Add a feature..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent min-h-[44px] text-base"
                />
                <button
                  type="button"
                  onClick={handleAddFeature}
                  className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors min-h-[44px] min-w-[44px]"
                >
                  <PlusIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Active Status */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              name="is_active"
              checked={formData.is_active}
              onChange={handleChange}
              className="w-4 h-4 text-optio-purple border-gray-300 rounded focus:ring-optio-purple"
            />
            <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
              Active (visible to public)
            </label>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Submit buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <button
              type="button"
              onClick={() => onClose(false)}
              className="w-full sm:w-auto sm:flex-1 bg-gray-100 text-gray-700 py-3 px-6 rounded-xl hover:bg-gray-200 transition-colors font-semibold min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto sm:flex-1 bg-gradient-to-r from-optio-purple to-optio-pink text-white py-3 px-6 rounded-xl hover:opacity-90 transition-opacity font-semibold disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              {isSubmitting ? 'Saving...' : (isCreating ? 'Create Service' : 'Save Changes')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ServiceFormModal;
