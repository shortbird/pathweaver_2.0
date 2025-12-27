import React from 'react';

const DiplomaExplanationModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" style={{ boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
        <div className="p-8">
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-3xl font-bold text-primary">
              What is a Self-Validated Diploma?
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-6">
            <div className="p-6 rounded-xl bg-gradient-to-r from-optio-pink/5 to-optio-purple/5" style={{ border: '1px solid rgba(109,70,155,0.1)' }}>
              <h3 className="font-bold text-lg mb-3 text-optio-purple">A Revolutionary Approach to Education</h3>
              <p className="text-gray-700 leading-relaxed">
                Unlike traditional diplomas that require external validation from institutions, a self-validated diploma
                puts YOU in charge of your education. You choose what to learn, document your journey with evidence,
                and build a portfolio that authentically represents your unique skills and interests.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-optio-pink" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 0016 0zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <h4 className="font-semibold text-primary">Evidence-Based</h4>
                </div>
                <p className="text-sm text-gray-600">
                  Every achievement is backed by real evidence - projects, writings, videos, and creations that prove your learning.
                </p>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-optio-purple" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <h4 className="font-semibold text-primary">Self-Directed</h4>
                </div>
                <p className="text-sm text-gray-600">
                  You choose what to learn based on your interests and curiosity, not a predetermined curriculum.
                </p>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-optio-pink" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                  </svg>
                  <h4 className="font-semibold text-primary">Process-Focused</h4>
                </div>
                <p className="text-sm text-gray-600">
                  Celebrates the journey of learning and growth, not just final outcomes or test scores.
                </p>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-optio-purple" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762z" />
                  </svg>
                  <h4 className="font-semibold text-primary">Publicly Shareable</h4>
                </div>
                <p className="text-sm text-gray-600">
                  Create a professional portfolio that showcases your unique learning story to the world.
                </p>
              </div>
            </div>

            <div className="p-4 bg-gradient-primary text-white rounded-lg">
              <p className="text-center font-semibold">
                "The Process Is The Goal" - Your learning journey is valuable for who you become, not what you prove.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiplomaExplanationModal;
