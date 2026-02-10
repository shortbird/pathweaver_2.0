/**
 * MyEvidenceReports - Page listing user's evidence reports
 *
 * Shows all evidence reports created by the user with options
 * to share, edit, or delete each report.
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import ReportCard from '../components/evidence-report/ReportCard';
import ShareReportModal from '../components/evidence-report/ShareReportModal';
import logger from '../utils/logger';

const MyEvidenceReports = () => {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [shareModalReport, setShareModalReport] = useState(null);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/api/evidence-reports');
      setReports(response.data.data.reports || []);
    } catch (error) {
      logger.error('Error fetching reports:', error);
      toast.error('Failed to load reports');
    } finally {
      setIsLoading(false);
    }
  };

  const handleShare = (report) => {
    setShareModalReport(report);
  };

  const handleDelete = async (reportId) => {
    try {
      await api.delete(`/api/evidence-reports/${reportId}`);
      setReports(prev => prev.filter(r => r.id !== reportId));
      toast.success('Report deleted');
    } catch (error) {
      logger.error('Error deleting report:', error);
      toast.error('Failed to delete report');
      throw error;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="flex justify-between items-center">
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
              <div className="h-10 bg-gray-200 rounded w-32"></div>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-48 bg-gray-200 rounded-xl"></div>
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
        <title>My Evidence Reports | Optio</title>
      </Helmet>

      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Evidence Reports</h1>
              <p className="text-gray-500 mt-1">
                Create shareable reports to showcase your learning evidence
              </p>
            </div>
            <Link
              to="/evidence-reports/new"
              className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Report
            </Link>
          </div>

          {/* Reports Grid or Empty State */}
          {reports.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-6">
              {reports.map(report => (
                <ReportCard
                  key={report.id}
                  report={report}
                  onShare={handleShare}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <div className="mx-auto w-20 h-20 bg-gradient-to-br from-optio-purple/20 to-optio-pink/20 rounded-full flex items-center justify-center mb-6">
                <svg className="w-10 h-10 text-optio-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No reports yet</h3>
              <p className="text-gray-500 mb-6 max-w-md mx-auto">
                Create your first evidence report to share your learning achievements with colleges, employers, or anyone you want to impress.
              </p>
              <Link
                to="/evidence-reports/new"
                className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium rounded-lg hover:opacity-90 transition-opacity"
              >
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Your First Report
              </Link>
            </div>
          )}

          {/* Info Section */}
          <div className="mt-12 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              About Evidence Reports
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                  <svg className="w-5 h-5 text-optio-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Shareable Links</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Each report gets a unique URL anyone can view without logging in.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                  <svg className="w-5 h-5 text-optio-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Always Current</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Reports show live data - updates to evidence appear automatically.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                  <svg className="w-5 h-5 text-optio-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">PDF Download</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Viewers can download a PDF version for printing or archiving.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Share Modal */}
      {shareModalReport && (
        <ShareReportModal
          isOpen={Boolean(shareModalReport)}
          onClose={() => setShareModalReport(null)}
          shareUrl={shareModalReport.share_url}
          reportTitle={shareModalReport.title}
        />
      )}
    </>
  );
};

export default MyEvidenceReports;
