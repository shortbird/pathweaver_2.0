import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';

const PILLARS = [
  'STEM & Logic',
  'Life & Wellness',
  'Language & Communication',
  'Society & Culture',
  'Arts & Creativity'
];

const PRESET_ICONS = ['🎯', '🏆', '⭐', '💎', '🔥', '🎨', '📚', '🔬', '🎭', '🌟', '💡', '🚀'];

const PRESET_COLORS = [
  { name: 'Purple', value: '#6D469B' },
  { name: 'Pink', value: '#EF597B' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#10b981' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Red', value: '#ef4444' }
];

export default function AdvisorBadgeForm() {
  const { badgeId } = useParams();
  const navigate = useNavigate();
  const isEditMode = !!badgeId;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    identity_statement: '',
    primary_pillar: PILLARS[0],
    min_quests: 5,
    xp_requirement: 1000,
    icon: '🎯',
    color: '#6D469B',
    is_public: false
  });

  useEffect(() => {
    if (isEditMode) {
      fetchBadge();
    }
  }, [badgeId]);

  const fetchBadge = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/badges/${badgeId}`);
      const badge = response.data.badge;

      setFormData({
        name: badge.name || '',
        description: badge.description || '',
        identity_statement: badge.identity_statement || '',
        primary_pillar: badge.primary_pillar || PILLARS[0],
        min_quests: badge.min_quests || 5,
        xp_requirement: badge.xp_requirement || 1000,
        icon: badge.icon || '🎯',
        color: badge.color || '#6D469B',
        is_public: badge.is_public || false
      });
    } catch (err) {
      console.error('Error fetching badge:', err);
      setError('Failed to load badge');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleNumberChange = (name, value) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 0) {
      setFormData(prev => ({ ...prev, [name]: numValue }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!formData.name.trim()) {
      setError('Badge name is required');
      return;
    }
    if (!formData.description.trim()) {
      setError('Badge description is required');
      return;
    }
    if (!formData.identity_statement.trim()) {
      setError('Identity statement is required');
      return;
    }
    if (formData.min_quests < 1) {
      setError('Minimum quests must be at least 1');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      if (isEditMode) {
        await api.put(`/api/advisor/badges/${badgeId}`, formData);
      } else {
        await api.post('/api/advisor/badges', formData);
      }

      navigate('/advisor');
    } catch (err) {
      console.error('Error saving badge:', err);
      setError(err.response?.data?.error || 'Failed to save badge');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this badge? This action cannot be undone.')) {
      return;
    }

    try {
      setSaving(true);
      await api.delete(`/api/advisor/badges/${badgeId}`);
      navigate('/advisor');
    } catch (err) {
      console.error('Error deleting badge:', err);
      setError(err.response?.data?.error || 'Failed to delete badge');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-pink mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading badge...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/advisor')}
            className="text-gray-600 hover:text-gray-900 mb-4"
          >
            ← Back to Dashboard
          </button>
          <h1 className="text-3xl font-bold text-gray-900">
            {isEditMode ? 'Edit Custom Badge' : 'Create Custom Badge'}
          </h1>
          <p className="mt-2 text-gray-600">
            Design a learning path tailored to your students
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-lg p-8 space-y-6">
          {/* Badge Preview */}
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <div className="text-6xl mb-2">{formData.icon}</div>
            <div className="text-xl font-bold text-gray-900">{formData.name || 'Badge Name'}</div>
            <div className="text-sm text-gray-600 mt-1">{formData.primary_pillar}</div>
            <div
              className="mt-2 inline-block px-3 py-1 rounded-full text-white text-sm"
              style={{ backgroundColor: formData.color }}
            >
              {formData.min_quests} quests • {formData.xp_requirement} XP
            </div>
          </div>

          {/* Basic Info */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Badge Name *
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ef597b] focus:border-transparent"
              placeholder="e.g., Web Development Fundamentals"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description *
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ef597b] focus:border-transparent"
              placeholder="Describe what students will learn..."
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Identity Statement *
            </label>
            <input
              type="text"
              name="identity_statement"
              value={formData.identity_statement}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ef597b] focus:border-transparent"
              placeholder="e.g., I am a web developer"
              required
            />
            <p className="mt-1 text-sm text-gray-500">
              What identity does this badge represent?
            </p>
          </div>

          {/* Pillar Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Primary Pillar *
            </label>
            <select
              name="primary_pillar"
              value={formData.primary_pillar}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ef597b] focus:border-transparent"
            >
              {PILLARS.map(pillar => (
                <option key={pillar} value={pillar}>{pillar}</option>
              ))}
            </select>
          </div>

          {/* Requirements */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Quests *
              </label>
              <input
                type="number"
                value={formData.min_quests}
                onChange={(e) => handleNumberChange('min_quests', e.target.value)}
                min="1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ef597b] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                XP Requirement *
              </label>
              <input
                type="number"
                value={formData.xp_requirement}
                onChange={(e) => handleNumberChange('xp_requirement', e.target.value)}
                min="0"
                step="50"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ef597b] focus:border-transparent"
              />
            </div>
          </div>

          {/* Icon Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Badge Icon
            </label>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
              {PRESET_ICONS.map(icon => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, icon }))}
                  className={`text-3xl p-3 rounded-lg border-2 transition-all ${
                    formData.icon === icon
                      ? 'border-optio-pink bg-pink-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={formData.icon}
              onChange={(e) => setFormData(prev => ({ ...prev, icon: e.target.value }))}
              className="mt-2 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ef597b] focus:border-transparent"
              placeholder="Or enter custom emoji"
            />
          </div>

          {/* Color Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Badge Color
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {PRESET_COLORS.map(({ name, value }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, color: value }))}
                  className={`px-4 py-3 rounded-lg border-2 transition-all ${
                    formData.color === value
                      ? 'border-gray-900 ring-2 ring-offset-2 ring-gray-900'
                      : 'border-gray-200'
                  }`}
                  style={{ backgroundColor: value }}
                >
                  <span className="text-white text-xs font-medium">{name}</span>
                </button>
              ))}
            </div>
            <input
              type="text"
              value={formData.color}
              onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
              className="mt-2 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ef597b] focus:border-transparent"
              placeholder="#6d469b"
            />
          </div>

          {/* Visibility */}
          <div className="flex items-center">
            <input
              type="checkbox"
              name="is_public"
              checked={formData.is_public}
              onChange={handleChange}
              className="h-4 w-4 text-optio-pink focus:ring-[#ef597b] border-gray-300 rounded"
            />
            <label className="ml-2 block text-sm text-gray-700">
              Make this badge public (visible to all students)
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-6 border-t">
            <div>
              {isEditMode && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  Delete Badge
                </button>
              )}
            </div>
            <div className="flex space-x-4">
              <button
                type="button"
                onClick={() => navigate('/advisor')}
                className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-3 bg-gradient-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Badge'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
