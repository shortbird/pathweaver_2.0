import React, { forwardRef } from 'react'

const TestimonialsSection = forwardRef(({ isVisible = true }, ref) => {
  const testimonials = [
    {
      quote: "Running a microschool means balancing individualized learning with official requirements. Optio handles both seamlessly.",
      author: "Director Lisa K.",
      role: "Bright Futures Microschool",
    },
    {
      quote: "As a homeschool parent, the automatic portfolio was a game-changer. No more hours uploading photos and organizing files.",
      author: "Sarah M.",
      role: "Parent, Oregon",
    },
    {
      quote: "I actually WANT to do my work now. The quests make learning feel like an adventure, not a chore.",
      author: "Alex T., age 14",
      role: "Student, Texas",
    },
  ]

  return (
    <section
      ref={ref}
      className={`py-20 bg-gray-50 transition-all duration-700 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2
            className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            Trusted by Schools & Families
          </h2>
        </div>

        {/* Testimonial Cards */}
        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="bg-white rounded-2xl p-6 shadow-md border border-gray-100 flex flex-col"
            >
              <div className="flex-grow">
                <p
                  className="text-gray-700 italic leading-relaxed mb-4"
                  style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                >
                  "{testimonial.quote}"
                </p>
              </div>
              <div className="border-t border-gray-100 pt-4 mt-4">
                <p
                  className="font-semibold text-gray-900"
                  style={{ fontFamily: 'Poppins', fontWeight: 600 }}
                >
                  {testimonial.author}
                </p>
                <p
                  className="text-sm text-gray-500"
                  style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                >
                  {testimonial.role}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
})

TestimonialsSection.displayName = 'TestimonialsSection'

export default TestimonialsSection
