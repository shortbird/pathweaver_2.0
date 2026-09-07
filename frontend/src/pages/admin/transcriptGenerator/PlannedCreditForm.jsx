// The no-print form for adding or editing a planned credit -- a credit the
// student is expected to earn, shown on the transcript before it exists.
import React from 'react';
import { SUBJECT_OPTIONS } from './subjectOptions';

const PlannedCreditForm = ({
  editingCredit, formData, handleSavePlannedCredit, resetForm, saving,
  setFormData, showAddForm,
}) => (
  showAddForm && (
    <div className="no-print max-w-5xl mx-auto px-6 pt-4">
      <form onSubmit={handleSavePlannedCredit} className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-3">
          {editingCredit ? 'Edit Planned Credit' : 'Add Planned Credit'}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Subject Area</label>
            <select
              value={formData.school_subject}
              onChange={e => setFormData(f => ({ ...f, school_subject: e.target.value }))}
              required
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="">Select...</option>
              {SUBJECT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Course Name</label>
            <input
              type="text"
              value={formData.course_name}
              onChange={e => setFormData(f => ({ ...f, course_name: e.target.value }))}
              required
              placeholder="e.g. Spanish 1"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Credits</label>
            <input
              type="number"
              step="0.25"
              min="0.25"
              max="10"
              value={formData.credits}
              onChange={e => setFormData(f => ({ ...f, credits: e.target.value }))}
              required
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select
              value={formData.status}
              onChange={e => setFormData(f => ({ ...f, status: e.target.value }))}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="dropped">Dropped</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Source/Institution</label>
            <input
              type="text"
              value={formData.source}
              onChange={e => setFormData(f => ({ ...f, source: e.target.value }))}
              placeholder="e.g. BYU Independent Study"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <input
              type="text"
              value={formData.notes}
              onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingCredit ? 'Update' : 'Add'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </div>
  )
);

export default PlannedCreditForm;
