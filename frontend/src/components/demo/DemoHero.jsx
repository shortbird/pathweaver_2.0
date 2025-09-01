import React, { useState, useEffect } from 'react';
import { Play, Clock, Award, Users, Sparkles } from 'lucide-react';

const DemoHero = ({ onStart }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [currentTestimonial, setCurrentTestimonial] = useState(0);

  const testimonials = [
    {
      text: "My son went from failing grades to launching his own app. Optio changed everything.",
      author: "Sarah M., Parent"
    },
    {
      text: "I finally get credit for all the real projects I do outside of boring textbooks!",
      author: "Alex, 16, Homeschooler"
    },
    {
      text: "The accredited diploma option gave us the best of both worlds.",
      author: "Michael R., Parent"
    }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-20 left-20 w-72 h-72 bg-[#6d469b]/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-[#ef597b]/10 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="text-center space-y-8">
        {/* Main Headline */}
        <div className="space-y-4">
          <h1 className="text-5xl md:text-6xl font-bold text-[#003f5c] leading-tight">
            Turn Real-World Projects Into
            <span className="block bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text text-transparent pb-2">
              Academic Credit
            </span>
          </h1>
          
          <p className="text-xl text-gray-700 max-w-3xl mx-auto">
            Watch how Optio students transform their passions into an impressive diploma 
            that shows genuine skills & achievements.
          </p>
        </div>

        {/* Value Props */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="bg-white/80 backdrop-blur rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
            <Award className="w-10 h-10 text-[#FFCA3A] mx-auto mb-3" />
            <h3 className="font-semibold text-[#003f5c] mb-2">Real Achievements</h3>
            <p className="text-sm text-gray-600">
              Turn hobbies & projects into academic credit
            </p>
          </div>
          
          <div className="bg-white/80 backdrop-blur rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
            <Users className="w-10 h-10 text-[#6d469b] mx-auto mb-3" />
            <h3 className="font-semibold text-[#003f5c] mb-2">Parent-Approved</h3>
            <p className="text-sm text-gray-600">
              Accredited diploma & teacher support options
            </p>
          </div>
          
          <div className="bg-white/80 backdrop-blur rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
            <Clock className="w-10 h-10 text-[#ef597b] mx-auto mb-3" />
            <h3 className="font-semibold text-[#003f5c] mb-2">2-Minute Demo</h3>
            <p className="text-sm text-gray-600">
              See the full experience in just minutes
            </p>
          </div>
        </div>

        {/* CTA Button */}
        <div className="relative">
          <button
            onClick={onStart}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="group relative px-12 py-6 bg-gradient-to-r from-[#ef597b] to-[#6d469b] 
                     text-white font-bold text-xl rounded-full shadow-xl 
                     hover:shadow-2xl transform hover:scale-105 transition-all duration-300"
          >
            <span className="flex items-center gap-3">
              <Play className={`w-6 h-6 ${isHovered ? 'animate-pulse' : ''}`} />
              Start Interactive Demo
              <Sparkles className={`w-5 h-5 ${isHovered ? 'animate-spin' : ''}`} />
            </span>
            
            {/* Pulse Effect */}
            <span className="absolute inset-0 rounded-full bg-white/20 animate-pulse" />
          </button>
          
          <p className="mt-4 text-sm text-gray-500">
            No signup required • Free to explore
          </p>
        </div>

        {/* Social Proof - Testimonial Only */}
        <div className="mt-12 p-6 bg-gradient-to-r from-[#6d469b]/5 to-[#ef597b]/5 rounded-2xl">
          <div className="text-center">
            <p className="text-lg italic text-gray-700 mb-2">
              "{testimonials[currentTestimonial].text}"
            </p>
            <p className="text-sm text-gray-500">
              — {testimonials[currentTestimonial].author}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DemoHero;