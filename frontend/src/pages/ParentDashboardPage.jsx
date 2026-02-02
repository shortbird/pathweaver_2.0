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
  UserGroupIcon
} from '@heroicons/react/24/outline';
import AddDependentModal from '../components/parent/AddDependentModal';
import RequestStudentConnectionModal from '../components/parent/RequestStudentConnectionModal';
import VisibilityApprovalSection from '../components/parent/VisibilityApprovalSection';
import DependentSettingsModal from '../components/parent/DependentSettingsModal';
import FamilySettingsModal from '../components/parent/FamilySettingsModal';
import ChildOverviewContent from '../components/parent/ChildOverviewContent';
import ParentMomentCaptureButton from '../components/parent/ParentMomentCaptureButton';

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
  const [showAddDependentModal, setShowAddDependentModal] = useState(false);
  const [showRequestConnectionModal, setShowRequestConnectionModal] = useState(false);
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
        const dependentsData = dependentsResponse.dependents || [];

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

    // If we have a student selected or no children exist, stop showing top-level loading
    if (selectedStudentId || (children.length === 0 && dependents.length === 0)) {
      setLoading(false);
    }
  }, [selectedStudentId, children.length, dependents.length, actingAsDependent]);

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
      toast.success(`Now managing ${dependent.display_name}'s account`);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      console.error('Failed to switch to dependent profile:', error);
      toast.error('Failed to switch profiles. Please try again.');
    }
  };

  // Handle dependent creation success
  const handleDependentAdded = async (result) => {
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
        <h1 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Acting as {actingAsDependent.display_name}
        </h1>
        <p className="text-gray-600 font-medium mb-6" style={{ fontFamily: 'Poppins, sans-serif' }}>
          You're currently managing your child's profile. To view the parent dashboard, switch back to your profile using the banner in the bottom-left corner.
        </p>
        <button
          onClick={() => {
            clearActingAs();
          }}
          className="px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:shadow-lg transition-shadow min-h-[44px]"
          style={{ fontFamily: 'Poppins, sans-serif' }}
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
        <h1 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Parent Access Only
        </h1>
        <p className="text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
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
            <UserGroupIcon className="w-20 h-20 text-purple-300 mx-auto mb-6" />
            <h1 className="text-3xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Welcome to Your Family Dashboard
            </h1>
            <p className="text-lg text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Get started by adding your child's profile
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-4">
            {/* Create Dependent Profile (Under 13) */}
            <button
              onClick={() => setShowAddDependentModal(true)}
              className="w-full bg-white border-2 border-optio-purple rounded-lg p-6 hover:shadow-lg transition-shadow text-left group min-h-[44px]"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg flex items-center justify-center">
                  <PlusIcon className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-optio-purple transition-colors" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Create Child Profile (Under 13)
                  </h2>
                  <p className="text-gray-600 font-medium mb-3" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    For children under 13, you can create and fully manage their learning profile. Perfect for younger learners who need parental guidance.
                  </p>
                  <ul className="space-y-1 text-sm text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    <li>• Full access to manage their quests and tasks</li>
                    <li>• Upload evidence and track progress</li>
                    <li>• Mark tasks as complete on their behalf</li>
                    <li>• COPPA-compliant (no email required, optional at age 13)</li>
                  </ul>
                </div>
              </div>
            </button>

            {/* Connect to Existing Student (13+) */}
            <button
              onClick={() => setShowRequestConnectionModal(true)}
              className="w-full bg-white border-2 border-optio-pink rounded-lg p-6 hover:shadow-lg transition-shadow text-left group min-h-[44px]"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-r from-optio-pink to-optio-purple rounded-lg flex items-center justify-center">
                  <UserGroupIcon className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-optio-pink transition-colors" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Connect to Existing Student (13+)
                  </h2>
                  <p className="text-gray-600 font-medium mb-3" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    For teens with their own Optio account, email support@optioeducation.com to request a connection.
                  </p>
                  <ul className="space-y-1 text-sm text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    <li>• View their learning progress and achievements</li>
                    <li>• Upload evidence to help with quest tasks</li>
                    <li>• Student maintains control (marks tasks complete)</li>
                    <li>• Requires manual verification by Optio Support</li>
                  </ul>
                </div>
              </div>
            </button>
          </div>

          {/* Info Notice */}
          <div className="mt-6 bg-purple-50 border border-purple-200 rounded-lg p-4">
            <p className="text-sm text-purple-900 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
              💡 <strong>Not sure which option?</strong> If your child is under 13, start with "Create Child Profile." For teens 13+, we recommend having them create their own account first, then use the "Connect to Existing Student" option.
            </p>
          </div>
        </div>

        {/* Modals for Empty State */}
        <AddDependentModal
          isOpen={showAddDependentModal}
          onClose={() => setShowAddDependentModal(false)}
          onSuccess={handleDependentAdded}
        />

        <RequestStudentConnectionModal
          isOpen={showRequestConnectionModal}
          onClose={() => setShowRequestConnectionModal(false)}
        />
      </div>
    );
  }

  const selectedStudent = children.find(c => c.student_id === selectedStudentId);

  // Show loading spinner while children/dependents list is loading
  if (loading && children.length === 0 && dependents.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Family Dashboard
          </h1>
          {selectedStudent && (
            <p className="text-gray-600 mt-1 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Supporting {selectedStudent.student_first_name}'s learning journey
            </p>
          )}
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <button
            onClick={() => setShowFamilySettingsModal(true)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:shadow-lg transition-shadow min-h-[44px] text-sm sm:text-base"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            <Cog6ToothIcon className="w-5 h-5" />
            Family Settings
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
        </div>
      ) : (
        <>
          {/* Student Tabs */}
          {(children.length > 1 || dependents.length > 1 || (children.length > 0 && dependents.length > 0)) && (
            <div className="border-b border-gray-200 mb-6">
              <nav className="flex gap-6 overflow-x-auto pb-4 -mb-px">
                {/* Linked 13+ students */}
                {children.map((child) => {
                  // Calculate age if date_of_birth is available
                  const age = child.date_of_birth ? calculateAge(child.date_of_birth) : null;
                  const showAgeIcon = age !== null && age < 13;

                  return (
                    <button
                      key={child.student_id}
                      onClick={() => setSelectedStudentId(child.student_id)}
                      className={`pb-4 px-2 font-semibold transition-colors flex items-center gap-2 whitespace-nowrap min-h-[44px] ${
                        selectedStudentId === child.student_id
                          ? 'border-b-2 border-optio-purple text-optio-purple'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                      style={{ fontFamily: 'Poppins, sans-serif' }}
                    >
                      <UserIcon className="w-5 h-5" />
                      {child.student_first_name} {child.student_last_name}
                      {showAgeIcon && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Under 13</span>
                      )}
                    </button>
                  );
                })}

                {/* Dependents (under 13) */}
                {dependents.map((dependent) => {
                  const isSelected = selectedStudentId === dependent.id;

                  return (
                    <button
                      key={dependent.id}
                      onClick={() => setSelectedStudentId(dependent.id)}
                      className={`pb-4 px-2 font-semibold transition-colors flex items-center gap-2 whitespace-nowrap min-h-[44px] ${
                        isSelected
                          ? 'border-b-2 border-optio-purple text-optio-purple'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                      style={{ fontFamily: 'Poppins, sans-serif' }}
                    >
                      <UserIcon className="w-5 h-5" />
                      {dependent.display_name}
                    </button>
                  );
                })}
              </nav>
            </div>
          )}



          {/* FERPA Compliance: Portfolio Visibility Approval Requests */}
          <VisibilityApprovalSection />

          {/* Child Overview Content - uses StudentOverviewPage components */}
          {selectedStudentId && (
            <ChildOverviewContent
              key={`${selectedStudentId}-${overviewRefreshKey}`}
              studentId={selectedStudentId}
              isDependent={dependents.some(d => d.id === selectedStudentId)}
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

      {/* Add Dependent Modal */}
      <AddDependentModal
        isOpen={showAddDependentModal}
        onClose={() => setShowAddDependentModal(false)}
        onSuccess={handleDependentAdded}
      />

      {/* Request Student Connection Modal */}
      <RequestStudentConnectionModal
        isOpen={showRequestConnectionModal}
        onClose={() => setShowRequestConnectionModal(false)}
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
