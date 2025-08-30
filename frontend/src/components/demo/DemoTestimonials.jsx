import React, { useState } from 'react';
import { 
  StarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChatBubbleBottomCenterTextIcon
} from '@heroicons/react/24/solid';
import { DEMO_DATA } from '../../utils/demoData';

const DemoTestimonials = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const testimonials = DEMO_DATA.testimonials;

  const nextTestimonial = () => {
    setCurrentIndex((prev) => (prev + 1) % testimonials.length);
  };

  const prevTestimonial = () => {
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  const getPillarColor = (pillar) => {
    const colors = {
      creativity: 'bg-purple-100 text-purple-700',
      critical_thinking: 'bg-blue-100 text-blue-700',
      practical_skills: 'bg-green-100 text-green-700',
      communication: 'bg-orange-100 text-orange-700',
      cultural_literacy: 'bg-red-100 text-red-700'
    };
    return colors[pillar] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Desktop Grid Layout */}
      <div className="hidden md:grid md:grid-cols-3 gap-8">
        {testimonials.map((testimonial, index) => (
          <div
            key={testimonial.id}
            className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-2xl transition-all transform hover:-translate-y-1"
          >
            {/* Quote Icon */}
            <div className="text-purple-200 mb-4">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
              </svg>
            </div>

            {/* Testimonial Content */}
            <p className="text-gray-700 mb-6 italic leading-relaxed">
              "{testimonial.quote}"
            </p>

            {/* Quest Completed Badge */}
            <div className="mb-4">
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getPillarColor(testimonial.pillar)}`}>
                <CheckCircleIcon className="w-3 h-3 mr-1" />
                {testimonial.questCompleted}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                Earned {testimonial.xpEarned} XP
              </div>
            </div>

            {/* Author Info */}
            <div className="flex items-center">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-indigo-400 rounded-full flex items-center justify-center text-white font-bold">
                {testimonial.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div className="ml-3">
                <div className="font-semibold text-gray-900">{testimonial.name}</div>
                <div className="text-sm text-gray-600">{testimonial.role}</div>
              </div>
            </div>

            {/* Star Rating */}
            <div className="flex mt-4">
              {[...Array(5)].map((_, i) => (
                <StarIcon key={i} className="w-5 h-5 text-yellow-400" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile Carousel */}
      <div className="md:hidden relative">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          {/* Current Testimonial */}
          <div className="relative">
            {/* Quote Icon */}
            <div className="text-purple-200 mb-4">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
              </svg>
            </div>

            <p className="text-gray-700 mb-6 italic leading-relaxed">
              "{testimonials[currentIndex].quote}"
            </p>

            {/* Quest Completed Badge */}
            <div className="mb-4">
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getPillarColor(testimonials[currentIndex].pillar)}`}>
                <CheckCircleIcon className="w-3 h-3 mr-1" />
                {testimonials[currentIndex].questCompleted}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                Earned {testimonials[currentIndex].xpEarned} XP
              </div>
            </div>

            {/* Author Info */}
            <div className="flex items-center">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-indigo-400 rounded-full flex items-center justify-center text-white font-bold">
                {testimonials[currentIndex].name.split(' ').map(n => n[0]).join('')}
              </div>
              <div className="ml-3">
                <div className="font-semibold text-gray-900">
                  {testimonials[currentIndex].name}
                </div>
                <div className="text-sm text-gray-600">
                  {testimonials[currentIndex].role}
                </div>
              </div>
            </div>

            {/* Star Rating */}
            <div className="flex mt-4">
              {[...Array(5)].map((_, i) => (
                <StarIcon key={i} className="w-5 h-5 text-yellow-400" />
              ))}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center mt-6">
            <button
              onClick={prevTestimonial}
              className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
            </button>

            {/* Dots Indicator */}
            <div className="flex gap-2">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentIndex(index)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    currentIndex === index
                      ? 'bg-purple-600 w-6'
                      : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>

            <button
              onClick={nextTestimonial}
              className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <ChevronRightIcon className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Additional Social Proof */}
      <div className="mt-12 text-center">
        <div className="inline-flex items-center justify-center space-x-8">
          <div>
            <div className="text-3xl font-bold text-gray-900">2,500+</div>
            <div className="text-sm text-gray-600">Active Students</div>
          </div>
          <div className="w-px h-12 bg-gray-300"></div>
          <div>
            <div className="text-3xl font-bold text-gray-900">15,000+</div>
            <div className="text-sm text-gray-600">Quests Completed</div>
          </div>
          <div className="w-px h-12 bg-gray-300"></div>
          <div>
            <div className="text-3xl font-bold text-gray-900">4.9/5</div>
            <div className="text-sm text-gray-600">Student Rating</div>
          </div>
        </div>
      </div>

      {/* Trust Badges */}
      <div className="mt-8 flex justify-center items-center space-x-6">
        <div className="text-gray-400 text-sm">Trusted by:</div>
        <div className="flex space-x-6">
          <div className="h-8 w-24 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-500">
            Khan Academy
          </div>
          <div className="h-8 w-24 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-500">
            Brilliant
          </div>
          <div className="h-8 w-24 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-500">
            Code Academy
          </div>
        </div>
      </div>
    </div>
  );
};

// Import CheckCircleIcon since it's not exported from heroicons
const CheckCircleIcon = ({ className }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
  </svg>
);

export default DemoTestimonials;