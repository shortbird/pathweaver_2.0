import React from 'react'
import { Link } from 'react-router-dom'
import {
  UserGroupIcon, ChevronRightIcon, ClipboardDocumentListIcon,
  DocumentTextIcon, CreditCardIcon, BuildingLibraryIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import { useActingAs } from '../../contexts/ActingAsContext'
import { useOrganization } from '../../contexts/OrganizationContext'
import { PageLoader } from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import MyEnrolledQuests from '../../components/home/MyEnrolledQuests'
import { htmlToText } from '../../utils/richText'
import { inOptioAcademy } from '../../config/optioAcademy'
import { cardsFor } from '../SchoolPage'
import {
  useFamilyChildren, useChildActivity, useFamilyAttention, useSchoolSection, weekXpFrom,
} from './FamilyHomeData'

/**
 * Family Home — the parent role's landing (rendered by RoleHome at /dashboard).
 *
 * The question it answers: "how are my kids, and what do I owe the school."
 * Shared home skeleton: greeting → needs-attention → child cards → school
 * digest. Everything here is a digest over existing endpoints (see
 * FamilyHomeData.js) that deep-links into the pages that own each concern:
 * /parent/dashboard remains the full management surface (settings, evidence,
 * acting-as wiring, adding children), /family/* the school paperwork, /school
 * the school's own page.
 *
 * For orgs that had the school-homepage opt-in (school.homepage — their old
 * landing page was /school), the school section renders ABOVE the child cards,
 * directly under the needs-attention strip; for everyone else it closes the
 * page as ambient content.
 */

const ATTENTION_ICONS = {
  checklist: ClipboardDocumentListIcon,
  forms: DocumentTextIcon,
  billing: CreditCardIcon,
}

/** The strip above everything else — only when something actually needs doing. */
function AttentionStrip({ items }) {
  if (!items.length) return null
  return (
    <section aria-label="Needs your attention" className="mt-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-2">Needs your attention</h2>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
        {items.map((item) => {
          const Icon = ATTENTION_ICONS[item.kind] || DocumentTextIcon
          return (
            <Link
              key={item.id}
              to={item.to}
              className="group flex items-center gap-3 px-4 py-3 hover:bg-optio-purple/5 transition-colors first:rounded-t-xl last:rounded-b-xl"
            >
              <span className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-amber-600" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-900 group-hover:text-optio-purple truncate">
                  {item.label}
                </span>
                <span className="block text-xs text-gray-500 truncate">{item.detail}</span>
              </span>
              <ChevronRightIcon className="w-4 h-4 text-gray-400 group-hover:text-optio-purple flex-shrink-0" />
            </Link>
          )
        })}
      </div>
    </section>
  )
}

/**
 * The compact recent-activity line on a child card, from the same 30-day
 * completions feed the parent evidence view reads. Loading and errors render
 * nothing — the card stands on its own.
 */
function ChildActivityLine({ studentId }) {
  const { data: completions } = useChildActivity(studentId)
  if (!completions) return null
  const weekXp = weekXpFrom(completions)
  if (weekXp > 0) {
    return <p className="text-xs text-gray-500 truncate">{weekXp} XP earned this week</p>
  }
  const last = completions[0]
  if (last?.task?.title) {
    return <p className="text-xs text-gray-500 truncate">Last completed: {last.task.title}</p>
  }
  return <p className="text-xs text-gray-400 truncate">No activity in the last 30 days</p>
}

function ChildCard({ child }) {
  const { setActingAs } = useActingAs()
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
      {child.avatarUrl ? (
        <img src={child.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
      ) : (
        <span
          aria-hidden="true"
          className="w-10 h-10 rounded-full bg-optio-purple/10 text-optio-purple flex items-center justify-center flex-shrink-0 text-sm font-semibold"
        >
          {(child.name || '?').charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 truncate">{child.name}</p>
        <ChildActivityLine studentId={child.id} />
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {child.isDependent && (
          <button
            type="button"
            onClick={() => setActingAs(child.raw)}
            className="btn-ghost px-3 py-1.5 text-sm"
          >
            Act as
          </button>
        )}
        <Link to={`/parent/dashboard/${child.id}`} className="btn-quiet px-3 py-1.5">
          View
        </Link>
      </div>
    </div>
  )
}

/**
 * The in-page school digest: the same link-button cards SchoolPage offers
 * (cardsFor — guardian cards included when the school context says this
 * viewer is a guardian) plus the latest sent messages, with /school a click
 * away for the rest. Renders nothing until there is something to show.
 */
function SchoolSection({ schoolName, schoolOrg, announcements }) {
  const cards = cardsFor(schoolOrg)
  if (!cards.length && !announcements.length) return null

  const formatDate = (iso) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
    } catch {
      return ''
    }
  }

  return (
    <section aria-label="Your school" className="mt-8">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 min-w-0">
          <BuildingLibraryIcon className="w-4 h-4 text-optio-purple flex-shrink-0" />
          <span className="truncate">From {schoolName || 'your school'}</span>
        </h2>
        <Link to="/school" className="text-sm font-medium text-optio-purple hover:underline flex-shrink-0">
          See all
        </Link>
      </div>

      {cards.length > 0 && (
        <nav aria-label="School surfaces" className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {cards.map(({ name, path, description, Icon }) => (
            <Link
              key={path}
              to={path}
              className="group flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-3.5 py-3 hover:border-optio-purple/60 hover:shadow-sm transition-all"
            >
              <span className="w-9 h-9 rounded-lg bg-optio-purple/10 flex items-center justify-center flex-shrink-0 group-hover:bg-gradient-primary transition-colors">
                <Icon className="w-5 h-5 text-optio-purple group-hover:text-white transition-colors" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-900 group-hover:text-optio-purple truncate">
                  {name}
                </span>
                <span className="block text-xs text-gray-500 truncate">{description}</span>
              </span>
            </Link>
          ))}
        </nav>
      )}

      {announcements.length > 0 && (
        <div className={`space-y-2 ${cards.length > 0 ? 'mt-3' : ''}`}>
          {announcements.map((a) => (
            <article key={a.id} className="border border-gray-100 bg-gray-50/60 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-gray-900">{a.title}</h3>
                <time className="text-xs text-gray-400 whitespace-nowrap mt-0.5">
                  {formatDate(a.created_at)}
                </time>
              </div>
              <p className="text-sm text-gray-700 mt-1 line-clamp-2">
                {htmlToText(a.content || a.message || '')}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default function FamilyHome() {
  const { user } = useAuth()
  const { school } = useOrganization()
  const childrenQuery = useFamilyChildren()
  const { items: attentionItems } = useFamilyAttention()
  // Optio Academy runs none of the school surfaces the section links to
  // (calendar, resources, directory are all in its hidden_modules), so the
  // section is skipped there rather than offering doors onto empty rooms.
  // Skipping it also skips its fetches — see useSchoolSection(false).
  const inSchool = Boolean(school) && !inOptioAcademy({ user, school })
  const { schoolOrg, announcements } = useSchoolSection(inSchool)

  const firstName = user?.first_name || 'there'
  const children = childrenQuery.data || []
  // Orgs that used the school-homepage opt-in landed on /school; their school
  // content now leads this page instead.
  const schoolFirst = Boolean(school?.homepage)

  if (childrenQuery.isLoading) {
    return <PageLoader className="min-h-[60vh]" />
  }

  const schoolSection = inSchool ? (
    <SchoolSection
      schoolName={school?.name || schoolOrg?.name}
      schoolOrg={schoolOrg}
      announcements={announcements}
    />
  ) : null

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Welcome back, {firstName}</h1>
      <p className="text-sm text-gray-500 mt-1">Here's how your family is doing.</p>

      <AttentionStrip items={attentionItems} />

      {schoolFirst && schoolSection}

      <section aria-label="Your children" className="mt-8">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <UserGroupIcon className="w-4 h-4 text-optio-purple" />
            Your family
          </h2>
          {children.length > 0 && (
            <Link
              to="/parent/dashboard"
              className="text-sm font-medium text-optio-purple hover:underline flex-shrink-0"
            >
              Family dashboard
            </Link>
          )}
        </div>
        {children.length === 0 ? (
          <EmptyState
            icon={UserGroupIcon}
            title="No children on your account yet"
            hint="Add a child profile, or connect to your student's account."
            action={
              <Link to="/parent/dashboard" className="btn-primary">
                Add your children
              </Link>
            }
          />
        ) : (
          <div className="space-y-2.5">
            {children.map((child) => (
              <ChildCard key={child.id} child={child} />
            ))}
          </div>
        )}
      </section>

      {!schoolFirst && schoolSection}

      {/* A quest the school set for FAMILIES is the guardian's own work, held on
          their own account. They have no student dashboard to meet it on, and
          the school card above only links out to the portal. */}
      <MyEnrolledQuests className="mt-8" />
    </div>
  )
}
