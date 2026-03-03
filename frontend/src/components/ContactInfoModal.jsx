import React, { useState, useEffect } from 'react';
import { Modal } from './ui/Modal';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import api from '../services/api';

const ContactInfoModal = ({ isOpen, onClose, contactType = 'demo' }) => {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      // Delay reset so user doesn't see flash of empty form on close
      const timer = setTimeout(() => {
        setFormData({ name: '', email: '', phone: '', message: '' });
        setError('');
        setSuccess(false);
        setLoading(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Auto-close after success
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => onClose(), 3000);
      return () => clearTimeout(timer);
    }
  }, [success, onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/api/contact', {
        name: formData.name,
        email: formData.email,
        phone: formData.phone || undefined,
        message: formData.message || undefined,
        type: contactType
      });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const title = contactType === 'sales' ? 'Contact Sales' : 'Get More Info';

  if (success) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
        <div className="text-center py-8">
          <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3
            className="text-xl font-bold text-gray-900 mb-2"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            Thank You!
          </h3>
          <p
            className="text-gray-600"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            We received your info and will be in touch soon.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="contact-name"
            className="block text-sm font-medium text-gray-700 mb-1"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Name <span className="text-red-500">*</span>
          </label>
          <input
            id="contact-name"
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent transition-all"
            style={{ fontFamily: 'Poppins' }}
            placeholder="Your name"
            disabled={loading}
          />
        </div>

        <div>
          <label
            htmlFor="contact-email"
            className="block text-sm font-medium text-gray-700 mb-1"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Email <span className="text-red-500">*</span>
          </label>
          <input
            id="contact-email"
            type="email"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent transition-all"
            style={{ fontFamily: 'Poppins' }}
            placeholder="you@example.com"
            disabled={loading}
          />
        </div>

        <div>
          <label
            htmlFor="contact-phone"
            className="block text-sm font-medium text-gray-700 mb-1"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Phone <span className="text-gray-400">(optional)</span>
          </label>
          <input
            id="contact-phone"
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent transition-all"
            style={{ fontFamily: 'Poppins' }}
            placeholder="(555) 123-4567"
            disabled={loading}
          />
        </div>

        <div>
          <label
            htmlFor="contact-message"
            className="block text-sm font-medium text-gray-700 mb-1"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Message <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            id="contact-message"
            value={formData.message}
            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
            rows={3}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent transition-all resize-none"
            style={{ fontFamily: 'Poppins' }}
            placeholder="Tell us about your learning community..."
            disabled={loading}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600" style={{ fontFamily: 'Poppins' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-primary text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg transition-all min-h-[44px] disabled:opacity-60"
          style={{ fontFamily: 'Poppins', fontWeight: 600 }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Sending...
            </span>
          ) : (
            'Send'
          )}
        </button>
      </form>
    </Modal>
  );
};

export default ContactInfoModal;
