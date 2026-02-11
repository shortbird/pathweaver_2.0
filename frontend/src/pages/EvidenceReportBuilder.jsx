/**
 * EvidenceReportBuilder - Page for creating/editing evidence reports
 *
 * Allows students to select quests/courses and configure settings
 * for shareable evidence reports.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/ui/Button';
import ReportQuestSelector from '../components/evidence-report/ReportQuestSelector';
import ShareReportModal from '../components/evidence-report/ShareReportModal';
import logger from '../utils/logger';

const EvidenceReportBuilder = () => {
  const navigate = useNavigate();
  const { id: reportId } = useParams();
  const { user } = useAuth();
  const isEditing = Boolean(reportId);

  // Form state
  const [title, setTitle] = useState('Evidence Report');
  const [description, setDescription] = useState('');
  const [selectedQuestIds, setSelectedQuestIds] = useState([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState([]);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [availableQuests, setAvailableQuests] = useState([]);
  const [availableCourses, setAvailableCourses] = useState([]);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [createdReport, setCreatedReport] = useState(null);

  // Fetch available content and existing report data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);

        // Fetch available quests and courses
        const contentResponse = await api.get('/api/evidence-reports/available-content');
        const { quests, courses } = contentResponse.data.data;
        setAvailableQuests(quests || []);
        setAvailableCourses(courses || []);

        // If editing, fetch existing report
        if (isEditing) {
          const reportResponse = await api.get(`/api/evidence-reports/${reportId}`);
          const report = reportResponse.data.data.report;
          setTitle(report.title || 'Evidence Report');
          setDescription(report.description || '');
          setSelectedQuestIds(report.included_quest_ids || []);
          setSelectedCourseIds(report.included_course_ids || []);
        }
      } catch (error) {
        logger.error('Error fetching data:', error);
        toast.error('Failed to load data');
        navigate('/evidence-reports');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [reportId, isEditing, navigate]);

  const handleQuestToggle = (questId) => {
    setSelectedQuestIds(prev =>
      prev.includes(questId)
        ? prev.filter(id => id !== questId)
        : [...prev, questId]
    );
  };

  const handleCourseToggle = (courseId) => {
    setSelectedCourseIds(prev =>
      prev.includes(courseId)
        ? prev.filter(id => id !== courseId)
        : [...prev, courseId]
    );
  };

  const handleSelectAll = () => {
    setSelectedQuestIds(availableQuests.map(q => q.id));
    setSelectedCourseIds(availableCourses.map(c => c.id));
  };

  const handleClearAll = () => {
    setSelectedQuestIds([]);
    setSelectedCourseIds([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (selectedQuestIds.length === 0 && selectedCourseIds.length === 0) {
      toast.error('Please select at least one quest or course');
      return;
    }

    try {
      setIsSaving(true);

      const payload = {
        title,
        description,
        included_quest_ids: selectedQuestIds,
        included_course_ids: selectedCourseIds
      };

      let response;
      if (isEditing) {
        response = await api.patch(`/api/evidence-reports/${reportId}`, payload);
        toast.success('Report updated successfully');
        navigate('/evidence-reports');
      } else {
        response = await api.post('/api/evidence-reports', payload);
        const report = response.data.data.report;
        const shareUrl = response.data.data.share_url;
        setCreatedReport({ ...report, share_url: shareUrl });
        setShareModalOpen(true);
        toast.success('Report created successfully');
      }
    } catch (error) {
      logger.error('Error saving report:', error);
      const message = error.response?.data?.error?.message || 'Failed to save report';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const hasSelections = selectedQuestIds.length > 0 || selectedCourseIds.length > 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="bg-white rounded-xl p-6 space-y-4">
              <div className="h-10 bg-gray-200 rounded"></div>
              <div className="h-24 bg-gray-200 rounded"></div>
            </div>
            <div className="bg-white rounded-xl p-6 space-y-4">
              <div className="h-6 bg-gray-200 rounded w-1/4"></div>
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{isEditing ? 'Edit Report' : 'Create Report'} | Optio</title>
      </Helmet>

      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={() => navigate('/evidence-reports')}
              className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Reports
            </button>
            <h1 className="text-3xl font-bold text-gray-900">
              {isEditing ? 'Edit Evidence Report' : 'Create Evidence Report'}
            </h1>
            <p className="text-gray-500 mt-2">
              Select the quests and courses you want to include in your shareable report.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Report Details</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Evidence Report"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description (optional)
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Add a description for your report..."
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Content Selection */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <ReportQuestSelector
                quests={availableQuests}
                courses={availableCourses}
                selectedQuestIds={selectedQuestIds}
                selectedCourseIds={selectedCourseIds}
                onQuestToggle={handleQuestToggle}
                onCourseToggle={handleCourseToggle}
                onSelectAll={handleSelectAll}
                onClearAll={handleClearAll}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={() => navigate('/evidence-reports')}
                className="text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <Button
                type="submit"
                disabled={!hasSelections || isSaving}
                isLoading={isSaving}
                variant="primary"
                size="lg"
              >
                {isEditing ? 'Save Changes' : 'Create Report'}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Share Modal */}
      {createdReport && (
        <ShareReportModal
          isOpen={shareModalOpen}
          onClose={() => {
            setShareModalOpen(false);
            navigate('/evidence-reports');
          }}
          shareUrl={createdReport.share_url}
          reportTitle={createdReport.title}
        />
      )}
    </>
  );
};

export default EvidenceReportBuilder;
