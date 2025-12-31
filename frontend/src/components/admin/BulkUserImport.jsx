import React, { useState, useCallback, useRef } from 'react';
import api from '../../services/api';

/**
 * BulkUserImport Component
 *
 * Allows org admins to import multiple users via CSV file.
 * Supports validation preview before import.
 */
export default function BulkUserImport({ organizationId, onImportComplete }) {
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [step, setStep] = useState('upload'); // upload, preview, importing, results
  const [validationResult, setValidationResult] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setError('');

    const droppedFile = e.dataTransfer?.files?.[0];
    if (droppedFile) {
      if (!droppedFile.name.toLowerCase().endsWith('.csv')) {
        setError('Please upload a CSV file');
        return;
      }
      setFile(droppedFile);
      validateFile(droppedFile);
    }
  }, [organizationId]);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
        setError('Please upload a CSV file');
        return;
      }
      setFile(selectedFile);
      setError('');
      validateFile(selectedFile);
    }
  };

  const validateFile = async (fileToValidate) => {
    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', fileToValidate);

    try {
      const response = await api.post(
        `/api/admin/organizations/${organizationId}/users/bulk-import/validate`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      setValidationResult(response.data);
      setStep('preview');
    } catch (err) {
      const errorData = err.response?.data;
      if (errorData?.validation_errors) {
        setValidationResult({
          success: false,
          total_rows: errorData.total_rows,
          valid_count: 0,
          invalid_count: errorData.failed_rows,
          valid_rows: [],
          invalid_rows: errorData.validation_errors,
          can_import: false
        });
        setStep('preview');
      } else {
        setError(errorData?.error || 'Failed to validate file');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setLoading(true);
    setError('');
    setStep('importing');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await api.post(
        `/api/admin/organizations/${organizationId}/users/bulk-import`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      setImportResult(response.data);
      setStep('results');

      if (onImportComplete) {
        onImportComplete(response.data);
      }
    } catch (err) {
      const errorData = err.response?.data;
      if (errorData?.validation_errors) {
        setValidationResult({
          success: false,
          invalid_rows: errorData.validation_errors,
          can_import: false
        });
        setStep('preview');
        setError('Validation errors found. Please fix and try again.');
      } else {
        setError(errorData?.error || 'Import failed');
        setStep('preview');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get(
        `/api/admin/organizations/${organizationId}/users/bulk-import/template`,
        { responseType: 'blob' }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'bulk_import_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download template');
    }
  };

  const handleReset = () => {
    setFile(null);
    setStep('upload');
    setValidationResult(null);
    setImportResult(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const downloadResults = () => {
    if (!importResult?.results) return;

    const lines = ['email,status,temp_password,error'];
    importResult.results.forEach(r => {
      const line = [
        r.email,
        r.status,
        r.status === 'created' ? r.temp_password : '',
        r.error || ''
      ].map(v => `"${(v || '').replace(/"/g, '""')}"`).join(',');
      lines.push(line);
    });

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'import_results.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Bulk User Import</h2>
          <p className="text-sm text-gray-600 mt-1">
            Import multiple users at once using a CSV file
          </p>
        </div>
        <button
          onClick={handleDownloadTemplate}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download Template
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-100 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Upload Step */}
      {step === 'upload' && (
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            dragActive
              ? 'border-optio-purple bg-optio-purple/5'
              : 'border-gray-200 hover:border-gray-300'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
            id="csv-upload"
          />

          <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>

          <p className="text-gray-600 mb-2">
            Drag and drop your CSV file here, or{' '}
            <label
              htmlFor="csv-upload"
              className="text-optio-purple hover:underline cursor-pointer font-medium"
            >
              browse
            </label>
          </p>
          <p className="text-sm text-gray-500">
            CSV with columns: email, first_name, last_name, role (optional), date_of_birth (optional)
          </p>

          {loading && (
            <div className="mt-4 flex items-center justify-center gap-2 text-gray-600">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-optio-purple"></div>
              Validating file...
            </div>
          )}
        </div>
      )}

      {/* Preview Step */}
      {step === 'preview' && validationResult && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <span className="text-sm text-gray-600">File: </span>
              <span className="font-medium">{file?.name}</span>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <span className="text-gray-600">
                Total: <strong>{validationResult.total_rows}</strong>
              </span>
              <span className="text-green-600">
                Valid: <strong>{validationResult.valid_count}</strong>
              </span>
              {validationResult.invalid_count > 0 && (
                <span className="text-red-600">
                  Invalid: <strong>{validationResult.invalid_count}</strong>
                </span>
              )}
            </div>
          </div>

          {/* Validation Errors */}
          {validationResult.invalid_rows?.length > 0 && (
            <div className="border border-red-200 rounded-lg overflow-hidden">
              <div className="bg-red-50 px-4 py-2 border-b border-red-200">
                <h3 className="font-medium text-red-800">Validation Errors</h3>
              </div>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-red-50 text-red-700">
                    <tr>
                      <th className="px-4 py-2 text-left">Row</th>
                      <th className="px-4 py-2 text-left">Email</th>
                      <th className="px-4 py-2 text-left">Errors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-100">
                    {validationResult.invalid_rows.map((row, idx) => (
                      <tr key={idx} className="text-red-700">
                        <td className="px-4 py-2">{row.row}</td>
                        <td className="px-4 py-2">{row.email}</td>
                        <td className="px-4 py-2">
                          {(row.errors || []).join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Valid Users Preview */}
          {validationResult.valid_rows?.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <h3 className="font-medium text-gray-800">
                  Users to Import ({validationResult.valid_count})
                </h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-4 py-2 text-left">Email</th>
                      <th className="px-4 py-2 text-left">Name</th>
                      <th className="px-4 py-2 text-left">Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {validationResult.valid_rows.map((row, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-2">{row.email}</td>
                        <td className="px-4 py-2">{row.first_name} {row.last_name}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            row.role === 'advisor' ? 'bg-blue-100 text-blue-700' :
                            row.role === 'parent' ? 'bg-green-100 text-green-700' :
                            row.role === 'org_admin' ? 'bg-purple-100 text-purple-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {row.role}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {validationResult.valid_count > 20 && (
                <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-sm text-gray-500">
                  Showing first 20 of {validationResult.valid_count} users
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <button
              onClick={handleReset}
              className="px-4 py-2 text-gray-600 hover:text-gray-900"
            >
              Upload Different File
            </button>

            <button
              onClick={handleImport}
              disabled={!validationResult.can_import || loading}
              className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Importing...' : `Import ${validationResult.valid_count} Users`}
            </button>
          </div>
        </div>
      )}

      {/* Importing Step */}
      {step === 'importing' && (
        <div className="py-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple mx-auto mb-4"></div>
          <p className="text-gray-600">Importing users...</p>
          <p className="text-sm text-gray-500 mt-1">This may take a moment</p>
        </div>
      )}

      {/* Results Step */}
      {step === 'results' && importResult && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-green-600">{importResult.created}</div>
              <div className="text-sm text-green-700">Created</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-yellow-600">{importResult.skipped}</div>
              <div className="text-sm text-yellow-700">Skipped</div>
            </div>
            <div className="bg-red-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-red-600">{importResult.failed}</div>
              <div className="text-sm text-red-700">Failed</div>
            </div>
          </div>

          {/* Created Users with Passwords */}
          {importResult.results?.filter(r => r.status === 'created').length > 0 && (
            <div className="border border-green-200 rounded-lg overflow-hidden">
              <div className="bg-green-50 px-4 py-2 border-b border-green-200 flex items-center justify-between">
                <h3 className="font-medium text-green-800">Created Users</h3>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => alert('Welcome email feature coming soon! For now, please download the results CSV and share login credentials with your users manually.')}
                    className="text-sm text-green-700 hover:text-green-900 flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Send Welcome Emails
                  </button>
                  <button
                    onClick={downloadResults}
                    className="text-sm text-green-700 hover:text-green-900 flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download Results
                  </button>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-green-50 text-green-700">
                    <tr>
                      <th className="px-4 py-2 text-left">Email</th>
                      <th className="px-4 py-2 text-left">Temporary Password</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-green-100">
                    {importResult.results
                      .filter(r => r.status === 'created')
                      .map((result, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2">{result.email}</td>
                          <td className="px-4 py-2 font-mono text-sm bg-gray-50">{result.temp_password}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 bg-yellow-50 border-t border-yellow-200">
                <div className="flex items-start gap-2 text-sm text-yellow-800">
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>
                    <strong>Important:</strong> Download or save these temporary passwords now. They cannot be retrieved later. Users should change their password after first login.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Failed Users */}
          {importResult.results?.filter(r => r.status === 'failed').length > 0 && (
            <div className="border border-red-200 rounded-lg overflow-hidden">
              <div className="bg-red-50 px-4 py-2 border-b border-red-200">
                <h3 className="font-medium text-red-800">Failed</h3>
              </div>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-red-50 text-red-700">
                    <tr>
                      <th className="px-4 py-2 text-left">Email</th>
                      <th className="px-4 py-2 text-left">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-100">
                    {importResult.results
                      .filter(r => r.status === 'failed')
                      .map((result, idx) => (
                        <tr key={idx} className="text-red-700">
                          <td className="px-4 py-2">{result.email}</td>
                          <td className="px-4 py-2">{result.error}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end pt-4 border-t border-gray-200">
            <button
              onClick={handleReset}
              className="px-6 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200"
            >
              Import More Users
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
