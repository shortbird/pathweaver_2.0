import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

/**
 * "Transfer to School" form: emails the official transcript PDF to a registrar
 * at another school, from the records address. The PDF comes from the same
 * client-side html2pdf path as Download PDF (via generatePdfBase64), so the
 * registrar receives exactly the document the admin sees.
 */
const TransferToSchoolModal = ({ userId, studentName, generatePdfBase64, onClose }) => {
  const [form, setForm] = useState({
    school_name: '',
    recipient_name: '',
    recipient_email: '',
    message: '',
  });
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState(null);

  const loadHistory = () => {
    api.get(`/api/admin/transcript/${userId}/transfers`)
      .then((res) => {
        const body = res.data?.data || res.data;
        setHistory(body?.transfers || []);
      })
      .catch(() => setHistory([]));
  };

  useEffect(loadHistory, [userId]);

  const setField = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      const pdf_base64 = await generatePdfBase64();
      await api.post(`/api/admin/transcript/${userId}/send`, { ...form, pdf_base64 });
      toast.success(`Transcript sent to ${form.recipient_email}`);
      onClose();
    } catch (err) {
      const body = err.response?.data;
      toast.error(body?.error || body?.message || 'Failed to send transcript');
      loadHistory();
      setSending(false);
    }
  };

  const formatDate = (iso) => {
    try {
      return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Transfer to School</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <p className="text-sm text-gray-600">
            Sends the official transcript for <span className="font-semibold">{studentName}</span> as
            a PDF attachment from support@optioeducation.com, with a verification link for the
            receiving registrar. The transfer is logged, and the student is notified by email.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">School name *</label>
            <input
              type="text"
              required
              value={form.school_name}
              onChange={setField('school_name')}
              placeholder="e.g. Granite Hills High School"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Registrar name</label>
              <input
                type="text"
                value={form.recipient_name}
                onChange={setField('recipient_name')}
                placeholder="Optional"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Registrar email *</label>
              <input
                type="email"
                required
                value={form.recipient_email}
                onChange={setField('recipient_email')}
                placeholder="registrar@school.org"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note to registrar</label>
            <textarea
              value={form.message}
              onChange={setField('message')}
              rows={3}
              placeholder="Optional message included in the email"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
              className="px-4 py-2 text-sm bg-optio-purple text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send Transcript'}
            </button>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-gray-200">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Transfer history</h3>
          {history === null ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-gray-400">No transfers sent yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {history.map((t) => (
                <li key={t.id} className="text-sm text-gray-700 flex items-baseline justify-between gap-3">
                  <span className="truncate">
                    {t.school_name} <span className="text-gray-400">({t.recipient_email})</span>
                    {t.status !== 'sent' && <span className="ml-1.5 text-red-600 font-medium">failed</span>}
                  </span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(t.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransferToSchoolModal;
