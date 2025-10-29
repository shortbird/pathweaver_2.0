const ProcessSteps = ({ steps = [], title = 'How It Works' }) => {
  return (
    <div className="py-16 px-4 bg-white">
      <div className="max-w-5xl mx-auto">
        <h2
          className="text-3xl md:text-4xl text-center text-gray-900 mb-16"
          style={{ fontFamily: 'Poppins', fontWeight: 700 }}
        >
          {title}
        </h2>

        <div className="relative">
          {/* Connecting line (hidden on mobile) */}
          <div className="hidden md:block absolute top-12 left-0 right-0 h-1 bg-gradient-primary opacity-20" style={{ top: '2.5rem' }}></div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            {steps.map((step, index) => (
              <div key={index} className="text-center relative">
                {/* Step number circle */}
                <div className="relative inline-block mb-6">
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center mx-auto shadow-lg relative z-10 bg-white"
                    style={{ background: 'linear-gradient(135deg, #6D469B 0%, #EF597B 100%)' }}
                  >
                    <span
                      className="text-3xl text-white"
                      style={{ fontFamily: 'Poppins', fontWeight: 700 }}
                    >
                      {index + 1}
                    </span>
                  </div>
                </div>

                {/* Step content */}
                <h3
                  className="text-xl text-gray-900 mb-3"
                  style={{ fontFamily: 'Poppins', fontWeight: 700 }}
                >
                  {step.title}
                </h3>
                <p
                  className="text-gray-600 leading-relaxed"
                  style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                >
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProcessSteps
