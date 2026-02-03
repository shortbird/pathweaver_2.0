import React from 'react'

const FeatureCard = ({ title, description, children, isVisible = true, index = 0 }) => (
  <div
    className={`group p-5 rounded-xl bg-white border border-gray-100 shadow-sm
               hover:shadow-lg hover:-translate-y-1 transition-all duration-300
               border-l-4 border-l-optio-purple/20 hover:border-l-optio-purple
               ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
    style={{
      transitionDelay: isVisible ? `${index * 100}ms` : '0ms',
    }}
  >
    {children}
    <h3
      className="text-lg font-bold text-gray-900 mb-1"
      style={{ fontFamily: 'Poppins', fontWeight: 700 }}
    >
      {title}
    </h3>
    <p
      className="text-gray-600 text-sm"
      style={{ fontFamily: 'Poppins', fontWeight: 500 }}
    >
      {description}
    </p>
  </div>
)

export default FeatureCard
