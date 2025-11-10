import React from 'react';
import { CheckCircle } from 'lucide-react';

const ServiceCard = ({ service, onInquire }) => {
  const formatPrice = (price, priceType) => {
    const formattedPrice = `$${price.toFixed(0)}`;

    switch (priceType) {
      case 'monthly':
        return `${formattedPrice}/month`;
      case 'per-session':
        return `${formattedPrice}/session`;
      case 'per-credit':
        return `${formattedPrice}/credit`;
      case 'one-time':
      default:
        return formattedPrice;
    }
  };

  const getPriceLabel = (priceType) => {
    switch (priceType) {
      case 'monthly':
        return 'Monthly Subscription';
      case 'per-session':
        return 'Per Session';
      case 'per-credit':
        return 'Per Credit';
      case 'one-time':
      default:
        return 'One-Time';
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 p-6 flex flex-col h-full border border-gray-100">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
          {service.name}
        </h3>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-3xl font-bold bg-gradient-to-r from-[#6D469B] to-[#EF597B] bg-clip-text text-transparent" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
            {formatPrice(service.price, service.price_type)}
          </span>
          <span className="text-sm text-gray-500" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
            {getPriceLabel(service.price_type)}
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
            {service.features.map((feature, index) => (
              <li key={index} className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-[#6D469B] flex-shrink-0 mt-0.5" />
                <span className="text-sm text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  {feature}
                </span>
              </li>
            ))}
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
