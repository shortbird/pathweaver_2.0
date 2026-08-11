import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import TranscriptView from '../components/credits/TranscriptView';

const TranscriptPage = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Academic Transcript
          </h1>
          <p className="text-sm text-gray-500 mt-1 max-w-3xl mb-6">
            Your comprehensive learning record showing all achievements, badges earned,
            quests completed, and academic credits across all pillars.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => window.print()}
              className="btn-primary"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print Transcript
            </button>

            <a
              href="/overview"
              className="btn-quiet"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              View Diploma
            </a>
          </div>
        </div>

        {/* Transcript Component */}
        <div className="max-w-5xl mx-auto">
          <TranscriptView userId={user?.id} />
        </div>

        {/* Print-specific styling */}
        <style jsx>{`
          @media print {
            .no-print {
              display: none !important;
            }
            body {
              background: white;
            }
          }
        `}</style>

        {/* Additional Actions */}
        <div className="mt-8 max-w-5xl mx-auto no-print">
          <div className="bg-optio-purple/5 border border-optio-purple/10 rounded-xl p-6">
            <h3 className="font-bold text-gray-900 mb-3">About Your Transcript</h3>
            <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-700">
              <div>
                <p className="font-medium mb-2">Official Record</p>
                <p className="text-gray-600">
                  This transcript represents your verified learning achievements on the Optio platform.
                  All quests and badges have been validated through evidence submission.
                </p>
              </div>
              <div>
                <p className="font-medium mb-2">Sharing Your Transcript</p>
                <p className="text-gray-600">
                  You can print this transcript or share your public diploma link with colleges,
                  employers, or anyone interested in your learning journey.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Related Links */}
        <div className="mt-6 max-w-5xl mx-auto grid md:grid-cols-3 gap-4 no-print">
          <a
            href="/credits"
            className="block p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-optio-purple/60 transition-all"
          >
            <div className="text-2xl mb-2">📊</div>
            <div className="font-medium text-gray-900">Credit Tracker</div>
            <div className="text-xs text-gray-600">View detailed credit breakdown</div>
          </a>

          <a
            href="/badge-progress"
            className="block p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-optio-purple/60 transition-all"
          >
            <div className="text-2xl mb-2">🎯</div>
            <div className="font-medium text-gray-900">Badge Progress</div>
            <div className="text-xs text-gray-600">Track badge achievements</div>
          </a>
        </div>
      </div>
    </div>
  );
};

export default TranscriptPage;
