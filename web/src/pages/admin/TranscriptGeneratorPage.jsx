import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { PageLoader } from '../../components/ui/Spinner';
import TransferToSchoolModal from '../../components/transcript/TransferToSchoolModal';
import { ACCREDITATION_ACTIVE } from '../../constants/accreditation';
import { useConfirm } from '../../contexts/ConfirmContext'

// html2pdf is loaded ON DEMAND, not at module scope (QF-06). It pulls in
// html2canvas and jsPDF -- a large chunk -- and this page renders long before
// anyone clicks Download, if they ever do. A static import puts all of it in
// the initial bundle for every visitor.
async function loadHtml2Pdf() {
  return (await import('html2pdf.js')).default;
}


// A copy of the requirement table used to sit here, with a comment saying it
// "must match backend CreditMappingService.DIPLOMA_REQUIREMENTS". It didn't —
// Social Studies said 3.5 where the backend says 4.0 — and nothing on this page
// read it, so nothing ever caught the drift. Removed rather than corrected: an
// unread copy can't be right, and that comment invites the next person to
// trust it. Requirements and elective overflow live in
// utils/creditRequirements; the transcript's own numbers come from the API.

// QF-02: the toolbar, the two no-print editors, the printable document and
// its print stylesheet each live in ./transcriptGenerator/. This page keeps
// the data loading, the override state and the PDF plumbing.
import TranscriptToolbar from './transcriptGenerator/TranscriptToolbar';
import PlannedCreditForm from './transcriptGenerator/PlannedCreditForm';
import CourseBreakdownEditor from './transcriptGenerator/CourseBreakdownEditor';
import PrintableTranscript from './transcriptGenerator/PrintableTranscript';
import TranscriptPrintStyles from './transcriptGenerator/printStyles';

const TranscriptGeneratorPage = () => {
  const confirm = useConfirm()
  const { userId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overrides, setOverrides] = useState({});
  const saveTimer = useRef(null);

  // Planned credit form
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCredit, setEditingCredit] = useState(null);
  const [formData, setFormData] = useState({
    school_subject: '',
    course_name: '',
    credits: '1.0',
    source: '',
    notes: '',
    status: 'in_progress'
  });
  const [saving, setSaving] = useState(false);

  // Course breakdown editor state
  const [splitTarget, setSplitTarget] = useState(null); // { transferCreditId, subjectKey, subjectName, totalCredits }
  const [splitCourses, setSplitCourses] = useState([{ name: '', credits: '' }]);
  const [splitSaving, setSplitSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/admin/transcript/${userId}`);
      const d = response.data?.data || response.data;
      setData(d);
      setOverrides(d.overrides || {});
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load transcript data');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const [downloading, setDownloading] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);

  // Shared html2pdf options: keeps Download PDF and Transfer to School
  // producing the identical document. Hides edit-only UI in the clone.
  const pdfOptions = (filename) => ({
    margin: [10, 10, 10, 10],
    filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
      onclone: (doc) => {
        doc.querySelectorAll(
          '#printable-transcript .no-print, #printable-transcript .no-print-edit'
        ).forEach((n) => { n.style.display = 'none'; });
      },
    },
    jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' },
    pagebreak: { mode: 'css' },
  });

  // Generate a clean PDF straight from the transcript element (no browser
  // print chrome / URL / title header).
  const handleDownloadPdf = async () => {
    const el = document.getElementById('printable-transcript');
    if (!el) return;
    setDownloading(true);
    try {
      const first = data?.student?.first_name || '';
      const last = data?.student?.last_name || '';
      const initials = ((first[0] || '') + (last[0] || '')).toUpperCase() || 'XX';
      const dateStr = new Date().toISOString().split('T')[0];
      const html2pdf = await loadHtml2Pdf();
      await html2pdf().set(pdfOptions(`Transcript_${initials}_${dateStr}.pdf`)).from(el).save();
    } catch (err) {
      toast.error('Failed to generate PDF');
    } finally {
      setDownloading(false);
    }
  };

  // Same PDF as Download, but returned as a base64 data URI for the
  // Transfer to School email endpoint.
  const generatePdfBase64 = async () => {
    const el = document.getElementById('printable-transcript');
    if (!el) throw new Error('Transcript not ready');
    const html2pdf = await loadHtml2Pdf();
    return html2pdf().set(pdfOptions('transcript.pdf')).from(el).outputPdf('datauristring');
  };

  // Auto-save overrides with debounce
  const saveOverrides = useCallback((newOverrides) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.put(`/api/admin/transcript/${userId}/overrides`, newOverrides);
      } catch (err) {
        toast.error('Failed to save changes');
      }
    }, 800);
  }, [userId]);

  const updateOverride = (key, value) => {
    setOverrides(prev => {
      const updated = { ...prev, [key]: value };
      saveOverrides(updated);

      // Sync DOB to user profile if they don't have one (use raw ISO date)
      if (key === 'date_of_birth_raw' && value && !student?.date_of_birth) {
        api.put(`/api/admin/users/${userId}`, { date_of_birth: value }).catch(() => {});
      }

      return updated;
    });
  };

  // Helper: get value with override fallback
  const field = (key, fallback) => overrides[key] !== undefined && overrides[key] !== '' ? overrides[key] : fallback;

  const resetForm = () => {
    setFormData({ school_subject: '', course_name: '', credits: '1.0', source: '', notes: '', status: 'in_progress' });
    setEditingCredit(null);
    setShowAddForm(false);
  };

  const handleSavePlannedCredit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingCredit) {
        await api.put(`/api/admin/transcript/${userId}/planned-credits/${editingCredit}`, formData);
        toast.success('Credit updated');
      } else {
        await api.post(`/api/admin/transcript/${userId}/planned-credits`, formData);
        toast.success('Credit added');
      }
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlannedCredit = async (creditId) => {
    if (!(await confirm('Delete this planned credit?'))) return;
    try {
      await api.delete(`/api/admin/transcript/${userId}/planned-credits/${creditId}`);
      toast.success('Deleted');
      fetchData();
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const startEdit = (pc) => {
    setFormData({
      school_subject: pc.school_subject,
      course_name: pc.course_name,
      credits: String(pc.credits),
      source: pc.source || '',
      notes: pc.notes || '',
      status: pc.status
    });
    setEditingCredit(pc.id);
    setShowAddForm(true);
  };

  // Start splitting a transfer credit subject into courses
  const startSplit = (row) => {
    // Find existing course breakdown if any
    const tc = (transfer_credits || []).find(t => t.id === row.transferCreditId);
    const existing = tc?.course_names?.[row.subjectKey];

    if (existing && existing.length > 0) {
      setSplitCourses(existing.map(c => ({ name: c.name, credits: String(c.credits) })));
    } else {
      setSplitCourses([{ name: '', credits: String(row.totalSubjectCredits) }]);
    }
    setSplitTarget({
      transferCreditId: row.transferCreditId,
      subjectKey: row.subjectKey,
      subjectName: row.subject,
      totalCredits: row.totalSubjectCredits
    });
  };

  const addSplitRow = () => {
    setSplitCourses(prev => [...prev, { name: '', credits: '' }]);
  };

  const removeSplitRow = (idx) => {
    setSplitCourses(prev => prev.filter((_, i) => i !== idx));
  };

  const updateSplitRow = (idx, field, value) => {
    setSplitCourses(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };

  const saveSplit = async () => {
    if (!splitTarget) return;

    const courses = splitCourses
      .filter(c => c.name.trim() && parseFloat(c.credits) > 0)
      .map(c => ({ name: c.name.trim(), credits: parseFloat(c.credits) }));

    if (courses.length === 0) {
      toast.error('Add at least one course with a name and credits');
      return;
    }

    const totalAssigned = courses.reduce((sum, c) => sum + c.credits, 0);
    if (Math.abs(totalAssigned - splitTarget.totalCredits) > 0.01) {
      toast.error(`Course credits must total ${splitTarget.totalCredits} (currently ${totalAssigned.toFixed(2)})`);
      return;
    }

    setSplitSaving(true);
    try {
      // Get existing course_names for this transfer credit
      const tc = (transfer_credits || []).find(t => t.id === splitTarget.transferCreditId);
      const existingCourseNames = { ...(tc?.course_names || {}) };
      existingCourseNames[splitTarget.subjectKey] = courses;

      await api.put(
        `/api/admin/transcript/transfer-credits/${splitTarget.transferCreditId}/course-names`,
        { course_names: existingCourseNames }
      );
      toast.success('Course breakdown saved');
      setSplitTarget(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setSplitSaving(false);
    }
  };

  const clearSplit = async () => {
    if (!splitTarget) return;
    setSplitSaving(true);
    try {
      const tc = (transfer_credits || []).find(t => t.id === splitTarget.transferCreditId);
      const existingCourseNames = { ...(tc?.course_names || {}) };
      delete existingCourseNames[splitTarget.subjectKey];

      await api.put(
        `/api/admin/transcript/transfer-credits/${splitTarget.transferCreditId}/course-names`,
        { course_names: existingCourseNames }
      );
      toast.success('Course breakdown removed');
      setSplitTarget(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to clear');
    } finally {
      setSplitSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageLoader className="min-h-screen" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  const { student, earned_credits, class_credits, transfer_credits, planned_credits, totals, accreditation } = data;
  // Timezone-safe: date-only strings (YYYY-MM-DD) must be split manually.
  // new Date('2008-07-22') parses as UTC midnight and renders a day early
  // in any western timezone.
  const formatDate = (d) => {
    if (!d) return '';
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      return `${months[parseInt(m[2], 10) - 1]} ${parseInt(m[3], 10)}, ${m[1]}`;
    }
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };
  // Show the ACS WASC mark only when this transcript is issued under Optio
  // Academy's accreditation (partners with their own accreditation are excluded).
  const isWascAccredited = ACCREDITATION_ACTIVE && accreditation?.source === 'optio';

  // Build rows for the transcript table
  const buildCreditRows = () => {
    const rows = [];

    // Earned credits from Optio
    Object.entries(earned_credits || {}).forEach(([subject, info]) => {
      if (info.credits > 0) {
        const overrideKey = `earned_course_${subject}`;
        rows.push({
          type: 'earned',
          subject: info.display_name,
          course: field(overrideKey, 'Optio Competency-Based'),
          courseOverrideKey: overrideKey,
          source: 'Optio',
          credits: info.credits,
          status: 'Completed'
        });
      }
    });

    // Awarded classes - grouped into one row per subject; course names are
    // listed together and credits summed (0.5 per class, A grade)
    const classesBySubject = {};
    (class_credits || []).forEach(cc => {
      if (!classesBySubject[cc.school_subject]) classesBySubject[cc.school_subject] = [];
      classesBySubject[cc.school_subject].push(cc);
    });
    Object.entries(classesBySubject).forEach(([subject, classes]) => {
      const overrideKey = `class_courses_${subject}`;
      rows.push({
        type: 'class',
        subject: classes[0].display_name,
        course: field(overrideKey, classes.map(c => c.course_name).join(', ')),
        courseOverrideKey: overrideKey,
        source: 'Optio',
        credits: classes.reduce((sum, c) => sum + c.credits, 0),
        status: 'Completed'
      });
    });

    // Transfer credits - expand into individual courses if course_names breakdown exists
    (transfer_credits || []).forEach(tc => {
      const courseNames = tc.course_names || {};
      Object.entries(tc.subjects || {}).forEach(([subject, info]) => {
        const courses = courseNames[subject];
        if (courses && courses.length > 0) {
          // Render individual course rows
          courses.forEach((course, idx) => {
            const overrideKey = `tc_course_${tc.id}_${subject}_${idx}`;
            rows.push({
              type: 'transfer',
              subject: info.display_name,
              course: field(overrideKey, course.name),
              courseOverrideKey: overrideKey,
              source: tc.school_name || 'Transfer',
              credits: course.credits,
              status: 'Completed',
              transcriptUrl: idx === 0 ? tc.transcript_url : null,
              transferCreditId: tc.id,
              subjectKey: subject,
              hasCourseBreakdown: true
            });
          });
        } else {
          // No breakdown - single row for the whole subject
          const overrideKey = `tc_course_${tc.id}_${subject}`;
          rows.push({
            type: 'transfer',
            subject: info.display_name,
            course: field(overrideKey, info.display_name),
            courseOverrideKey: overrideKey,
            source: tc.school_name || 'Transfer',
            credits: info.credits,
            status: 'Completed',
            transcriptUrl: tc.transcript_url,
            transferCreditId: tc.id,
            subjectKey: subject,
            totalSubjectCredits: info.credits
          });
        }
      });
    });

    // Planned credits
    (planned_credits || []).forEach(pc => {
      rows.push({
        type: 'planned',
        subject: pc.display_name,
        course: pc.course_name,
        source: pc.source || '',
        credits: pc.credits,
        status: pc.status === 'in_progress' ? 'In Progress' : pc.status === 'completed' ? 'Completed' : 'Dropped',
        id: pc.id,
        raw: pc
      });
    });

    rows.sort((a, b) => {
      if (a.status === 'Completed' && b.status !== 'Completed') return -1;
      if (a.status !== 'Completed' && b.status === 'Completed') return 1;
      return a.subject.localeCompare(b.subject);
    });

    return rows;
  };

  const creditRows = buildCreditRows();

  // Aggregate credits by subject for the summary
  const subjectTotals = {};
  creditRows.forEach(row => {
    if (row.status === 'Completed') {
      subjectTotals[row.subject] = (subjectTotals[row.subject] || 0) + row.credits;
    }
  });

  // Displayed field values (override or default)
  const studentName = field('student_name', `${student.last_name}, ${student.first_name}`);
  const dateIssued = field('date_issued', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));
  const dateOfBirth = field('date_of_birth', student.date_of_birth ? formatDate(student.date_of_birth) : '');
  const orgName = field('organization_name', student.organization_name || '');

  return (
    <div className="min-h-screen bg-gray-100">
      <TranscriptToolbar
        student={student} userId={userId} overrides={overrides}
        downloading={downloading} handleDownloadPdf={handleDownloadPdf}
        showAddForm={showAddForm} setShowAddForm={setShowAddForm}
        setShowTransferModal={setShowTransferModal}
      />

      <PlannedCreditForm
        showAddForm={showAddForm} editingCredit={editingCredit}
        formData={formData} setFormData={setFormData}
        saving={saving} handleSavePlannedCredit={handleSavePlannedCredit}
        resetForm={resetForm}
      />

      <CourseBreakdownEditor
        splitTarget={splitTarget} setSplitTarget={setSplitTarget}
        splitCourses={splitCourses} splitSaving={splitSaving}
        addSplitRow={addSplitRow} removeSplitRow={removeSplitRow}
        updateSplitRow={updateSplitRow} saveSplit={saveSplit} clearSplit={clearSplit}
      />

      <PrintableTranscript
        student={student} studentName={studentName} userId={userId}
        creditRows={creditRows} transferCredits={transfer_credits}
        accreditation={accreditation} isWascAccredited={isWascAccredited}
        orgName={orgName} dateIssued={dateIssued} dateOfBirth={dateOfBirth}
        overrides={overrides} setOverrides={setOverrides}
        updateOverride={updateOverride} saveOverrides={saveOverrides}
        startEdit={startEdit} startSplit={startSplit}
        handleDeletePlannedCredit={handleDeletePlannedCredit}
      />

      {showTransferModal && (
        <TransferToSchoolModal
          userId={userId}
          studentName={`${student.first_name || ''} ${student.last_name || ''}`.trim()}
          generatePdfBase64={generatePdfBase64}
          onClose={() => setShowTransferModal(false)}
        />
      )}

      <TranscriptPrintStyles />
    </div>
  );
};

export default TranscriptGeneratorPage;
