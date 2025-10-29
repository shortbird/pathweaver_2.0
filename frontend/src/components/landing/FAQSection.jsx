import { useState } from 'react'
import { Plus, Minus } from 'lucide-react'

const FAQSection = ({ faqs = [], title = 'Frequently Asked Questions' }) => {
  const [openIndex, setOpenIndex] = useState(null)

  const toggleFAQ = (index) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <div className="py-16 px-4 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <h2
          className="text-3xl md:text-4xl text-center text-gray-900 mb-12"
          style={{ fontFamily: 'Poppins', fontWeight: 700 }}
        >
          {title}
        </h2>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden transition-all duration-300 hover:shadow-md"
            >
              <button
                onClick={() => toggleFAQ(index)}
                className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
              >
                <span
                  className="text-lg text-gray-900 pr-4"
                  style={{ fontFamily: 'Poppins', fontWeight: 600 }}
                >
                  {faq.question}
                </span>
                <div className="flex-shrink-0">
                  {openIndex === index ? (
                    <Minus className="w-5 h-5 text-optio-pink" />
                  ) : (
                    <Plus className="w-5 h-5 text-optio-purple" />
                  )}
                </div>
              </button>

              {openIndex === index && (
                <div className="px-6 pb-5 pt-2 animate-fade-in">
                  <p
                    className="text-gray-600 leading-relaxed"
                    style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                  >
                    {faq.answer}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default FAQSection
