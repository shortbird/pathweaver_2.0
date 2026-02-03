import React from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import Button from '../components/ui/Button'

// Icon components
const QuestIcon = () => (
  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
  </svg>
)

const XPIcon = () => (
  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
)

const LearnByDoingIcon = () => (
  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
  </svg>
)

const ParentIcon = () => (
  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
)

const PortfolioIcon = () => (
  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
)

const Section = ({ icon, image, imageAlt, title, description, children, reversed = false }) => (
  <section className={`py-16 px-4 ${reversed ? 'bg-gray-50' : 'bg-white'}`}>
    <div className="max-w-4xl mx-auto">
      {/* Mobile layout: title, image, description stacked */}
      <div className="md:hidden text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          {title}
        </h2>
        <div className="flex justify-center mb-6">
          {image ? (
            <img
              src={image}
              alt={imageAlt || ''}
              className="w-72 h-48 object-cover rounded-2xl shadow-lg"
            />
          ) : (
            <div className="w-24 h-24 bg-gradient-to-br from-optio-purple to-optio-pink rounded-2xl flex items-center justify-center text-white">
              {icon}
            </div>
          )}
        </div>
        <p className="text-lg text-gray-600 leading-relaxed">
          {description}
        </p>
        {children}
      </div>

      {/* Desktop layout: image and content side by side */}
      <div className={`hidden md:flex ${reversed ? 'flex-row-reverse' : 'flex-row'} items-center gap-12`}>
        <div className="flex-shrink-0">
          {image ? (
            <img
              src={image}
              alt={imageAlt || ''}
              className="w-96 h-56 object-cover rounded-2xl shadow-lg"
            />
          ) : (
            <div className="w-24 h-24 bg-gradient-to-br from-optio-purple to-optio-pink rounded-2xl flex items-center justify-center text-white">
              {icon}
            </div>
          )}
        </div>
        <div className="flex-1 text-left">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            {title}
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed">
            {description}
          </p>
          {children}
        </div>
      </div>
    </div>
  </section>
)

const HowItWorksPage = () => {
  return (
    <>
      <Helmet>
        <title>How It Works | Optio Education</title>
        <meta name="description" content="Learn how Optio's unique approach to education works. Self-directed quests, XP-based progress, and portfolio assessment help students learn by doing real projects." />
        <meta property="og:title" content="How It Works | Optio Education" />
        <meta property="og:description" content="A different kind of learning. Self-directed projects, mastery-based progression, and real-world skills." />
        <meta property="og:url" content="https://www.optioeducation.com/how-it-works" />
        <link rel="canonical" href="https://www.optioeducation.com/how-it-works" />
      </Helmet>

      <div className="min-h-screen bg-white -mt-12 sm:mt-0">
        {/* Hero Section */}
        <div className="relative overflow-hidden bg-gradient-to-br from-optio-purple to-optio-pink text-white">
          <div className="absolute inset-0 bg-black/10" />
          <div className="relative max-w-4xl mx-auto px-4 py-16 sm:py-24 text-center">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6">
              A Different Kind of Learning
            </h1>
            <p className="text-xl sm:text-2xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              Optio transforms education through self-directed projects, mastery-based progression,
              and real-world skills that matter.
            </p>
          </div>
        </div>

        {/* Quest-Based Learning */}
        <Section
          image="https://images.pexels.com/photos/8083390/pexels-photo-8083390.jpeg?auto=compress&cs=tinysrgb&w=600"
          imageAlt="Children exploring outdoors"
          title="Quest-Based Learning"
          description="Students embark on self-directed projects called Quests. Instead of passive lectures, learners choose their path, work at their own pace, and tackle real challenges that interest them. Each Quest is a meaningful project with tangible outcomes - not busy work."
        />

        {/* XP Instead of Grades */}
        <Section
          image="https://images.pexels.com/photos/8363785/pexels-photo-8363785.jpeg?auto=compress&cs=tinysrgb&w=600"
          imageAlt="Child giving thumbs up"
          title="XP Instead of Grades"
          description="Progress is measured by mastery, not by letter grades. Every completed task earns XP (experience points) that accumulates toward skill pillars. There's no failure - just progress. Students see their growth in real-time and stay motivated by tangible achievement."
          reversed
        >
          <div className="mt-6 flex flex-wrap gap-3 justify-center md:justify-start">
            <span className="px-4 py-2 bg-pillar-stem-light text-pillar-stem rounded-full text-sm font-medium">
              STEM
            </span>
            <span className="px-4 py-2 bg-pillar-art-light text-pillar-art rounded-full text-sm font-medium">
              Art
            </span>
            <span className="px-4 py-2 bg-pillar-communication-light text-pillar-communication rounded-full text-sm font-medium">
              Communication
            </span>
            <span className="px-4 py-2 bg-pillar-wellness-light text-pillar-wellness rounded-full text-sm font-medium">
              Wellness
            </span>
            <span className="px-4 py-2 bg-pillar-civics-light text-pillar-civics rounded-full text-sm font-medium">
              Civics
            </span>
          </div>
        </Section>

        {/* Learn by Doing */}
        <Section
          image="https://images.pexels.com/photos/19364666/pexels-photo-19364666.jpeg?auto=compress&cs=tinysrgb&w=600"
          imageAlt="Children playing and learning together"
          title="Learn by Doing"
          description="We believe in just-in-time teaching: just enough instruction to start, then real-world practice. Students encounter knowledge gaps while doing actual work - creating intrinsic motivation to learn more. Skills develop through practice, not screen consumption."
        >
          <div className="mt-6 p-4 bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-lg border border-optio-purple/20">
            <p className="text-gray-700 italic">
              "Tell me and I forget. Teach me and I remember. Involve me and I learn."
              <span className="block mt-1 text-sm text-gray-500">- Benjamin Franklin</span>
            </p>
          </div>
        </Section>

        {/* Parent & Observer Tools */}
        <Section
          image="https://images.pexels.com/photos/6212715/pexels-photo-6212715.jpeg?auto=compress&cs=tinysrgb&w=600"
          imageAlt="Parent working alongside children"
          title="Parent & Observer Tools"
          description="Stay connected without micromanaging. Parents and observers can track progress in real-time, view completed work, and add encouraging feedback. See what your child is learning, celebrate their achievements, and support their journey - all from a dedicated dashboard."
          reversed
        >
          <ul className="mt-6 space-y-2 text-left">
            <li className="flex items-center gap-2 text-gray-700">
              <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Real-time progress tracking
            </li>
            <li className="flex items-center gap-2 text-gray-700">
              <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              View and comment on student work
            </li>
            <li className="flex items-center gap-2 text-gray-700">
              <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Weekly progress summaries
            </li>
          </ul>
        </Section>

        {/* Portfolio for Life */}
        <Section
          image="https://images.pexels.com/photos/7605891/pexels-photo-7605891.jpeg?auto=compress&cs=tinysrgb&w=600"
          imageAlt="Mother and son with school project"
          title="Portfolio for Life"
          description="All work is saved and showcased in a shareable portfolio diploma. Students build a living record of their learning - complete with evidence, reflections, and achievements. This portfolio demonstrates real skills to colleges, employers, and anyone who matters."
        >
          <div className="mt-6">
            <Link
              to="/public/diploma/demo"
              className="inline-flex items-center gap-2 text-optio-purple hover:text-optio-pink font-medium transition-colors"
            >
              See an example portfolio
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          </div>
        </Section>

        {/* CTA Section */}
        <section className="py-20 px-4 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to Start Learning?
            </h2>
            <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
              Explore our course catalog and find a project that sparks your curiosity.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/catalog">
                <Button className="w-full sm:w-auto px-8 py-3 text-lg">
                  Browse Courses
                </Button>
              </Link>
              <Link to="/register">
                <Button variant="secondary" className="w-full sm:w-auto px-8 py-3 text-lg bg-white/10 hover:bg-white/20 text-white border-white/20">
                  Create Account
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}

export default HowItWorksPage
