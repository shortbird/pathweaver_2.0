import React from 'react';
import { X, Shield, GraduationCap, Users, Calendar, Award, CheckCircle, Star, XCircle } from 'lucide-react';

const AcademyTierModalUpdated = ({ onClose, showComparison = false }) => {
  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" style={{ margin: 0, padding: '1rem' }}>
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-[#ef597b] to-[#6d469b] p-8 text-white">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="text-center">
            <h2 className="text-3xl font-bold mb-2">Choose Your Path to Success</h2>
            <p className="text-white/90 text-lg">
              Compare our Supported and Academy tiers to find the perfect fit
            </p>
          </div>
          
          <div className="bg-white/20 rounded-lg p-4 mt-4">
            <p className="text-2xl text-white font-semibold mb-2">The Key Difference:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white/10 rounded p-3">
                <p className="font-bold mb-1">Supported: ONE Diploma</p>
                <p className="text-sm">Optio Portfolio Diploma only</p>
              </div>
              <div className="bg-white/10 rounded p-3">
                <p className="font-bold mb-1">Academy: TWO Diplomas</p>
                <p className="text-sm">Optio Portfolio + Accredited HS Diploma</p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8">
          {/* Tier Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Creator Tier */}
            <div className="relative border-2 border-gray-200 rounded-xl p-6">
              <div className="text-center mb-4">
                <h3 className="text-3xl font-bold text-[#003f5c]">Supported</h3>
                <p className="text-sm text-gray-600">For dedicated learners</p>
              </div>
              
              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Optio Portfolio Diploma</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Access to support team of certified teachers</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Team up with friends for XP bonuses</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Unlimited quest access</span>
                </div>
                <div className="flex items-start gap-2">
                  <XCircle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-400">No traditionally-accredited diploma</span>
                </div>
                <div className="flex items-start gap-2">
                  <XCircle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-400">No 1-on-1 teacher</span>
                </div>
              </div>
              
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-700">
                  <strong>Best for:</strong> Self-motivated learners who want portfolio validation
                </p>
              </div>
            </div>

            {/* Visionary Tier */}
            <div className="relative border-2 border-[#6d469b] rounded-xl p-6 bg-gradient-to-br from-[#6d469b]/5 to-[#ef597b]/5">
              {/* Accredited Badge on Top Border */}
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-full">
                  ACCREDITED
                </div>
              </div>
              <div className="text-center mb-4">
                <h3 className="text-3xl font-bold text-[#003f5c]">Academy</h3>
                <p className="text-sm text-gray-600">Personalized private school</p>
              </div>
              
              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm font-semibold">TWO diplomas (Portfolio + Accredited)</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Everything in Supported</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">1-on-1 teacher support</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Daily check-ins</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">College prep included</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Industry mentor network</span>
                </div>
              </div>
              
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-xs text-green-700">
                  <strong>Best for:</strong> Students who want traditionally-accredited diplomas and personalized teacher support
                </p>
              </div>
            </div>
          </div>

          {/* Key Benefits Sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Why Choose Creator */}
            <div className="bg-gradient-to-r from-[#6d469b]/10 to-[#ef597b]/10 rounded-xl p-6">
              <h3 className="font-bold text-[#003f5c] mb-4">Why Parents Choose Supported:</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Star className="w-5 h-5 text-[#6d469b] flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">Try Before Committing</p>
                    <p className="text-xs text-gray-600">Test if Optio works for your learner</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Award className="w-5 h-5 text-[#6d469b] flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">Portfolio Building</p>
                    <p className="text-xs text-gray-600">Create impressive achievement records</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-[#6d469b] flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">Teacher Support</p>
                    <p className="text-xs text-gray-600">Access to certified educators</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-[#6d469b] flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">Upgrade Anytime</p>
                    <p className="text-xs text-gray-600">Move to Academy when ready</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Why Choose Visionary */}
            <div className="bg-gradient-to-r from-[#6d469b]/10 to-[#ef597b]/10 rounded-xl p-6">
              <h3 className="font-bold text-[#003f5c] mb-4">Why Parents Choose Academy:</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <GraduationCap className="w-5 h-5 text-[#6d469b] flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">College Ready</p>
                    <p className="text-xs text-gray-600">Accredited diploma accepted everywhere</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-[#6d469b] flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">Personal Support</p>
                    <p className="text-xs text-gray-600">Licensed teachers guide your learner</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-[#6d469b] flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">Flexible Schedule</p>
                    <p className="text-xs text-gray-600">Learn at your own pace</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Award className="w-5 h-5 text-[#6d469b] flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">Double Recognition</p>
                    <p className="text-xs text-gray-600">Portfolio + traditional credentials</p>
                  </div>
                </div>
              </div>
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
              "We started with Supported to see if Optio was right for us. Within a month, we upgraded to Academy 
              for the accredited diploma. Best decision ever - my son is engaged AND on track for college!"
            </p>
            <p className="text-sm text-gray-500">— Sarah M., Academy Parent</p>
          </div>

          {/* CTA */}
          <div className="text-center pt-4">
            <p className="text-gray-600 mb-4">
              Not sure which is right for you? Start with Supported and upgrade anytime!
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

export default AcademyTierModalUpdated;