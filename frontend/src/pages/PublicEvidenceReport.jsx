/**
 * PublicEvidenceReport - Public page for viewing evidence reports
 *
 * Displays the evidence report data fetched by access token.
 * No authentication required. Includes PDF download button.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import html2pdf from 'html2pdf.js';
import api from '../services/api';
import UnifiedEvidenceDisplay from '../components/evidence/UnifiedEvidenceDisplay';
import { getPillarDisplayName } from '../config/pillars';
import logger from '../utils/logger';

// Format pillar name with proper capitalization (STEM stays uppercase)
const formatPillarName = (pillar) => {
  if (!pillar) return '-';
  const lower = pillar.toLowerCase();
  if (lower === 'stem') return 'STEM';
  return pillar.charAt(0).toUpperCase() + pillar.slice(1).toLowerCase();
};

// Render evidence block to HTML for PDF
const renderEvidenceBlock = (block) => {
  const blockType = block.block_type || block.type || 'text';
  const content = block.content || {};

  switch (blockType) {
    case 'text':
      // Split text into lines and wrap each to prevent mid-line breaks
      const lines = (content.text || '').split('\n');
      return lines.map(line =>
        line.trim() === ''
          ? '<div style="height: 8px;"></div>'
          : `<p style="margin: 2px 0; font-size: 11px; color: #444; page-break-inside: avoid;">${line}</p>`
      ).join('');

    case 'image':
      return `<div style="margin: 8px 0; page-break-inside: avoid;"><img src="${content.url || ''}" style="max-width: 200px; max-height: 150px; border: 1px solid #ddd; border-radius: 4px;" /></div>`;

    case 'link':
      return `<p style="margin: 4px 0; font-size: 11px; page-break-inside: avoid;"><a href="${content.url || '#'}" style="color: #6D469B;">${content.title || content.url || 'Link'}</a></p>`;

    case 'video':
      return `<p style="margin: 4px 0; font-size: 11px; page-break-inside: avoid;"><a href="${content.url || '#'}" style="color: #6D469B;">[Video] ${content.title || content.url || 'Video link'}</a></p>`;

    case 'document':
      return `<p style="margin: 4px 0; font-size: 11px; page-break-inside: avoid;"><a href="${content.url || '#'}" style="color: #6D469B;">[Document] ${content.name || content.filename || 'Download'}</a></p>`;

    default:
      return `<p style="margin: 4px 0; font-size: 11px; color: #666; page-break-inside: avoid;">[${blockType}]</p>`;
  }
};

// Generate simple document-style HTML for PDF
const generatePDFContent = (reportData, studentName) => {
  const { report, achievements, skills_breakdown } = reportData || {};
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  let html = `
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
    <div style="font-family: 'Poppins', sans-serif; font-size: 12px; line-height: 1.5; color: #333; padding: 20px;">
      <!-- Header -->
      <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #6D469B; padding-bottom: 20px;">
        <img src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png" style="height: 40px; margin-bottom: 15px;" />
        <h1 style="font-size: 22px; margin: 0 0 5px 0; color: #333; font-weight: 600;">${report?.title || 'Evidence Report'}</h1>
        <p style="font-size: 14px; margin: 0; color: #6D469B; font-weight: 600;">${studentName}</p>
        ${report?.description ? `<p style="font-size: 12px; margin: 10px 0 0 0; color: #666;">${report.description}</p>` : ''}
        <p style="font-size: 10px; margin: 10px 0 0 0; color: #999;">Generated: ${date}</p>
      </div>
  `;

  // Quests/Evidence Section
  if (achievements && achievements.length > 0) {
    achievements.forEach((achievement) => {
      // Quest header - keep together
      html += `
        <div style="margin-bottom: 25px;">
          <div style="background: #f5f5f5; padding: 10px 15px 16px 15px; border-left: 4px solid #6D469B; page-break-inside: avoid;">
            <h2 style="font-size: 16px; margin: 0; color: #333; font-weight: 600;">${achievement.quest?.title || 'Quest'}</h2>
            ${achievement.quest?.description ? `<p style="font-size: 11px; margin: 5px 0 0 0; color: #666;">${achievement.quest.description}</p>` : ''}
            <p style="font-size: 11px; margin: 5px 0 0 0;"><strong>Status:</strong> ${achievement.status === 'completed' ? 'Completed' : 'In Progress'}</p>
          </div>

          <!-- Tasks Table -->
          <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px;">
            <thead>
              <tr style="background: #eee;">
                <th style="text-align: left; padding: 8px; border: 1px solid #ddd; font-weight: 600;">Task</th>
                <th style="text-align: left; padding: 8px; border: 1px solid #ddd; width: 100px; font-weight: 600;">Category</th>
                <th style="text-align: right; padding: 8px; border: 1px solid #ddd; width: 60px; font-weight: 600;">XP</th>
              </tr>
            </thead>
            <tbody>
      `;

      if (achievement.task_evidence) {
        Object.entries(achievement.task_evidence).forEach(([taskTitle, evidence]) => {
          html += `
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;">${taskTitle}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${formatPillarName(evidence.pillar)}</td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">+${evidence.xp_awarded || 0}</td>
              </tr>
          `;
        });
      }

      html += `
            </tbody>
          </table>

          <!-- Evidence Section -->
          <div style="margin-top: 15px;">
            <h3 style="font-size: 13px; margin: 0 0 10px 0; color: #333; font-weight: 600;">Evidence</h3>
      `;

      if (achievement.task_evidence) {
        Object.entries(achievement.task_evidence).forEach(([taskTitle, evidence]) => {
          const blocks = evidence.evidence_blocks || [];
          if (blocks.length > 0) {
            // Each task's evidence can break across pages
            html += `
              <div style="margin-bottom: 12px; padding-left: 10px; border-left: 2px solid #ddd;">
                <p style="font-size: 11px; font-weight: 600; color: #555; margin: 0 0 6px 0;">${taskTitle}:</p>
            `;
            blocks.forEach(block => {
              if (!block.is_private) {
                html += renderEvidenceBlock(block);
              }
            });
            html += `</div>`;
          }
        });
      }

      html += `
          </div>
        </div>
      `;
    });
  }

  // Skills
  if (skills_breakdown && skills_breakdown.length > 0) {
    html += `
      <div style="margin-top: 20px; page-break-inside: avoid;">
        <h2 style="font-size: 14px; margin: 0 0 10px 0; border-bottom: 1px solid #ddd; padding-bottom: 5px; font-weight: 600;">Skills Practiced</h2>
        <p style="font-size: 11px; color: #666;">
          ${skills_breakdown.map(s => `${s.skill_name}${s.times_practiced > 1 ? ` (${s.times_practiced}x)` : ''}`).join(', ')}
        </p>
      </div>
    `;
  }

  // Footer
  html += `
      <div style="margin-top: 40px; padding-top: 15px; border-top: 1px solid #ddd; text-align: center; font-size: 10px; color: #999;">
        <p style="margin: 0;">Generated from Optio - www.optioeducation.com</p>
      </div>
    </div>
  `;

  return html;
};

const PublicEvidenceReport = () => {
  const { token } = useParams();
  const navigate = useNavigate();

  const [reportData, setReportData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await api.get(`/api/public/report/${token}`);
        setReportData(response.data.data);
      } catch (err) {
        logger.error('Error fetching public report:', err);
        const message = err.response?.data?.error?.message || 'Report not found';
        const code = err.response?.data?.error?.code;

        if (code === 'PERMISSION_DENIED') {
          setError({
            type: 'pending',
            message: message
          });
        } else {
          setError({
            type: 'not_found',
            message: 'This report is not available. It may have been deleted or the link is invalid.'
          });
        }
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchReport();
    }
  }, [token]);

  const handleDownloadPDF = async () => {
    if (!reportData) return;

    try {
      setIsDownloading(true);

      // Build filename with student initials and date
      const title = reportData?.report?.title || 'Evidence Report';
      const safeTitle = title.replace(/[^a-z0-9\s-]/gi, '').trim().replace(/\s+/g, '_');

      // Get student initials
      const firstName = reportData?.student?.first_name || '';
      const lastName = reportData?.student?.last_name || '';
      const initials = (firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || 'XX';

      // Format date as YYYY-MM-DD
      const date = new Date().toISOString().split('T')[0];

      // Get student name for PDF header
      const student = reportData?.student;
      const pdfStudentName = student?.display_name ||
        `${student?.first_name || ''} ${student?.last_name || ''}`.trim() ||
        'Student';

      // Generate document-style HTML content (tables, no website styling)
      const pdfHtml = generatePDFContent(reportData, pdfStudentName);

      const options = {
        margin: [10, 10, 10, 10],
        filename: `${safeTitle}_${initials}_${date}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
          logging: false
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait'
        },
        pagebreak: { mode: 'css' }
      };

      // html2pdf can accept HTML string directly
      await html2pdf().set(options).from(pdfHtml, 'string').save();
    } catch (err) {
      logger.error('Error generating PDF:', err);
      alert('Failed to generate PDF. Please try using your browser\'s print function (Ctrl/Cmd + P).');
    } finally {
      setIsDownloading(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 py-12">
          <div className="animate-pulse space-y-8">
            {/* Header skeleton */}
            <div className="text-center">
              <div className="h-8 bg-gray-200 rounded w-48 mx-auto mb-4"></div>
              <div className="h-10 bg-gray-200 rounded w-64 mx-auto mb-2"></div>
              <div className="h-6 bg-gray-200 rounded w-40 mx-auto"></div>
            </div>
            {/* Content skeleton */}
            <div className="space-y-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-xl p-6">
                  <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
                  <div className="h-32 bg-gray-200 rounded"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center px-4">
          <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6 ${
            error.type === 'pending' ? 'bg-yellow-100' : 'bg-red-100'
          }`}>
            {error.type === 'pending' ? (
              <svg className="w-10 h-10 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-10 h-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {error.type === 'pending' ? 'Report Pending Approval' : 'Report Not Found'}
          </h1>
          <p className="text-gray-600 mb-6">{error.message}</p>
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Go to Homepage
          </button>
        </div>
      </div>
    );
  }

  const { report, student, achievements, xp_summary, skills_breakdown, learning_events } = reportData || {};

  // Get student display name
  const studentName = student?.display_name ||
    `${student?.first_name || ''} ${student?.last_name || ''}`.trim() ||
    'Student';

  return (
    <>
      <Helmet>
        <title>{report?.title || 'Evidence Report'} | Optio</title>
        <meta name="description" content={`Evidence report by ${studentName}`} />
      </Helmet>

      <div className="min-h-screen bg-gray-50">
        {/* Main Content Area */}
        <div className="bg-white">
          {/* Report Header with Logo and Download Button */}
          <div className="bg-white border-b border-gray-200">
            <div className="max-w-5xl mx-auto px-4 py-8">
              {/* Logo centered */}
              <div className="flex justify-center mb-6">
                <img
                  src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png"
                  alt="Optio Education"
                  className="h-12"
                />
              </div>

              {/* Report Title and Student Info */}
              <div className="text-center mb-6">
                <h1 className="text-3xl font-bold text-gray-900">{report?.title}</h1>
                <p className="text-xl text-optio-purple font-medium mt-2">{studentName}</p>
                {report?.description && (
                  <p className="text-gray-600 mt-2 max-w-2xl mx-auto">{report.description}</p>
                )}
              </div>

              {/* Download Button - hidden in PDF */}
              <div data-pdf-hide className="flex justify-center print:hidden">
                <button
                  onClick={handleDownloadPDF}
                  disabled={isDownloading}
                  className="inline-flex items-center px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {isDownloading ? (
                    <>
                      <svg className="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Generating...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download PDF
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="max-w-5xl mx-auto px-4 py-8">
            {/* Completed Quests - Main Focus */}
            {achievements && achievements.length > 0 && (
              <div className="space-y-8 mb-12">
                {achievements.map((achievement, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden pdf-page-break"
                    style={{ pageBreakInside: 'avoid' }}
                  >
                    {/* Quest Header - More Prominent */}
                    <div className="bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 p-6 border-b border-gray-200">
                      <div className="flex items-center gap-3 mb-2">
                        {achievement.status === 'completed' ? (
                          <span className="inline-flex items-center px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
                            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            Completed
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
                            In Progress
                          </span>
                        )}
                      </div>
                      <h2 className="text-2xl font-bold text-gray-900">
                        {achievement.quest?.title}
                      </h2>
                      {achievement.quest?.description && (
                        <p className="text-gray-600 mt-2">
                          {achievement.quest.description}
                        </p>
                      )}
                    </div>

                    {/* Task Evidence with XP Attribution */}
                    {achievement.task_evidence && Object.keys(achievement.task_evidence).length > 0 && (
                      <div className="p-6">
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                          Tasks Completed ({Object.keys(achievement.task_evidence).length})
                        </h3>

                        {/* XP Summary Table */}
                        <div className="overflow-x-auto mb-6">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="bg-gray-100">
                                <th className="text-left py-2 px-3 font-semibold text-gray-700 border border-gray-200">Task</th>
                                <th className="text-left py-2 px-3 font-semibold text-gray-700 border border-gray-200 w-28">Category</th>
                                <th className="text-right py-2 px-3 font-semibold text-gray-700 border border-gray-200 w-20">XP</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(achievement.task_evidence).map(([taskTitle, evidence], idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                  <td className="py-2 px-3 border border-gray-200 text-gray-900">{taskTitle}</td>
                                  <td className="py-2 px-3 border border-gray-200 text-gray-600 capitalize">
                                    {formatPillarName(evidence.pillar)}
                                  </td>
                                  <td className="py-2 px-3 border border-gray-200 text-right font-medium text-green-600">
                                    +{evidence.xp_awarded || 0}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Evidence Details */}
                        <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Evidence</h4>
                        <div className="space-y-6">
                          {Object.entries(achievement.task_evidence).map(([taskTitle, evidence], taskIdx) => (
                            <div key={taskIdx} className="border-l-4 border-optio-purple pl-4">
                              <h4 className="font-semibold text-gray-900 text-lg mb-3">{taskTitle}</h4>
                              <UnifiedEvidenceDisplay
                                evidence={evidence}
                                displayMode="full"
                                showMetadata={false}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Skills Breakdown */}
            {skills_breakdown && skills_breakdown.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Skills Practiced</h2>
                <div className="flex flex-wrap gap-2">
                  {skills_breakdown.map((skill, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium"
                    >
                      {skill.skill_name}
                      {skill.times_practiced > 1 && (
                        <span className="ml-1 text-purple-600">({skill.times_practiced}x)</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Learning Events */}
            {learning_events && learning_events.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Learning Events</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  {learning_events.map((event, idx) => (
                    <div
                      key={idx}
                      className="bg-gray-50 rounded-lg p-4"
                    >
                      <h4 className="font-medium text-gray-900">{event.title}</h4>
                      {event.description && (
                        <p className="text-gray-600 text-sm mt-1 line-clamp-2">
                          {event.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                        {event.category && (
                          <span className="px-2 py-0.5 bg-pink-100 text-pink-700 rounded">
                            {event.category}
                          </span>
                        )}
                        {event.created_at && (
                          <span>
                            {new Date(event.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {(!achievements || achievements.length === 0) &&
              (!learning_events || learning_events.length === 0) && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                  <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-gray-500">No evidence to display in this report.</p>
                </div>
              )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 mt-12">
            <div className="max-w-5xl mx-auto px-4 py-6 text-center">
              <p className="text-sm text-gray-500">
                Generated from{' '}
                <a
                  href="https://www.optioeducation.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-optio-purple hover:underline"
                >
                  Optio Education
                </a>
                {' '}- The Process Is The Goal
              </p>
              {report?.view_count > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  Viewed {report.view_count} time{report.view_count !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
        </div>
        {/* End Main Content */}
      </div>
    </>
  );
};

export default PublicEvidenceReport;
