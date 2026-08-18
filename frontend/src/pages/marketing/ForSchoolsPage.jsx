import React from 'react'
import { Helmet } from 'react-helmet-async'
import MarketingLayout from '../../components/marketing/MarketingLayout'
import { RevealSection, RevealItem } from '../../components/marketing/RevealSection'
import { useSectionView, useCtaTracker } from '../../components/marketing/useMarketingAnalytics'
import InlineContactForm from '../../components/marketing/InlineContactForm'
import WascBadge from '../../components/accreditation/WascBadge'
import BlockIcon from '../../components/marketing/BlockIcons'
import {
  ModuleToggleMockup,
  StudentQuestMockup,
  StaffDashboardMockup,
  FamilyMockup,
  TranscriptMockup,
} from '../../components/marketing/SchoolMockups'

const PAGE = 'for_schools'

const IMAGES = {
  hero: 'https://images.pexels.com/photos/5621957/pexels-photo-5621957.jpeg?auto=compress&cs=tinysrgb&w=1920',
  engagement: 'https://images.pexels.com/photos/8423048/pexels-photo-8423048.jpeg?auto=compress&cs=tinysrgb&w=800',
  management: 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=800',
  parent: 'https://images.pexels.com/photos/7799601/pexels-photo-7799601.jpeg?auto=compress&cs=tinysrgb&w=800',
}

const CheckIcon = () => (
  <svg className="w-5 h-5 text-optio-purple flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const icons = {
  learning: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  credentials: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  ai: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  ),
  people: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  operations: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  community: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
}

const BLOCK_CATEGORIES = [
  {
    key: 'learning',
    name: 'Learning',
    tagline: 'The student experience: what they do every day.',
    blocks: [
      { name: 'Quests', icon: 'compass', desc: 'Interest-driven learning adventures students choose, or you assign to a class.' },
      { name: 'Courses & Lessons', icon: 'book', desc: 'Structure quests into sequenced courses with just-in-time lesson steps.' },
      { name: 'Course Builder', icon: 'layers', desc: 'Author your own curriculum, or adapt ours, with a full editing suite.' },
      { name: 'XP & Five Pillars', icon: 'chart', desc: 'Progress across STEM, Wellness, Communication, Civics, and Art instead of letter grades.' },
      { name: 'Learning Journal', icon: 'notebook', desc: 'Students capture learning moments anywhere and group them into interest tracks.' },
      { name: 'Portfolios', icon: 'image', desc: 'Evidence gathers itself into a learning story as students complete work.' },
      { name: 'Bounty Board', icon: 'target', desc: 'Post real challenges students claim for XP. Rename it to fit your program.' },
      { name: 'Mobile App', icon: 'phone', desc: 'iOS and Android for students, parents, and observers, with camera capture.' },
    ],
  },
  {
    key: 'credentials',
    name: 'Credentials',
    tagline: 'Turn a portfolio into something a registrar accepts.',
    blocks: [
      { name: 'Accredited Transcripts', icon: 'shield', desc: 'Issue WASC-accredited transcripts under Optio Academy, even if your school is not accredited.' },
      { name: 'Credit Tracking', icon: 'chart', desc: 'Learning converts to high school credit across eleven subject areas, tracked live.' },
      { name: 'Transfer Credits', icon: 'exchange', desc: 'Bring in credit from a previous school so the transcript tells the whole story.' },
      { name: 'Prior Learning', icon: 'hourglass', desc: 'Families file evidence of learning done before or outside your program for credit review.' },
      { name: 'Credit Review', icon: 'clipboard', desc: 'A review queue where staff approve earned credit, or send work back with feedback.' },
      { name: 'Evidence Reports', icon: 'docText', desc: 'Shareable, link-based reports students build from their own work.' },
    ],
  },
  {
    key: 'ai',
    name: 'AI Tools',
    tagline: 'Every one of these has an off switch, per program and per child.',
    blocks: [
      { name: 'AI Tutor', icon: 'chat', desc: 'A contextual assistant that knows the quest a student is working on.' },
      { name: 'Lesson Helper', icon: 'bulb', desc: 'In-lesson hints, simpler explanations, and examples drawn from the lesson itself.' },
      { name: 'Course Generator', icon: 'sparkles', desc: 'Describe a topic, refine the outline in plain language, publish a full course.' },
      { name: 'Curriculum Upload', icon: 'upload', desc: 'Upload the curriculum you already have and get it back as Optio courses.' },
      { name: 'Task Suggestions', icon: 'checklist', desc: 'Personalized task ideas built around what a particular student cares about.' },
      { name: 'Schedule Assistant', icon: 'calGrid', desc: 'Draft a master schedule in plain English. Staff approve before anything is saved.' },
    ],
  },
  {
    key: 'people',
    name: 'People & Enrollment',
    tagline: 'Getting families in the door and onto a schedule.',
    blocks: [
      { name: 'Roster & Households', icon: 'users', desc: 'Students, staff, and families grouped the way your office actually thinks about them.' },
      { name: 'Student Records', icon: 'idcard', desc: 'Profile facts, assessments, emergency contacts, and materials checklists in one record.' },
      { name: 'Registration Builder', icon: 'form', desc: 'Build your own enrollment funnel: questions, paperwork, e-signatures, and fees.' },
      { name: 'Five Ways to Add People', icon: 'userPlus', desc: 'Standing signup links, email invites, no-email student usernames, CSV, or we import your roster.' },
      { name: 'Waitlists & Age Gates', icon: 'hourglass', desc: 'Ordered queues with timed offers, plus age bands you release when you are ready.' },
      { name: 'Schedule Builder', icon: 'calendar', desc: 'Families pick classes on a weekly calendar, with conflicts caught as they go.' },
      { name: 'Learning Plans', icon: 'map', desc: 'Sit with a family, build the year together, and hand them the screen in presentation mode.' },
      { name: 'Catalog Widgets', icon: 'code', desc: 'Drop your live class catalog and schedule onto your own website. No student data exposed.' },
    ],
  },
  {
    key: 'operations',
    name: 'School Operations',
    tagline: 'The front office, the classroom, and the money.',
    blocks: [
      { name: 'Classes & Scheduling', icon: 'grid', desc: 'Sections, rooms, time blocks, capacity, prerequisites, and conflict detection.' },
      { name: 'Attendance', icon: 'checkSquare', desc: 'Mark only the exceptions. Automatic nudges when roll has not been taken.' },
      { name: 'Accountability Board', icon: 'bell', desc: 'Every unexplained absence surfaces until a person resolves it.' },
      { name: 'Submissions Inbox', icon: 'inbox', desc: 'One queue of everything students just turned in, with review and advance.' },
      { name: 'Teacher Dashboards', icon: 'layout', desc: 'Today, in one screen: classes, attendance, tasks, and students who need attention.' },
      { name: 'Advisor Check-Ins', icon: 'speech', desc: 'Structured one-on-one records of growth, obstacles, and student voice.' },
      { name: 'Tuition & Invoicing', icon: 'money', desc: 'Discounts, payment plans, invoices, and reminders. Cards run on your Stripe account.' },
      { name: 'Timesheets', icon: 'clock', desc: 'Staff clock in and out, admins approve the period, payroll exports as CSV.' },
      { name: 'Forms & Requests', icon: 'docText', desc: 'Incidents, maintenance, substitutes, reimbursements, and family requests in one queue.' },
      { name: 'Onboarding Checklists', icon: 'checklist', desc: 'Role-specific packets with uploads, approvals, and signatures done in place.' },
      { name: 'Secure Documents', icon: 'lock', desc: 'Contracts, background checks, and custody files behind an HR-only wall.' },
      { name: 'Kiosk Check-In', icon: 'tablet', desc: 'A shared classroom tablet where students tap their name and photograph their work.' },
    ],
  },
  {
    key: 'community',
    name: 'Community & Communication',
    tagline: 'Keeping families close without another app to install.',
    blocks: [
      { name: 'Announcements', icon: 'megaphone', desc: 'One message to families, students, or staff by in-app alert, email, and push.' },
      { name: 'School Calendar', icon: 'calendar', desc: 'Events with categories and a subscribable feed for Google, Outlook, and Apple.' },
      { name: 'Community Hub', icon: 'bulletin', desc: 'A noticeboard, lost and found, and shout-outs your whole school can post to.' },
      { name: 'Family Directory', icon: 'addressBook', desc: 'Opt-in contact sharing with carpool matching by neighborhood.' },
      { name: 'Messaging', icon: 'envelope', desc: 'Direct and group conversations between staff, students, and families.' },
      { name: 'Staff & Family Training', icon: 'cap', desc: 'Your onboarding and PD delivered as quests, with completion tracked.' },
      { name: 'Reports & Exports', icon: 'chartDoc', desc: 'Medications, allergies, attendance, enrollment, revenue, and any custom question you asked.' },
      { name: 'Observer Access', icon: 'eye', desc: 'Grandparents and mentors follow along and cheer, with every view audited.' },
    ],
  },
]

const COMPOSITIONS = [
  {
    title: 'The Hybrid Microschool',
    setup: 'Two days on campus, three days at home, forty families.',
    on: ['Registration Builder', 'Schedule Builder', 'Attendance', 'Tuition & Invoicing', 'Quests', 'Family Directory'],
    off: ['Timesheets', 'Secure Documents'],
    note: 'Four staff, all of them family. Nobody needs a payroll screen.',
  },
  {
    title: 'The Homeschool Co-op',
    setup: 'Parent-taught classes, volunteer coordinators, no tuition billing.',
    on: ['Classes & Scheduling', 'Community Hub', 'School Calendar', 'Forms & Requests', 'Learning Journal', 'Portfolios'],
    off: ['Tuition & Invoicing', 'Timesheets'],
    note: 'Money never enters the picture, so no one ever sees a money screen.',
  },
  {
    title: 'The Online Program',
    setup: 'Students in nine states, advisors meeting them by video.',
    on: ['Courses & Lessons', 'AI Tutor', 'Advisor Check-Ins', 'Credit Tracking', 'Accredited Transcripts', 'Observer Access'],
    off: ['Attendance', 'Kiosk Check-In'],
    note: 'No rooms to take roll in. Their building is the internet.',
  },
]

const TRUST = [
  {
    title: 'Consent Before Public',
    desc: 'A minor cannot make a portfolio or report public until a parent approves it.',
  },
  {
    title: 'Audited Observer Access',
    desc: 'Every observer view is logged, and admins can read that log.',
  },
  {
    title: 'Private By Default',
    desc: 'Student evidence lives in private storage. Work marked confidential stays out of every feed.',
  },
  {
    title: 'No Student Directory',
    desc: 'Students connect by exchanging a code in person. Nobody can look a child up by name.',
  },
]

const ForSchoolsPage = () => {
  const trackCta = useCtaTracker(PAGE)

  const heroRef = useSectionView('hero', PAGE)
  const whoRef = useSectionView('who_its_for', PAGE)
  const blocksRef = useSectionView('building_blocks', PAGE)
  const compositionsRef = useSectionView('compositions', PAGE)
  const outcomesRef = useSectionView('outcomes', PAGE)
  const featuresRef = useSectionView('features', PAGE)
  const trustRef = useSectionView('trust', PAGE)
  const howRef = useSectionView('how_it_works', PAGE)
  const pricingRef = useSectionView('pricing', PAGE)

  return (
    <MarketingLayout>
      <Helmet>
        <title>For Schools & Organizations | Optio</title>
        <meta name="description" content="Optio is a set of building blocks for schools. Quests, portfolios, accredited transcripts, enrollment, attendance, tuition, and family communication. Turn on what fits your program." />
        <meta property="og:title" content="For Schools & Organizations | Optio" />
        <meta property="og:description" content="Build your own version of Optio. Student-directed learning plus the enrollment, scheduling, attendance, billing, and family tools it takes to run a program." />
        <meta property="og:url" content="https://www.optioeducation.com/for-schools" />
        <link rel="canonical" href="https://www.optioeducation.com/for-schools" />
      </Helmet>

      {/* ========== HERO ========== */}
      <section ref={heroRef} className="relative overflow-hidden min-h-[55vh] flex items-end">
        <div className="absolute inset-0">
          <img src={IMAGES.hero} alt="" className="w-full h-full object-cover" style={{ objectPosition: 'center 40%' }} />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900/95 via-gray-900/60 via-50% to-transparent" />
        </div>
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 sm:pb-16 pt-32 sm:pt-40 text-center text-white">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4 leading-tight drop-shadow-lg" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
            One Platform. Built Your Way.
          </h1>
          <p className="text-lg sm:text-xl text-white/90 max-w-2xl mx-auto leading-relaxed mb-8 drop-shadow-md font-medium" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
            Optio is student-directed learning plus everything it takes to run the program around it. Every piece is a building block. You decide which ones you use.
          </p>
          <a
            href="#get-info"
            onClick={() => trackCta('hero_get_info')}
            className="btn-inverse btn-lg"
          >
            Get More Info
          </a>
        </div>
      </section>

      {/* ========== WHO IT'S FOR ========== */}
      <section ref={whoRef} className="py-16 sm:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                Built For Every Kind of School
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto font-medium">
                No two programs are assembled the same way. A five-student microschool and a 500-student online program use completely different pieces of Optio, and both are using it correctly.
              </p>
            </div>
          </RevealSection>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { type: 'Microschools', desc: 'Enrollment, attendance, tuition, and portfolios for a small campus that runs on very few adults', icon: '5-30 students' },
              { type: 'Online Schools', desc: 'Courses, advisor check-ins, and accredited transcripts for learners you never see in a hallway', icon: '10-500+ students' },
              { type: 'Learning Centers', desc: 'Class catalogs, waitlists, and family communication for co-ops, tutoring, and after-school programs', icon: '10-200 students' },
              { type: 'Traditional Schools', desc: 'Add interest-driven learning and portfolio evidence alongside the system you already run', icon: '50-500+ students' },
            ].map((item, i) => (
              <RevealItem key={item.type} index={i}>
                <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 h-full">
                  <p className="text-xs font-semibold text-optio-purple uppercase tracking-wider mb-2">{item.icon}</p>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">{item.type}</h3>
                  <p className="text-sm text-gray-500 font-medium">{item.desc}</p>
                </div>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ========== BUILDING BLOCKS ========== */}
      <section ref={blocksRef} className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-12 items-center mb-14">
            <RevealSection>
              <p className="text-sm font-semibold text-optio-purple uppercase tracking-wider mb-3">The Building Blocks</p>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                Take What You Need. Leave the Rest.
              </h2>
              <p className="text-lg text-gray-600 font-medium leading-relaxed">
                Most school software makes you adopt the whole thing and work the way it works. Optio is a kit. Every block below can be switched on or off for your program, and the ones you turn off disappear completely, so your staff never navigate past a module you do not use.
              </p>
            </RevealSection>
            <RevealSection delay={200}>
              <div className="max-w-sm mx-auto lg:ml-auto lg:mr-0 w-full">
                <ModuleToggleMockup />
              </div>
            </RevealSection>
          </div>

          <div className="space-y-12">
            {BLOCK_CATEGORIES.map((category) => (
              <RevealSection key={category.key}>
                <div>
                  <div className="flex items-start gap-4 mb-5">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 text-optio-purple flex-shrink-0">
                      {icons[category.key]}
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-gray-900">{category.name}</h3>
                      <p className="text-gray-500 font-medium">{category.tagline}</p>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {category.blocks.map((block) => (
                      <div
                        key={block.name}
                        className="bg-white rounded-lg p-4 border border-gray-200 border-l-4 border-l-optio-purple/40 h-full flex gap-3"
                      >
                        <span className="text-optio-purple flex-shrink-0 mt-0.5">
                          <BlockIcon name={block.icon} />
                        </span>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-gray-900 mb-1">{block.name}</h4>
                          <p className="text-sm text-gray-500 font-medium leading-relaxed">{block.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {category.key === 'credentials' && (
                    <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6 sm:p-8">
                      <div className="grid md:grid-cols-2 gap-8 items-center">
                        <div>
                          <h4 className="text-xl font-bold text-gray-900 mb-2">
                            Offer Your Students Accredited Diplomas
                          </h4>
                          <p className="text-gray-600 font-medium leading-relaxed mb-6">
                            Optio Academy is accredited by the Western Association of Schools and Colleges. Partner programs can issue transcripts and diplomas under that accreditation, which means an unaccredited microschool can hand a family a credential a college registrar recognizes.
                          </p>
                          <div className="max-w-sm">
                            <WascBadge variant="card" />
                          </div>
                        </div>
                        <div className="max-w-xs w-full mx-auto">
                          <TranscriptMockup />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* ========== COMPOSITIONS ========== */}
      <section ref={compositionsRef} className="py-16 sm:py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-12 max-w-3xl mx-auto">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                Assembled Around Your Model
              </h2>
              <p className="text-lg text-gray-600 font-medium">
                Three real shapes a program can take. None of them is more correct than the others.
              </p>
            </div>
          </RevealSection>

          <div className="grid lg:grid-cols-3 gap-6">
            {COMPOSITIONS.map((composition, i) => (
              <RevealItem key={composition.title} index={i}>
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 h-full flex flex-col">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">{composition.title}</h3>
                  <p className="text-sm text-gray-500 font-medium mb-5">{composition.setup}</p>

                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Switched on</p>
                  <div className="flex flex-wrap gap-2 mb-5">
                    {composition.on.map((block) => (
                      <span
                        key={block}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-white border border-optio-purple/20 text-optio-purple"
                      >
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {block}
                      </span>
                    ))}
                  </div>

                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Switched off</p>
                  <div className="flex flex-wrap gap-2 mb-5">
                    {composition.off.map((block) => (
                      <span
                        key={block}
                        className="inline-block text-xs font-semibold px-3 py-1.5 rounded-full border border-dashed border-gray-300 text-gray-400"
                      >
                        {block}
                      </span>
                    ))}
                  </div>

                  <p className="text-sm text-gray-600 font-medium leading-relaxed mt-auto pt-4 border-t border-gray-200">
                    {composition.note}
                  </p>
                </div>
              </RevealItem>
            ))}
          </div>

          <RevealSection>
            <p className="text-center text-gray-500 font-medium mt-10 max-w-2xl mx-auto">
              Programs that need to go further than configuration can get a custom surface inside Optio, built for the way they teach. Several partner schools already run one.
            </p>
          </RevealSection>
        </div>
      </section>

      {/* ========== THE OPTIO PHILOSOPHY ========== */}
      <section className="py-16 sm:py-20 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-14">
              <p className="text-sm font-semibold text-optio-pink uppercase tracking-wider mb-3">The Optio Philosophy</p>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                The Process Is The Goal
              </h2>
              <p className="text-xl text-white/70 max-w-3xl mx-auto leading-relaxed font-medium">
                Learning is not about reaching a destination or impressing others. It's about who students become through the journey of discovery, creation, and growth.
              </p>
            </div>
          </RevealSection>

          <div className="grid sm:grid-cols-3 gap-6 mb-12">
            {[
              {
                title: 'Choice',
                subtitle: 'Autonomy',
                desc: 'Students make meaningful decisions about their learning. They choose which quests to pursue, how to demonstrate understanding, and what evidence to share. We never dictate a single path.',
              },
              {
                title: 'Competence',
                subtitle: 'Growth',
                desc: 'Challenges meet students where they are. Tasks stretch them just enough to feel accomplishment without overwhelming them. Progress is based on mastery, not compliance.',
              },
              {
                title: 'Connection',
                subtitle: 'Relatedness',
                desc: 'Learning feels relevant to who students are and who they are becoming. They see themselves in the content. Family and mentors participate. Education becomes a shared experience.',
              },
            ].map((item, i) => (
              <RevealItem key={item.title} index={i}>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/10 h-full">
                  <p className="text-xs font-semibold text-optio-pink uppercase tracking-wider mb-1">{item.subtitle}</p>
                  <h3 className="text-xl font-bold text-white mb-3">{item.title}</h3>
                  <p className="text-sm text-white/70 leading-relaxed font-medium">{item.desc}</p>
                </div>
              </RevealItem>
            ))}
          </div>

          <RevealSection>
            <div className="max-w-3xl mx-auto text-center">
              <p className="text-white/60 text-sm leading-relaxed mb-6 font-medium">
                These three pillars come from Self-Determination Theory, decades of research showing that intrinsic motivation flourishes when students have autonomy, feel competent, and connect personally with their learning. When all three align, motivation becomes self-sustaining.
              </p>
              <div className="grid sm:grid-cols-2 gap-4 text-left max-w-lg mx-auto mb-8">
                <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <p className="text-xs text-white/40 mb-1">Traditional approach</p>
                  <p className="text-sm text-white/50 line-through font-medium">"This will help you in the future"</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4 border border-optio-pink/30">
                  <p className="text-xs text-optio-pink mb-1">Optio approach</p>
                  <p className="text-sm text-white font-medium">"This is helping you grow right now"</p>
                </div>
              </div>
              <p className="text-lg text-white/80 font-medium italic">
                The diploma is not the goal. It's the beautiful byproduct of a meaningful learning journey.
              </p>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ========== STUDENT OUTCOMES ========== */}
      <section ref={outcomesRef} className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                Why Student-Directed Learning Works
              </h2>
              <p className="text-lg text-gray-600 max-w-3xl mx-auto font-medium">
                When students have agency over what and how they learn, the results speak for themselves.
              </p>
            </div>
          </RevealSection>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                title: 'Stronger Academics',
                desc: 'Students who learn through their interests develop deeper understanding and retain more. They write better, think more critically, and connect ideas across subjects because the learning matters to them.',
                img: 'https://images.pexels.com/photos/5428012/pexels-photo-5428012.jpeg?auto=compress&cs=tinysrgb&w=400',
              },
              {
                title: 'Better Mental Health',
                desc: 'Removing the pressure of grades, compliance, and one-size-fits-all pacing reduces anxiety and burnout. Students feel capable and in control of their own growth.',
                img: 'https://images.pexels.com/photos/5622142/pexels-photo-5622142.jpeg?auto=compress&cs=tinysrgb&w=400',
              },
              {
                title: 'Real-World Skills',
                desc: 'Quest-based learning builds skills that transfer beyond school: project management, self-discipline, communication, and creative problem-solving through work students actually care about.',
                img: 'https://images.pexels.com/photos/8033875/pexels-photo-8033875.jpeg?auto=compress&cs=tinysrgb&w=400',
              },
            ].map((item, i) => (
              <RevealItem key={item.title} index={i}>
                <div className="bg-white rounded-xl overflow-hidden border border-gray-100 shadow-sm h-full">
                  <div className="aspect-[16/9] overflow-hidden">
                    <img src={item.img} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <div className="p-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-2">{item.title}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed font-medium">{item.desc}</p>
                  </div>
                </div>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ========== THREE SURFACES ========== */}
      <section ref={featuresRef} className="py-16 sm:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-14 max-w-3xl mx-auto">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                Three Places Optio Shows Up
              </h2>
              <p className="text-lg text-gray-600 font-medium">
                One login, one set of records, three very different experiences depending on who you are.
              </p>
            </div>
          </RevealSection>

          {/* Surface 1: The learning platform */}
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-16 sm:mb-20">
            <RevealSection>
              <div className="relative">
                <img src={IMAGES.engagement} alt="Student showing creative work" className="rounded-2xl shadow-xl w-full aspect-[4/3] object-cover" loading="lazy" />
                <div className="relative -mt-16 mx-3 sm:mx-6">
                  <StudentQuestMockup />
                </div>
              </div>
            </RevealSection>
            <RevealSection delay={200}>
              <p className="text-sm font-semibold text-optio-purple uppercase tracking-wider mb-2">For Students</p>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
                The Learning Platform
              </h3>
              <p className="text-gray-600 mb-6 font-medium">
                Students learn through quests built around their real interests. A music lover studies theory through their piano practice. A gamer learns programming by building a game. The work they do becomes the portfolio, without anyone assembling it afterward.
              </p>
              <div className="space-y-3">
                {[
                  'Choose from our library, your curriculum, or a quest they design themselves',
                  'XP across five learning pillars instead of letter grades',
                  'An AI tutor that knows the task in front of them, if you want it on',
                  'Capture learning from anywhere with the mobile app',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckIcon />
                    <p className="text-gray-700 font-medium">{item}</p>
                  </div>
                ))}
              </div>
            </RevealSection>
          </div>

          {/* Surface 2: The front office */}
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-16 sm:mb-20">
            <RevealSection delay={200} className="order-2 lg:order-1">
              <p className="text-sm font-semibold text-optio-purple uppercase tracking-wider mb-2">For Staff</p>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
                The Front Office
              </h3>
              <p className="text-gray-600 mb-6 font-medium">
                A full school information system sits behind the learning platform. Enrollment, scheduling, attendance, tuition, staff onboarding, and reporting all run on the same records, so a student enrolled at the front desk is in their teacher's roster immediately.
              </p>
              <div className="space-y-3">
                {[
                  'A dashboard that shows only what needs attention today',
                  'Roll call that defaults everyone present, so teachers mark exceptions',
                  'Invoices, payment plans, and reminders, with cards on your own Stripe account',
                  'Role tiers that keep tuition and payroll away from staff who should not see them',
                  'No numeric gradebook. Progress is tracked automatically from real work',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckIcon />
                    <p className="text-gray-700 font-medium">{item}</p>
                  </div>
                ))}
              </div>
            </RevealSection>
            <RevealSection className="order-1 lg:order-2">
              <div className="relative">
                <img src={IMAGES.management} alt="School staff working together" className="rounded-2xl shadow-xl w-full aspect-[4/3] object-cover" loading="lazy" />
                <div className="relative -mt-16 mx-3 sm:mx-6">
                  <StaffDashboardMockup />
                </div>
              </div>
            </RevealSection>
          </div>

          {/* Surface 3: The family experience */}
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <RevealSection>
              <div className="relative">
                <img src={IMAGES.parent} alt="Family learning together" className="rounded-2xl shadow-xl w-full aspect-[4/3] object-cover" loading="lazy" />
                <div className="relative -mt-16 mx-3 sm:mx-6">
                  <FamilyMockup />
                </div>
              </div>
            </RevealSection>
            <RevealSection delay={200}>
              <p className="text-sm font-semibold text-optio-purple uppercase tracking-wider mb-2">For Families</p>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
                The Family Experience
              </h3>
              <p className="text-gray-600 mb-6 font-medium">
                Every family gets a parent dashboard with an activity feed of their student's learning, plus one page holding everything your school sends them. Extended family can follow along as Observers and post Bounties that turn encouragement into real learning.
              </p>
              <div className="space-y-3">
                {[
                  'Parent dashboard for every family, no extra setup',
                  'Calendar, resources, forms, absences, and billing in one school page',
                  'Observer access for grandparents and mentors, fully audited',
                  'Parents approve before anything a minor made goes public',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckIcon />
                    <p className="text-gray-700 font-medium">{item}</p>
                  </div>
                ))}
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ========== TRUST ========== */}
      <section ref={trustRef} className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-12 max-w-2xl mx-auto">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                Built To Be Trusted With Children
              </h2>
              <p className="text-lg text-gray-600 font-medium">
                Student privacy is enforced by the platform, not by a policy document asking people to be careful.
              </p>
            </div>
          </RevealSection>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TRUST.map((item, i) => (
              <RevealItem key={item.title} index={i}>
                <div className="bg-white rounded-xl p-5 border border-gray-200 h-full">
                  <h3 className="text-base font-bold text-gray-900 mb-2">{item.title}</h3>
                  <p className="text-sm text-gray-500 font-medium leading-relaxed">{item.desc}</p>
                </div>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ========== GETTING STARTED ========== */}
      <section ref={howRef} className="py-16 sm:py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <RevealSection>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Getting Started Is Simple
            </h2>
            <p className="text-lg text-gray-600 mb-12 font-medium">
              We set up the blocks with you, so you are not staring at a settings page alone.
            </p>
          </RevealSection>
          <div className="grid sm:grid-cols-4 gap-6">
            {[
              { img: 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=400', title: 'Create Your Org', desc: 'Your name, your logo, your own login page' },
              { img: 'https://images.pexels.com/photos/7692559/pexels-photo-7692559.jpeg?auto=compress&cs=tinysrgb&w=400', title: 'Pick Your Blocks', desc: 'Turn on what fits your program, hide the rest' },
              { img: 'https://images.pexels.com/photos/8613089/pexels-photo-8613089.jpeg?auto=compress&cs=tinysrgb&w=400', title: 'Bring In Your People', desc: 'Send us your roster, or open registration' },
              { img: 'https://images.pexels.com/photos/4145354/pexels-photo-4145354.jpeg?auto=compress&cs=tinysrgb&w=400', title: 'Launch', desc: 'Assign quests and watch the work come in' },
            ].map((item, i) => (
              <RevealItem key={item.title} index={i}>
                <div className="text-center">
                  <div className="aspect-square overflow-hidden rounded-xl mb-3 bg-gray-100">
                    <img src={item.img} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-1">{item.title}</h3>
                  <p className="text-sm text-gray-600 font-medium">{item.desc}</p>
                </div>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ========== PRICING TEASER ========== */}
      <section ref={pricingRef} className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="bg-white rounded-2xl p-8 sm:p-10 border border-gray-200 shadow-sm text-center">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
                Pricing That Scales With You
              </h2>
              <p className="text-gray-600 mb-6 max-w-xl mx-auto font-medium">
                The platform is free to use for tracking and portfolios. Credential services are priced per student based on your program size. Tell us how you run your program and we will quote the blocks you actually need.
              </p>
              <a
                href="#get-info"
                onClick={() => trackCta('pricing_get_info')}
                className="btn-primary btn-lg"
              >
                Get a Custom Quote
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </a>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ========== INLINE CONTACT FORM ========== */}
      <InlineContactForm
        source="sales"
        heading="Tell Us About Your Program"
        subheading="Drop your info and we'll reach out to talk through which blocks fit the way you run things."
        choicesLabel="What kind of program do you run?"
        choices={['Microschool', 'Online school', 'Learning center or co-op', 'Traditional school', 'Still figuring it out']}
        placeholder="How many students? How does your week actually run? What are you using today?"
      />

    </MarketingLayout>
  )
}

export default ForSchoolsPage
