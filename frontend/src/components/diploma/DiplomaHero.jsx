// The masthead: the student's name, the diploma title, and the control that
// explains what a self-validated diploma is.
import React from 'react';

const DiplomaHero = ({ getStudentName, setShowDiplomaExplanation }) => (
<div className="relative overflow-hidden bg-gradient-primary text-white">
  <div className="absolute inset-0 bg-black opacity-10"></div>
  <div className="relative max-w-7xl mx-auto px-4 py-12">
    <div className="text-center max-w-4xl mx-auto">
      <div className="mb-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 backdrop-blur-sm rounded-full text-white/80 text-sm font-medium mb-3">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.909V17h2V9L12 3z"/>
          </svg>
          Portfolio Diploma
        </div>
      </div>
      <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4" style={{ letterSpacing: '-1px' }}>
        {getStudentName()}
      </h1>
      <div className="text-base md:text-lg text-white/95 mb-6 leading-relaxed">
        <p className="mb-1">
          has accepted the responsibility to self-validate their education.
        </p>
        <p className="text-white/80">
          This portfolio diploma is a record of their learning process.
        </p>
      </div>
      <button
        onClick={() => setShowDiplomaExplanation(true)}
        className="inline-flex items-center gap-2 text-white/90 hover:text-white hover:bg-white/10 px-4 py-2 rounded-lg transition-all duration-200 text-sm min-h-[44px]"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>What is a self-validated diploma?</span>
      </button>
    </div>
  </div>
</div>
);

export default DiplomaHero;
