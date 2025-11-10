import React from 'react';
import ServiceCard from './ServiceCard';

const ServiceGrid = ({ categories, onInquire }) => {
  // Extract Optio Pro from Featured category
  const optioPro = categories['Featured']?.find(s => s.name === 'Optio Pro') ||
                   categories['Subscriptions']?.find(s => s.name === 'Optio Pro');

  // Define category order for consistent display (excluding Featured/Subscriptions)
  const categoryOrder = [
    'Educational Consultations',
    'Transcript Services',
    'Portfolio Services',
    'Community Services',
    'Documentation Services'
  ];

  // Sort categories according to defined order
  const sortedCategories = categoryOrder
    .filter(categoryName => categories[categoryName] && categories[categoryName].length > 0)
    .map(categoryName => ({
      name: categoryName,
      services: categories[categoryName]
    }));

  return (
    <div className="space-y-16">
      {/* Featured Optio Pro Card */}
      {optioPro && (
        <div className="mb-16">
          <div className="text-center mb-8">
            <h2 className="text-4xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              Best Value for Families
            </h2>
            <div className="w-24 h-1 bg-gradient-to-r from-[#6D469B] to-[#EF597B] mx-auto rounded-full"></div>
          </div>
          <div className="max-w-2xl mx-auto">
            <ServiceCard
              service={optioPro}
              onInquire={onInquire}
              isFeatured={true}
            />
          </div>
        </div>
      )}

      {/* Regular category sections */}
      {sortedCategories.map(({ name, services }) => (
        <div key={name} className="space-y-6">
          {/* Category Header */}
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              {name}
            </h2>
            <div className="w-20 h-1 bg-gradient-to-r from-[#6D469B] to-[#EF597B] mx-auto rounded-full"></div>
          </div>

          {/* Service Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map(service => (
              <ServiceCard
                key={service.id}
                service={service}
                onInquire={onInquire}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ServiceGrid;
