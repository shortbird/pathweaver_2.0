import React from 'react';
import { CREDIT_REQUIREMENTS, TOTAL_CREDITS_REQUIRED } from '../../utils/creditRequirements';

const AccreditedDiplomaModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-[#ef597b] to-[#6d469b] flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14l9-5-9-5-9 5 9 5z"/>
                  <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/>
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Accredited High School Diploma</h2>
                <p className="text-gray-600">How Optio creates official transcripts</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Main Content */}
          <div className="space-y-8">
            {/* Overview */}
            <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-xl p-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-3">Optio's Unique Approach</h3>
              <p className="text-gray-700 leading-relaxed">
                Optio transforms daily learning activities into official high school credits through our innovative
                evidence-based validation system. Students document their learning journey across traditional academic
                subjects, with all work verified by licensed teachers as interdisciplinary, cross-curricular projects.
              </p>
            </div>

            {/* How It Works */}
            <div>
              <h3 className="text-xl font-semibold text-gray-800 mb-4">How It Works</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] flex items-center justify-center">
                    <span className="text-white font-bold text-xl">1</span>
                  </div>
                  <h4 className="font-semibold text-gray-800 mb-2">Document Learning</h4>
                  <p className="text-gray-600 text-sm">
                    Students complete quests and submit evidence of their learning across various subjects and activities.
                  </p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] flex items-center justify-center">
                    <span className="text-white font-bold text-xl">2</span>
                  </div>
                  <h4 className="font-semibold text-gray-800 mb-2">Teacher Verification</h4>
                  <p className="text-gray-600 text-sm">
                    Licensed educators review and validate learning evidence, mapping activities to traditional academic standards.
                  </p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] flex items-center justify-center">
                    <span className="text-white font-bold text-xl">3</span>
                  </div>
                  <h4 className="font-semibold text-gray-800 mb-2">Official Credits</h4>
                  <p className="text-gray-600 text-sm">
                    Validated learning is converted to official high school credits, creating a legitimate academic transcript.
                  </p>
                </div>
              </div>
            </div>

            {/* Credit Requirements */}
            <div>
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Credit Requirements for Graduation</h3>
              <div className="bg-gray-50 rounded-xl p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {Object.entries(CREDIT_REQUIREMENTS).map(([key, subject]) => (
                    <div key={key} className="flex justify-between items-center py-2 border-b border-gray-200 last:border-b-0">
                      <span className="text-gray-700">{subject.displayName}</span>
                      <span className="font-semibold text-gray-800">{subject.credits} credits</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center pt-4 border-t border-gray-300">
                  <span className="text-lg font-semibold text-gray-800">Total Required:</span>
                  <span className="text-xl font-bold bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text text-transparent">
                    {TOTAL_CREDITS_REQUIRED} credits
                  </span>
                </div>
              </div>
            </div>

            {/* Cross-Curricular Learning */}
            <div>
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Cross-Curricular Integration</h3>
              <div className="bg-blue-50 rounded-xl p-6">
                <p className="text-gray-700 leading-relaxed mb-4">
                  Unlike traditional education that separates subjects into isolated classes, Optio recognizes that
                  real learning is interdisciplinary. A single project might demonstrate competency in:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-2">Example: Building a Garden</h4>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• <strong>Science:</strong> Botany, soil chemistry, ecosystems</li>
                      <li>• <strong>Mathematics:</strong> Measurements, area calculations, data analysis</li>
                      <li>• <strong>Language Arts:</strong> Research, documentation, presentation</li>
                      <li>• <strong>Social Studies:</strong> Food systems, environmental impact</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-2">Example: Creating a Budget App</h4>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• <strong>Digital Literacy:</strong> Programming, software design</li>
                      <li>• <strong>Mathematics:</strong> Algorithms, financial calculations</li>
                      <li>• <strong>Financial Literacy:</strong> Budgeting principles, economics</li>
                      <li>• <strong>Fine Arts:</strong> User interface design, visual aesthetics</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Legitimacy & Recognition */}
            <div>
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Official Recognition</h3>
              <div className="bg-green-50 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-2">Accredited and Legitimate</h4>
                    <p className="text-gray-700 leading-relaxed">
                      All Optio diplomas are backed by licensed educators and follow state educational standards.
                      The resulting transcript is a legitimate high school diploma suitable for college applications,
                      employment, and all official purposes where educational credentials are required.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end mt-8 pt-6 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-6 py-3 rounded-lg bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-lg transition-shadow font-medium"
            >
              Got it!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccreditedDiplomaModal;