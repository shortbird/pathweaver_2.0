import React from 'react'
import { Link } from 'react-router-dom'
import { captureEvent } from '../../services/posthog'

const LOGO_URL = 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png'

const FooterLink = ({ to, children, section }) => (
  <Link
    to={to}
    onClick={() => captureEvent('marketing_footer_link_click', { link: children, section, path: to })}
    className="text-gray-400 hover:text-white transition-colors text-sm"
    style={{ fontFamily: 'Poppins' }}
  >
    {children}
  </Link>
)

const MarketingFooter = () => {
  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-1">
            <img
              src={LOGO_URL}
              alt="Optio Education"
              className="h-8 brightness-0 invert mb-4"
            />
            <p
              className="text-gray-400 text-sm leading-relaxed"
              style={{ fontFamily: 'Poppins' }}
            >
              Where self-directed learning meets official credentials.
            </p>
          </div>

          {/* For Learners */}
          <div>
            <h4
              className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4"
              style={{ fontFamily: 'Poppins' }}
            >
              For Learners
            </h4>
            <div className="flex flex-col gap-3">
              <FooterLink to="/for-students" section="learners">For Students</FooterLink>
              <FooterLink to="/for-families" section="learners">For Families</FooterLink>
              <FooterLink to="/for-schools" section="learners">For Schools</FooterLink>
            </div>
          </div>

          {/* Platform */}
          <div>
            <h4
              className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4"
              style={{ fontFamily: 'Poppins' }}
            >
              Platform
            </h4>
            <div className="flex flex-col gap-3">
              <FooterLink to="/how-it-works" section="platform">How It Works</FooterLink>
              <FooterLink to="/demo" section="platform">Demo</FooterLink>
              <FooterLink to="/register" section="platform">Get Started</FooterLink>
            </div>
          </div>

          {/* Legal */}
          <div>
            <h4
              className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4"
              style={{ fontFamily: 'Poppins' }}
            >
              Company
            </h4>
            <div className="flex flex-col gap-3">
              <FooterLink to="/terms" section="company">Terms of Service</FooterLink>
              <FooterLink to="/privacy" section="company">Privacy Policy</FooterLink>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p
            className="text-gray-500 text-sm"
            style={{ fontFamily: 'Poppins' }}
          >
            &copy; {new Date().getFullYear()} Optio Education. All rights reserved.
          </p>
          <p
            className="text-gray-500 text-sm"
            style={{ fontFamily: 'Poppins' }}
          >
            WASC Accredited
          </p>
        </div>
      </div>
    </footer>
  )
}

export default MarketingFooter
