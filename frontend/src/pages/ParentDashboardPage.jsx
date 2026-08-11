import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useActingAs } from '../contexts/ActingAsContext';
import { useParams, useNavigate } from 'react-router-dom';
import { parentAPI } from '../services/api';
import { toast } from 'react-hot-toast';
import { getMyDependents } from '../services/dependentAPI';
import {
  ExclamationTriangleIcon,
  UserIcon,
  PlusIcon,
  Cog6ToothIcon,
  UserGroupIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline';
import AddChildModal from '../components/parent/AddChildModal';
import VisibilityApprovalSection from '../components/parent/VisibilityApprovalSection';
import DependentSettingsModal from '../components/parent/DependentSettingsModal';
import FamilySettingsModal from '../components/parent/FamilySettingsModal';
import ChildOverviewContent from '../components/parent/ChildOverviewContent';
import ChildPrivacyCard from '../components/parent/ChildPrivacyCard';
import ParentMomentCaptureButton from '../components/parent/ParentMomentCaptureButton';
import { GlassTabBar, PageLoader } from '../components/ui';

const ParentDashboardPage = () => {
  const { user, refreshUser } = useAuth();
  const { setActingAs, actingAsDependent, clearActingAs } = useActingAs();
  const navigate = useNavigate();
  const { studentId } = useParams(); // Get student ID from URL if multi-child
  const [selectedStudentId, setSelectedStudentId] = useState(studentId || null);
  const [children, setChildren] = useState([]);
  const [dependents, setDependents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [showDependentSettingsModal, setShowDependentSettingsModal] = useState(false);
  const [selectedDependentForSettings, setSelectedDependentForSettings] = useState(null);
  const [selectedChildIsDependent, setSelectedChildIsDependent] = useState(true);
  const [showFamilySettingsModal, setShowFamilySettingsModal] = useState(false);
  const [overviewRefreshKey, setOverviewRefreshKey] = useState(0);

  // Load children list (admin-only linking, no invitations) and dependents
  // NOTE: All hooks must be declared before any conditional returns (React Rules of Hooks)
  useEffect(() => {
    // Skip loading if acting as dependent (will be redirected to student dashboard)
    if (actingAsDependent) {
      return;
    }

    const loadChildrenAndDependents = async () => {
      try {
        // Load both linked students and dependents in parallel
        const [childrenResponse, dependentsResponse] = await Promise.all([
          parentAPI.getMyChildren(),
          getMyDependents()
        ]);

        const childrenData = childrenResponse.data.children || [];
        const dependentsRaw = dependentsResponse.dependents || [];

        // get_parent_dependents (the my-dependents RPC) returns the UNION of
        // true under-13 dependents AND approved parent_student_links, so every
        // linked student also comes back in `dependentsRaw`. The web dashboard
        // renders `children` and `dependents` as two separate tab lists, so a
        // linked kid present in both arrays renders twice. Linked students are
        // independent accounts (not managed dependents), so keep them in
        // `children` (isDependent=false, diploma credits visible) and strip the
        // overlap out of `dependents`, leaving only true under-13 dependents.
        const childIds = new Set(childrenData.map((c) => c.student_id));
        const dependentsData = dependentsRaw.filter((d) => !childIds.has(d.id));

        setChildren(childrenData);
        setDependents(dependentsData);

        // Auto-select first child or dependent if none selected
        if (!selectedStudentId) {
          if (childrenData.length > 0) {
            setSelectedStudentId(childrenData[0].student_id);
          } else if (dependentsData.length > 0) {
            setSelectedStudentId(dependentsData[0].id);
          }
        }

        // If no children AND no dependents, turn off loading so the empty state shows
        if (childrenData.length === 0 && dependentsData.length === 0) {
          setLoading(false);
        }
      } catch (error) {
        console.error('Error loading children/dependents:', error);
        setError('Failed to load students');
        setLoading(false); // Stop loading on error
      }
    };

    // Load if user has parent relationships OR has parent/admin role
    // This supports org_admins/advisors who are also parents
    const hasParentRelationships = user?.has_dependents || user?.has_linked_students
    const hasParentRole = user?.role === 'parent' || user?.org_role === 'parent'
    const hasAdminAccess = user?.role === 'admin' || user?.role === 'superadmin'

    if (hasParentRelationships || hasParentRole || hasAdminAccess) {
      loadChildrenAndDependents();
    }
  }, [user, actingAsDependent]); // Re-run when actingAsDependent changes (e.g., switching back from masquerade)


  // Stop loading once children/dependents are loaded and a student is selected
  useEffect(() => {
    if (actingAsDependent) return;

    // Only stop loading once we have a student selected
    // (the "no children/dependents" case is handled in loadChildrenAndDependents)
    if (selectedStudentId) {
      setLoading(false);
    }
  }, [selectedStudentId, actingAsDependent]);

  // Helper to calculate age from date_of_birth
  const calculateAge = (dateOfBirth) => {
    if (!dateOfBirth) return null;
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  // Handler for "Act As Dependent" button
  const handleActAsDependent = async (dependent) => {
    try {
      await setActingAs(dependent);
      toast.success(`Now managing ${`${dependent.first_name || ''} ${dependent.last_name || ''}`.trim() || dependent.display_name}'s account`);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      console.error('Failed to switch to dependent profile:', error);
      toast.error('Failed to switch profiles. Please try again.');
    }
  };

  // Handle dependent creation success
  const handleChildAdded = async (result) => {
    toast.success(result.message || 'Dependent profile created');

    // Refresh user data to update has_dependents flag in AuthContext
    // This ensures the sidebar shows the parent dashboard link immediately
    await refreshUser();

    // Reload the page to refresh the children/dependents list
    // This ensures the ProfileSwitcher shows the new dependent
    window.location.reload();
  };

  // === CONDITIONAL RETURNS (must come AFTER all hooks) ===

  // Early return: Show message if trying to access parent dashboard while acting as dependent
  if (actingAsDependent) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center">
        <UserGroupIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Acting as {`${actingAsDependent.first_name || ''} ${actingAsDependent.last_name || ''}`.trim() || actingAsDependent.display_name}
        </h1>
        <p className="text-gray-600 font-medium mb-6">
          You're currently managing your child's profile. To view the parent dashboard, switch back to your profile using the banner in the bottom-left corner.
        </p>
        <button
          onClick={() => {
            clearActingAs();
          }}
          className="btn-primary"
        >
          Switch Back to Parent View
        </button>
      </div>
    );
  }

  // Check if logged-in user is a dependent - redirect to student dashboard
  if (user && user.is_dependent) {
    navigate('/dashboard', { replace: true });
    return null;
  }

  // Allow access if user has parent relationships OR is parent/admin/superadmin role
  // This supports org_admins/advisors who are also parents
  const hasParentRelationships = user?.has_dependents || user?.has_linked_students
  const hasParentRole = user?.role === 'parent' || user?.org_role === 'parent'
  const hasAdminAccess = user?.role === 'admin' || user?.role === 'superadmin'
  const canAccessParentDashboard = hasParentRelationships || hasParentRole || hasAdminAccess

  if (!user || !canAccessParentDashboard) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center">
        <ExclamationTriangleIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Parent Access Only
        </h1>
        <p className="text-gray-600 font-medium">
          This dashboard is only available to parent accounts.
        </p>
      </div>
    );
  }

  if (children.length === 0 && dependents.length === 0 && !loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <UserGroupIcon className="w-20 h-20 text-optio-purple-light mx-auto mb-6" />
            <h1 className="text-3xl font-bold text-gray-900 mb-3">
              Welcome to Your Family Dashboard
            </h1>
            <p className="text-lg text-gray-600 font-medium">
              Get started by adding your child's profile
            </p>
          </div>

          {/* One door for both ages. The old pair of cards made the parent
              classify their own child before they could add them — and left
              13+ waiting on the teen to self-register. Date of birth in the
              form decides what gets created. */}
          <div className="space-y-4">
            <button
              onClick={() => setShowAddChildModal(true)}
              className="w-full bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow text-left group min-h-[44px]"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center">
                  <PlusIcon className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-optio-purple transition-colors">
                    Add Your Child
                  </h2>
                  <p className="text-gray-600 font-medium mb-3">
                    Set up any of your children — we'll ask their birth date and take it from there.
                  </p>
                  <ul className="space-y-1 text-sm text-gray-600 font-medium">
                    <li>• Under 13: you manage their profile, no email needed</li>
                    <li>• 13 and older: they get their own login, you stay connected</li>
                    <li>• Track progress and help with evidence either way</li>
                  </ul>
                </div>
              </div>
            </button>
          </div>

        </div>

        {/* Modals for Empty State */}
        <AddChildModal
          isOpen={showAddChildModal}
          onClose={() => setShowAddChildModal(false)}
          onSuccess={handleChildAdded}
        />

      </div>
    );
  }

  const selectedStudent = children.find(c => c.student_id === selectedStudentId);

  // Show loading spinner while children/dependents list is loading
  if (loading && children.length === 0 && dependents.length === 0) {
    return <PageLoader className="h-64" />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Family Dashboard
          </h1>
          {selectedStudent && (
            <p className="text-gray-600 mt-1 font-medium">
              Supporting {selectedStudent.student_first_name}'s learning journey
            </p>
          )}
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {selectedStudentId && Boolean(user?.organization_id) && (
            <button
              onClick={() => navigate(`/family/students/${selectedStudentId}`)}
              className="btn-secondary"
            >
              View record
            </button>
          )}
          <button
            onClick={() => setShowFamilySettingsModal(true)}
            className="btn-primary"
          >
            <Cog6ToothIcon className="w-5 h-5" />
            Family Settings
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-medium">{error}</p>
        </div>
      )}

      {loading ? (
        <PageLoader className="h-64" />
      ) : (
        <>
          {/* Student Selector */}
          {(children.length > 1 || dependents.length > 1 || (children.length > 0 && dependents.length > 0)) && (() => {
            // Build unified list for both mobile dropdown and desktop tabs
            const allStudents = [
              ...children.map((child) => {
                const age = child.date_of_birth ? calculateAge(child.date_of_birth) : null;
                return {
                  id: child.student_id,
                  name: `${child.student_first_name} ${child.student_last_name}`,
                  isUnder13: age !== null && age < 13,
                };
              }),
              ...dependents.map((dep) => ({
                id: dep.id,
                name: `${dep.first_name || ''} ${dep.last_name || ''}`.trim() || dep.display_name,
                isUnder13: false,
              })),
            ];
            const selectedStudent = allStudents.find(s => s.id === selectedStudentId);

            return (
              <>
                {/* Mobile: Dropdown */}
                <div className="sm:hidden mb-4">
                  <div className="relative">
                    <select
                      value={selectedStudentId || ''}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-4 py-3 pr-10 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-optio-purple/30 focus:border-optio-purple"
                    >
                      {allStudents.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}{s.isUnder13 ? ' (Under 13)' : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Desktop: Tabs (glass pill rail, DESIGN_SYSTEM.md §7) */}
                <div className="hidden sm:block mb-6">
                  <GlassTabBar
                    size="md"
                    tabs={allStudents.map((s) => ({
                      id: s.id,
                      label: (
                        <>
                          <UserIcon className="w-5 h-5" />
                          {s.name}
                          {s.isUnder13 && (
                            <span className="text-xs bg-optio-purple/10 text-optio-purple px-2 py-0.5 rounded">Under 13</span>
                          )}
                        </>
                      ),
                    }))}
                    active={selectedStudentId}
                    onSelect={setSelectedStudentId}
                    aria-label="Students"
                  />
                </div>
              </>
            );
          })()}



          {/* FERPA Compliance: Portfolio Visibility Approval Requests */}
          <VisibilityApprovalSection />

          {/* Who can see this child's work, and the links that grant access.
              Sits above the overview because it is the setting a parent is
              most likely to have come here to check. */}
          {selectedStudentId && (
            <div className="mb-6">
              <ChildPrivacyCard
                key={`privacy-${selectedStudentId}-${overviewRefreshKey}`}
                studentId={selectedStudentId}
                studentName={(() => {
                  const d = dependents.find((x) => x.id === selectedStudentId);
                  if (d) return (`${d.first_name || ''}`.trim() || d.display_name || 'your child');
                  const c = children.find((x) => x.student_id === selectedStudentId);
                  return (c && (`${c.first_name || ''}`.trim() || c.display_name)) || 'your child';
                })()}
              />
            </div>
          )}

          {/* Child Overview Content - uses StudentOverviewPage components */}
          {selectedStudentId && (
            <ChildOverviewContent
              key={`${selectedStudentId}-${overviewRefreshKey}`}
              studentId={selectedStudentId}
              isDependent={dependents.some(d => d.id === selectedStudentId)}
              dependentName={(() => { const d = dependents.find(d => d.id === selectedStudentId); return d ? (`${d.first_name || ''} ${d.last_name || ''}`.trim() || d.display_name) : undefined; })()}
              onEditClick={() => {
                // Find the selected child/dependent for settings
                const selectedDependent = dependents.find(d => d.id === selectedStudentId);
                const selectedChild = children.find(c => c.student_id === selectedStudentId);
                if (selectedDependent) {
                  setSelectedDependentForSettings(selectedDependent);
                  setSelectedChildIsDependent(true);
                } else if (selectedChild) {
                  setSelectedDependentForSettings(selectedChild);
                  setSelectedChildIsDependent(false);
                }
                setShowDependentSettingsModal(true);
              }}
            />
          )}

        </>
      )}

      {/* Add Child Modal — one door for both ages */}
      <AddChildModal
        isOpen={showAddChildModal}
        onClose={() => setShowAddChildModal(false)}
        onSuccess={handleChildAdded}
      />

      {/* Child Settings Modal (for both dependents and linked students) */}
      <DependentSettingsModal
        isOpen={showDependentSettingsModal}
        onClose={() => {
          setShowDependentSettingsModal(false);
          setSelectedDependentForSettings(null);
        }}
        child={selectedDependentForSettings}
        isDependent={selectedChildIsDependent}
        onUpdate={async () => {
          // Reload dependents and children list to get updated data
          try {
            const [childrenResponse, dependentsResponse] = await Promise.all([
              parentAPI.getMyChildren(),
              getMyDependents()
            ]);
            setChildren(childrenResponse.data.children || []);
            setDependents(dependentsResponse.dependents || []);
            // Trigger ChildOverviewContent refresh by changing its key
            setOverviewRefreshKey(prev => prev + 1);
          } catch (error) {
            console.error('Error reloading children:', error);
          }
        }}
        onActAs={handleActAsDependent}
      />

      <FamilySettingsModal
        isOpen={showFamilySettingsModal}
        onClose={() => setShowFamilySettingsModal(false)}
        children={children}
        dependents={dependents}
        onChildAdded={async () => {
          // Reload dependents list
          try {
            const response = await getMyDependents();
            setDependents(response.dependents || []);
            // Select the new dependent if none selected
            if (!selectedStudentId && response.dependents?.length > 0) {
              setSelectedStudentId(response.dependents[response.dependents.length - 1].id);
            }
          } catch (error) {
            console.error('Error reloading dependents:', error);
          }
        }}
        onChildSettingsClick={(child) => {
          // Close family settings and open child settings
          setShowFamilySettingsModal(false);
          const isDependent = dependents.some(d => d.id === child.id);
          if (isDependent) {
            const dep = dependents.find(d => d.id === child.id);
            setSelectedDependentForSettings(dep);
            setSelectedChildIsDependent(true);
          } else {
            const linkedChild = children.find(c => c.student_id === child.id);
            setSelectedDependentForSettings(linkedChild);
            setSelectedChildIsDependent(false);
          }
          setShowDependentSettingsModal(true);
        }}
        onRefresh={async () => {
          try {
            const [childrenResponse, dependentsResponse] = await Promise.all([
              parentAPI.getMyChildren(),
              getMyDependents()
            ]);
            setChildren(childrenResponse.data.children || []);
            setDependents(dependentsResponse.dependents || []);
            setOverviewRefreshKey(prev => prev + 1);
          } catch (error) {
            console.error('Error refreshing:', error);
          }
        }}
      />

      {/* Floating Learning Moment Capture Button */}
      <ParentMomentCaptureButton
        children={children}
        dependents={dependents}
        selectedChildId={selectedStudentId}
        onSuccess={() => {
          // Refresh the child overview to show the new moment
          setOverviewRefreshKey(prev => prev + 1);
        }}
      />

    </div>
  );
};

export default ParentDashboardPage;
