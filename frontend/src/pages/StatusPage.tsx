import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { format } from 'date-fns';
import {
  DocumentIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { kycService } from '../services/api';
import StatusTimeline from '../components/status/StatusTimeline';
import { wsService, KycStatusUpdate } from '../services/websocket';
import clsx from 'clsx';

interface Submission {
  id: string;
  status: string;
  documentType: string;
  createdAt: string;
  uploadedAt: string | null;
  processedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

const statusBadgeClass: Record<string, string> = {
  pending_upload: 'badge-pending',
  pending: 'badge-pending',
  processing: 'badge-processing',
  review: 'badge-review',
  approved: 'badge-approved',
  rejected: 'badge-rejected',
};

export default function StatusPage() {
  const { submissionId } = useParams();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    loadSubmissions();

    // Subscribe to status updates
    const unsubscribe = wsService.subscribeToKycUpdates(handleStatusUpdate);

    return () => {
      unsubscribe();
    };
  }, [page]);

  useEffect(() => {
    if (submissionId) {
      loadSubmissionDetail(submissionId);
    }
  }, [submissionId]);

  const loadSubmissions = async () => {
    try {
      const data = await kycService.getSubmissions({ page, limit: 10 });
      setSubmissions(data.submissions);
      setTotalPages(data.pagination.totalPages);
    } catch (error) {
      console.error('Failed to load submissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSubmissionDetail = async (id: string) => {
    try {
      const data = await kycService.getSubmission(id);
      setSelectedSubmission(data);
    } catch (error) {
      console.error('Failed to load submission detail:', error);
    }
  };

  const handleStatusUpdate = (update: KycStatusUpdate) => {
    // Refresh the list
    loadSubmissions();

    // Update selected submission if it matches
    if (selectedSubmission?.id === update.submissionId) {
      loadSubmissionDetail(update.submissionId);
    }
  };

  const getTimelineSteps = (submission: Submission) => {
    const steps = [
      {
        id: 'upload',
        name: 'Document Uploaded',
        description: 'Your document has been received',
        status: submission.uploadedAt ? 'complete' : 'upcoming',
        timestamp: submission.uploadedAt || undefined,
      },
      {
        id: 'processing',
        name: 'AI Processing',
        description: 'Extracting information from your document',
        status:
          submission.status === 'processing'
            ? 'current'
            : submission.processedAt
            ? 'complete'
            : 'upcoming',
        timestamp: submission.processedAt || undefined,
      },
      {
        id: 'review',
        name: 'Human Review',
        description: 'Manual verification by our team',
        status:
          submission.status === 'review'
            ? 'current'
            : submission.reviewedAt
            ? 'complete'
            : 'upcoming',
        timestamp: undefined,
      },
      {
        id: 'complete',
        name:
          submission.status === 'rejected' ? 'Rejected' : 'Verification Complete',
        description:
          submission.status === 'rejected'
            ? submission.rejectionReason || 'Document was rejected'
            : 'Your identity has been verified',
        status:
          submission.status === 'approved'
            ? 'complete'
            : submission.status === 'rejected'
            ? 'failed'
            : 'upcoming',
        timestamp: submission.reviewedAt || undefined,
      },
    ];

    return steps as any[];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Submission Status</h1>
          <p className="text-gray-600 mt-1">
            Track the progress of your document verification
          </p>
        </div>
        <button
          onClick={() => loadSubmissions()}
          className="btn-secondary"
          title="Refresh"
        >
          <ArrowPathIcon className="w-5 h-5" />
        </button>
      </div>

      {submissions.length === 0 ? (
        <div className="card p-12 text-center">
          <DocumentIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No submissions yet
          </h3>
          <p className="text-gray-600 mb-4">
            Upload your first document to get started
          </p>
          <Link to="/upload" className="btn-primary">
            Upload Documents
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-8">
          {/* Submissions list */}
          <div className="md:col-span-1">
            <div className="card divide-y">
              {submissions.map((submission) => (
                <button
                  key={submission.id}
                  onClick={() => setSelectedSubmission(submission)}
                  className={clsx(
                    'w-full text-left p-4 hover:bg-gray-50 transition-colors',
                    selectedSubmission?.id === submission.id && 'bg-primary-50'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 capitalize">
                        {submission.documentType.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-gray-500">
                        {format(
                          new Date(submission.createdAt),
                          'MMM d, yyyy h:mm a'
                        )}
                      </p>
                    </div>
                    <span className={statusBadgeClass[submission.status]}>
                      {submission.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-secondary text-sm"
                >
                  Previous
                </button>
                <span className="px-4 py-2 text-sm text-gray-600">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn-secondary text-sm"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {/* Timeline detail */}
          <div className="md:col-span-2">
            {selectedSubmission ? (
              <div className="card p-6">
                <div className="mb-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900 capitalize">
                      {selectedSubmission.documentType.replace(/_/g, ' ')}
                    </h2>
                    <span className={statusBadgeClass[selectedSubmission.status]}>
                      {selectedSubmission.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    Submitted on{' '}
                    {format(
                      new Date(selectedSubmission.createdAt),
                      'MMMM d, yyyy'
                    )}
                  </p>
                </div>

                {selectedSubmission.status === 'rejected' &&
                  selectedSubmission.rejectionReason && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-start">
                        <ExclamationTriangleIcon className="w-5 h-5 text-red-600 mt-0.5" />
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-red-800">
                            Document Rejected
                          </h3>
                          <p className="text-sm text-red-700 mt-1">
                            {selectedSubmission.rejectionReason}
                          </p>
                          <Link
                            to={`/upload?type=${selectedSubmission.documentType}`}
                            className="inline-block mt-3 text-sm text-red-700 font-medium hover:underline"
                          >
                            Upload new document
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}

                <StatusTimeline steps={getTimelineSteps(selectedSubmission)} />
              </div>
            ) : (
              <div className="card p-12 text-center">
                <p className="text-gray-500">
                  Select a submission to view details
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
