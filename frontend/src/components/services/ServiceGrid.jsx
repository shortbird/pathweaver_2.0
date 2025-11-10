import React from 'react';
import ServiceCard from './ServiceCard';

const ServiceGrid = ({ categories, onInquire }) => {
  // Define category order for consistent display
  const categoryOrder = [
    'Subscriptions',
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
