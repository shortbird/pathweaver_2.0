import React from 'react';
import { CheckCircleIcon, StarIcon, SparklesIcon } from '@heroicons/react/24/outline';

const ServiceCard = ({ service, onInquire, isFeatured = false }) => {
  return (
    <div className={`bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 p-6 flex flex-col h-full ${
      isFeatured ? 'border-4 border-gradient-to-r from-[#6D469B] to-[#EF597B] bg-gradient-to-br from-purple-50 to-pink-50' : 'border border-gray-100'
    }`}>

      {/* Header */}
      <div className="mb-4">
        <h3 className={`${isFeatured ? 'text-2xl' : 'text-xl'} font-bold text-gray-900 mb-2`} style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
          {service.name}
        </h3>
        <div className="mb-3">
          <span className={`${isFeatured ? 'text-4xl' : 'text-3xl'} font-bold bg-gradient-to-r from-[#6D469B] to-[#EF597B] bg-clip-text text-transparent`} style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
            {service.price_display || service.price}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="text-gray-600 mb-4 flex-grow" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
        {service.description}
      </p>

      {/* Features */}
      {service.features && service.features.length > 0 && (
        <div className="mb-6">
          <ul className="space-y-2">
            {service.features.map((feature, index) => {
              // Check if this is a Pro member benefit
              const isProBenefit = feature.toLowerCase().includes('pro member');

              return (
                <li key={index} className="flex items-start gap-2">
                  {isProBenefit ? (
                    <StarIcon className="w-5 h-5 text-[#EF597B] flex-shrink-0 mt-0.5 fill-current" />
                  ) : (
                    <CheckCircleIcon className="w-5 h-5 text-[#6D469B] flex-shrink-0 mt-0.5" />
                  )}
                  <span
                    className={`text-sm ${isProBenefit ? 'text-[#EF597B] font-semibold' : 'text-gray-700'}`}
                    style={{ fontFamily: 'Poppins', fontWeight: isProBenefit ? 600 : 500 }}
                  >
                    {feature}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* CTA Button */}
      <button
        onClick={() => onInquire(service)}
        className="w-full bg-gradient-to-r from-[#6D469B] to-[#EF597B] text-white py-3 px-6 rounded-xl hover:opacity-90 transition-opacity duration-200 font-semibold"
        style={{ fontFamily: 'Poppins', fontWeight: 600 }}
      >
        Learn More
      </button>
    </div>
  );
};

export default ServiceCard;
