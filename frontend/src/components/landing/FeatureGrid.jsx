const FeatureGrid = ({ features = [], title = null, subtitle = null }) => {
  return (
    <div className="py-16 px-4 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {title && (
          <h2
            className="text-3xl md:text-4xl text-center text-gray-900 mb-4"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            {title}
          </h2>
        )}

        {subtitle && (
          <p
            className="text-lg text-center text-gray-600 mb-12 max-w-3xl mx-auto"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            {subtitle}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="text-center p-8 bg-gradient-to-br from-optio-pink/5 to-optio-purple/5 rounded-xl hover:shadow-lg transition-all duration-300 transform hover:scale-105"
            >
              <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                {feature.icon}
              </div>
              <h3
                className="text-xl text-gray-900 mb-3"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                {feature.title}
              </h3>
              <p
                className="text-gray-600 leading-relaxed"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default FeatureGrid
