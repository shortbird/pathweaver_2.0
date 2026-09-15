import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import {
  UserGroupIcon, ChevronRightIcon, ClipboardDocumentListIcon,
  DocumentTextIcon, CreditCardIcon, BuildingLibraryIcon, Cog6ToothIcon, PlusIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import { useOrganization } from '../../contexts/OrganizationContext'
import { useFamilyScope } from '../../contexts/FamilyScopeContext'
import { useInvalidateFamilyChildren } from '../../hooks/api/useFamilyChildren'
import { PageLoader } from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import AddChildModal from '../../components/parent/AddChildModal'
import ChildCard from '../../components/parent/ChildCard'
import FamilyCover from '../../components/parent/FamilyCover'
import FamilyQuestsSection from '../../components/parent/FamilyQuestsSection'
import FamilySettingsModal from '../../components/parent/FamilySettingsModal'
import ParentMomentCaptureButton from '../../components/parent/ParentMomentCaptureButton'
import VisibilityApprovalSection from '../../components/parent/VisibilityApprovalSection'
import { htmlToText } from '../../utils/richText'
import { inOptioAcademy } from '../../config/optioAcademy'
import { moduleEnabled } from '../../modules/moduleEnabled'
import { useFamilyAttention, useSchoolSection } from './FamilyHomeData'

/**
 * Family Home — the ONE parent dashboard, at /family (2026-09-15).
 *
 * The question it answers: "how are my kids, what do I owe the school, and
 * how do I get into each child's account." Shared home skeleton: greeting →
 * needs-attention → child cards → family quests → school digest. Everything
 * here is a digest over existing endpoints (see FamilyHomeData.js and
 * hooks/api) that deep-links into the pages that own each concern: /family/*
 * the school paperwork, /school the school's own page -- and, for each
 * child, the child's OWN pages. "Open" enters family scope
 * (contexts/FamilyScopeContext) and the dashboard, quests, journal and
 * portfolio then render pointed at that child, with the parent still signed
 * in as themselves.
 *
 * Each child is a card (components/parent/ChildCard) in a grid that goes
 * one, two, three across with the viewport: picture, the numbers that move,
 * the quests they are on with their rhythm on each (a quest opens the
 * child's copy of it), the weekly goal, and the peer-connection requests
 * waiting on the parent -- which used to be a page of their own under "Student
 * connections" in the sidebar. Family quests
 * (components/parent/FamilyQuestsSection) are the ones the parent set up or
 * is on themselves, with who is on each. Settings is ONE modal
 * (components/parent/FamilySettingsModal) with a tab per child; adding a
 * child lives there too, so the cards carry only Open.
 *
 * Until 2026-09-15 there were two parent pages: this digest at /dashboard and
 * a tabbed /parent/dashboard with a hero, a schedule, classes, attendance and
 * five collapsible sections per child -- a second, thinner copy of the pages
 * the child already has. That page is gone; what it owned that this one did
 * not (Family Settings, adding a child, per-child settings, portfolio
 * visibility approvals, capturing a moment) lives here now. The "Act as"
 * button went with it: a parent no longer switches accounts to help.
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
 * The in-page school digest: the school's latest messages, with /school a
 * click away for everything else. It used to also duplicate SchoolPage's
 * whole card grid — the same eight buttons on home AND on /school, back to
 * back for exactly the orgs that render this section first (2026-08-23
 * redesign). The cards live on /school now; home keeps the messages, which
 * are the thing that changes day to day. Renders nothing until there is
 * something to show.
 */
function SchoolSection({ schoolName, announcements }) {
  if (!announcements.length) return null

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

      {announcements.length > 0 && (
        <div className="space-y-2">
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
  const { user, refreshUser } = useAuth()
  const { school } = useOrganization()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { children, isLoading, enterScope } = useFamilyScope()
  const invalidateFamily = useInvalidateFamilyChildren()
  const { items: attentionItems } = useFamilyAttention()
  // Optio Academy runs none of the school surfaces the section links to
  // (calendar, resources, directory are all in its hidden_modules), so the
  // section is skipped there rather than offering doors onto empty rooms.
  // Skipping it also skips its fetches — see useSchoolSection(false).
  const inSchool = Boolean(school) && !inOptioAcademy({ user, school })
  const { schoolOrg, announcements } = useSchoolSection(inSchool)

  const [showAddChild, setShowAddChild] = useState(false)
  // In an SIS school the office links students to their family (registration,
  // roster import); a child added from here would land outside the household
  // that billing, class chats and the schedule are built on. So the door is
  // not offered there, and the empty state says who to ask instead.
  const canAddChild = !moduleEnabled(user?.organization, 'sis')
  const schoolName = school?.name || 'your school'
  const [showFamilySettings, setShowFamilySettings] = useState(false)
  const [familySettingsTab, setFamilySettingsTab] = useState('you')

  const openSettings = (tab) => {
    setFamilySettingsTab(tab)
    setShowFamilySettings(true)
  }

  // ?settings=<tab> opens Family Settings on that tab -- 'you', 'observers',
  // 'parents' or a child's id. The account menu links here with
  // ?settings=you, because a parent has no /overview to change their own name
  // on. The param is cleared once consumed so a refresh (or the back button)
  // doesn't reopen the modal.
  useEffect(() => {
    const tab = searchParams.get('settings')
    if (!tab) return
    setFamilySettingsTab(tab)
    setShowFamilySettings(true)
    const next = new URLSearchParams(searchParams)
    next.delete('settings')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const firstName = user?.first_name || 'there'
  // Orgs that used the school-homepage opt-in landed on /school; their school
  // content now leads this page instead.
  const schoolFirst = Boolean(school?.homepage)

  const openChild = (child) => {
    enterScope(child.id)
    navigate('/dashboard')
  }

  // A quest on a child's card opens THAT child's copy of it: the parent is
  // working with the child, on the page the child would see.
  const openChildQuest = (child, questId) => {
    enterScope(child.id)
    navigate(`/quests/${questId}`)
  }

  // The child's name opens their full profile (/overview in their scope).
  const openChildProfile = (child) => {
    enterScope(child.id)
    navigate('/overview')
  }

  const handleChildAdded = async (result) => {
    toast.success(result.message || 'Child added')
    // has_dependents / has_linked_students drive the sidebar; refresh them.
    await refreshUser()
    invalidateFamily()
    setShowAddChild(false)
  }

  // ParentMomentCaptureButton reads the two raw lists the endpoints return.
  const linkedRaw = children.filter((c) => !c.isDependent).map((c) => c.raw)
  const dependentsRaw = children.filter((c) => c.isDependent).map((c) => c.raw)

  if (isLoading) {
    return <PageLoader className="min-h-[60vh]" />
  }

  const schoolSection = inSchool ? (
    <SchoolSection
      schoolName={school?.name || schoolOrg?.name}
      announcements={announcements}
    />
  ) : null

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* The family's own photo, above everything. */}
      <FamilyCover className="mb-6" />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome back, {firstName}</h1>
          <p className="text-sm text-gray-500 mt-1">Here's how your family is doing.</p>
        </div>
        <button
          type="button"
          onClick={() => openSettings('you')}
          className="btn-quiet flex-shrink-0"
        >
          <Cog6ToothIcon className="w-5 h-5" />
          Family settings
        </button>
      </div>

      <AttentionStrip items={attentionItems} />

      {/* FERPA: a child's portfolio goes public only with a guardian's yes. */}
      <VisibilityApprovalSection />

      {schoolFirst && schoolSection}

      {/* Adding a child, and each child's settings, live in Family Settings
          (the header button); the cards carry only Open. */}
      <section aria-label="Your children" className="mt-8">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-2">
          <UserGroupIcon className="w-4 h-4 text-optio-purple" />
          Your family
        </h2>
        {children.length === 0 ? (
          canAddChild ? (
            <EmptyState
              icon={UserGroupIcon}
              title="No children on your account yet"
              hint="Set up any of your children — we'll ask their birth date and take it from there. Under 13: you manage their profile, no email needed. 13 and older: they get their own login, you stay connected."
              action={
                <button type="button" onClick={() => setShowAddChild(true)} className="btn-primary">
                  <PlusIcon className="w-5 h-5" />
                  Add your child
                </button>
              }
            />
          ) : (
            <EmptyState
              icon={UserGroupIcon}
              title="No students linked to your account yet"
              hint={`Ask ${schoolName} to link your student to your account. Once they have, your children appear here.`}
            />
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {children.map((child) => (
              <ChildCard
                key={child.id}
                child={child}
                onOpen={openChild}
                onOpenQuest={openChildQuest}
                onOpenProfile={openChildProfile}
                onOpenSettings={(c) => openSettings(c.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Quests the parent set up for the children, and any on the parent's
          own account (a school's family training quest lands there). */}
      <FamilyQuestsSection className="mt-8" />

      {!schoolFirst && schoolSection}

      {/* Capture a moment for a child from here, without opening their journal. */}
      <ParentMomentCaptureButton
        children={linkedRaw}
        dependents={dependentsRaw}
        onSuccess={invalidateFamily}
      />

      <AddChildModal
        isOpen={showAddChild}
        onClose={() => setShowAddChild(false)}
        onSuccess={handleChildAdded}
      />

      <FamilySettingsModal
        isOpen={showFamilySettings}
        onClose={() => setShowFamilySettings(false)}
        family={children}
        initialTab={familySettingsTab}
        onAddChild={canAddChild ? () => { setShowFamilySettings(false); setShowAddChild(true) } : null}
        onRefresh={invalidateFamily}
      />
    </div>
  )
}
