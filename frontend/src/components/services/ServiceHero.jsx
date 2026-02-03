import React from 'react';
import { ArrowRightIcon } from '@heroicons/react/24/outline';

const ServiceHero = ({ onScrollToServices }) => {
  return (
    <div className="relative bg-gradient-to-br from-purple-50 via-pink-50 to-white py-20 px-4 overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[#6D469B]/10 to-[#EF597B]/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-[#EF597B]/10 to-[#6D469B]/10 rounded-full blur-3xl"></div>

      <div className="max-w-4xl mx-auto text-center relative z-10">
        {/* Main headline */}
        <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
          Support for your Learning{' '}
          <span className="bg-gradient-to-r from-[#6D469B] to-[#EF597B] bg-clip-text text-transparent">
            Journey
          </span>
        </h1>

        {/* Subheading */}
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
          Optio services are designed enhance your educational experience. From parent tools to expert consultations, transcripts to portfolio development, we're here to support your unique path.
        </p>

        {/* Key message */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 mb-8 max-w-2xl mx-auto border border-purple-100">
          <p className="text-lg text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>
            All student learning features are completely free.
          </p>
          <p className="text-gray-600 mt-2" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
            The services listed below are optional add-ons for those who want extra support, documentation, or accountability tools.
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={onScrollToServices}
            className="bg-gradient-to-r from-[#6D469B] to-[#EF597B] text-white py-4 px-8 rounded-xl hover:opacity-90 transition-opacity duration-200 font-semibold inline-flex items-center justify-center gap-2"
            style={{ fontFamily: 'Poppins', fontWeight: 600 }}
          >
            Explore Services
            <ArrowRightIcon className="w-5 h-5" />
          </button>
          <a
            href="/"
            className="bg-white text-[#6D469B] py-4 px-8 rounded-xl hover:bg-gray-50 transition-colors duration-200 font-semibold border-2 border-[#6D469B] inline-flex items-center justify-center"
            style={{ fontFamily: 'Poppins', fontWeight: 600 }}
          >
            Back to Home
          </a>
        </div>
      </div>
    </div>
  );
};

export default ServiceHero;
