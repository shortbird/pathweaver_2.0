import React, { useState, useEffect } from 'react';
import { Modal } from './ui/Modal';
import { ButtonSpinner } from './ui/Spinner';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import api from '../services/api';

const CONTACT_CONFIG = {
  demo: { title: 'Get More Info', placeholder: 'Tell us about your learning community...' },
  sales: { title: 'Contact Sales', placeholder: 'Tell us about your organization...' },
  families: { title: 'Tell Us About Your Family', placeholder: 'How many kids do you have? What does your homeschool look like? What are you hoping Optio can help with?' },
  general: { title: 'Get More Info', placeholder: 'How can we help?' },
};

const ContactInfoModal = ({ isOpen, onClose, contactType = 'demo' }) => {
  const config = CONTACT_CONFIG[contactType] || CONTACT_CONFIG.general;
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

  const title = config.title;

  if (success) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
        <div className="text-center py-8">
          <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            Thank You!
          </h3>
          <p className="text-gray-600 font-medium">
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
            placeholder="Your name"
            disabled={loading}
          />
        </div>

        <div>
          <label
            htmlFor="contact-email"
            className="block text-sm font-medium text-gray-700 mb-1"
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
            placeholder="you@example.com"
            disabled={loading}
          />
        </div>

        <div>
          <label
            htmlFor="contact-phone"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Phone <span className="text-gray-400">(optional)</span>
          </label>
          <input
            id="contact-phone"
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent transition-all"
            placeholder="(555) 123-4567"
            disabled={loading}
          />
        </div>

        <div>
          <label
            htmlFor="contact-message"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Message <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            id="contact-message"
            value={formData.message}
            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
            rows={3}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent transition-all resize-none"
            placeholder={config.placeholder}
            disabled={loading}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full min-h-[44px]"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <ButtonSpinner />
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
