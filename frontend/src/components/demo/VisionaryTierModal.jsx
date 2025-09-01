import React from 'react';
import { X, Shield, GraduationCap, Users, Calendar, Award, CheckCircle, Star } from 'lucide-react';

const AcademyTierModal = ({ onClose }) => {
  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" style={{ margin: 0, padding: '1rem' }}>
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-[#ef597b] to-[#6d469b] p-8 text-white">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-white/20 rounded-full">
              <Shield className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-3xl font-bold mb-1">Academy Tier - $499.99/month</h2>
              <p className="text-white/90">A personalized private school experience</p>
            </div>
          </div>
          
          <div className="bg-white/20 rounded-lg p-4 mt-4">
            <p className="text-lg text-white font-semibold mb-2">🎓 Two Diplomas with Academy:</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/10 rounded p-3">
                <p className="font-bold mb-1">1. Optio Portfolio Diploma</p>
                <p className="text-sm">Shows real projects & achievements</p>
              </div>
              <div className="bg-white/10 rounded p-3">
                <p className="font-bold mb-1">2. Accredited HS Diploma</p>
                <p className="text-sm">Traditional credential for college</p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8">
          {/* Key Features */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex gap-4">
              <GraduationCap className="w-8 h-8 text-[#6d469b] flex-shrink-0" />
              <div>
                <h3 className="font-bold text-[#003f5c] mb-1">Fully Accredited Diploma</h3>
                <p className="text-sm text-gray-600">
                  Recognized by colleges and employers nationwide. Your child gets a real high school diploma.
                </p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <Users className="w-8 h-8 text-[#6d469b] flex-shrink-0" />
              <div>
                <h3 className="font-bold text-[#003f5c] mb-1">1-on-1 Teacher Support</h3>
                <p className="text-sm text-gray-600">
                  Daily check-ins with certified teachers who provide guidance and accountability.
                </p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <Calendar className="w-8 h-8 text-[#6d469b] flex-shrink-0" />
              <div>
                <h3 className="font-bold text-[#003f5c] mb-1">Flexible Schedule</h3>
                <p className="text-sm text-gray-600">
                  Learn at your own pace while meeting state requirements. Perfect for busy families.
                </p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <Award className="w-8 h-8 text-[#6d469b] flex-shrink-0" />
              <div>
                <h3 className="font-bold text-[#003f5c] mb-1">College Prep Included</h3>
                <p className="text-sm text-gray-600">
                  SAT/ACT prep, college counseling, and application support all included.
                </p>
              </div>
            </div>
          </div>

          {/* What's Included */}
          <div className="bg-gradient-to-r from-[#6d469b]/5 to-[#ef597b]/5 rounded-xl p-6">
            <h3 className="font-bold text-[#003f5c] mb-4">What You Get with Academy ($499.99/mo):</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                'Accredited high school diploma',
                'Regular 1-on-1 teacher sessions',
                'Parent Dashboard to view live student progress',
                'College application support',
                'SAT/ACT prep resources',
                'Transcript management',
                'Letter of recommendation',
                'Priority support',
                'All Supported tier features',
                'Unlimited custom quests',
                'Access to Optio\'s network of business leaders & mentors'
              ].map((feature, index) => (
                <div key={index} className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Parent Testimonial */}
          <div className="bg-gray-50 rounded-xl p-6">
            <div className="flex gap-1 mb-3">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-5 h-5 fill-[#FFCA3A] text-[#FFCA3A]" />
              ))}
            </div>
            <p className="text-gray-700 italic mb-3">
              "My daughter went from failing traditional school to thriving with Optio's Academy tier. 
              The accredited diploma gave us peace of mind while she pursued her passions. 
              She just got accepted to her dream college!"
            </p>
            <p className="text-sm text-gray-500">— Jennifer K., Parent of Academy Student</p>
          </div>

          {/* Comparison */}
          <div className="space-y-3">
            <h3 className="font-bold text-[#003f5c]">Compare to Traditional Private School:</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 border-2 border-gray-200 rounded-lg">
                <h4 className="font-semibold text-gray-700 mb-2">Traditional Private School</h4>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>• $15,000-30,000/year</li>
                  <li>• Fixed schedule</li>
                  <li>• One-size-fits-all curriculum</li>
                  <li>• Limited personalization</li>
                </ul>
              </div>
              <div className="p-4 border-2 border-[#6d469b] bg-[#6d469b]/5 rounded-lg">
                <h4 className="font-semibold text-[#6d469b] mb-2">Optio Academy</h4>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li className="font-semibold">• $499.99/month</li>
                  <li>• Learn on your own schedule</li>
                  <li>• Personalized quests</li>
                  <li>• 1-on-1 teacher support</li>
                </ul>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center pt-4">
            <p className="text-gray-600 mb-4">
              Continue the demo to see how the quest system works, 
              then upgrade to Academy for the full accredited experience.
            </p>
            <button
              onClick={onClose}
              className="px-8 py-3 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white font-semibold rounded-full hover:shadow-lg transition-all duration-300"
            >
              Continue Demo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AcademyTierModal;