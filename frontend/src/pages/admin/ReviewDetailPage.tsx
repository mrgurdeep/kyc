import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  CheckCircleIcon,
  XCircleIcon,
  ArrowLeftIcon,
  DocumentIcon,
} from '@heroicons/react/24/outline';
import { reviewService } from '../../services/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface ReviewItem {
  id: string;
  submissionId: string;
  priority: number;
  queuedAt: string;
  submission: {
    id: string;
    documentType: string;
    s3Key: string;
    status: string;
    createdAt: string;
    extractedData: Array<{
      id: string;
      fieldName: string;
      value: string;
      confidenceScore: number;
    }>;
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
    };
    auditLogs: Array<{
      id: string;
      action: string;
      details: object;
      createdAt: string;
    }>;
  };
}

export default function ReviewDetailPage() {
  const { queueId } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<ReviewItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  useEffect(() => {
    if (queueId) {
      loadItem();
    }
  }, [queueId]);

  const loadItem = async () => {
    try {
      const data = await reviewService.getItem(queueId!);
      setItem(data);
    } catch (error) {
      console.error('Failed to load review item:', error);
      toast.error('Failed to load review item');
      navigate('/admin/queue');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      await reviewService.submitDecision(queueId!, {
        action: 'approve',
      });
      toast.success('Document approved');
      navigate('/admin/queue');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to approve');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    setSubmitting(true);
    try {
      await reviewService.submitDecision(queueId!, {
        action: 'reject',
        reason: rejectionReason,
      });
      toast.success('Document rejected');
      navigate('/admin/queue');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to reject');
    } finally {
      setSubmitting(false);
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.9) return 'text-green-600 bg-green-100';
    if (score >= 0.7) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!item) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin/queue')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Review Document</h1>
            <p className="text-gray-600">
              {item.submission.user.firstName} {item.submission.user.lastName} -{' '}
              <span className="capitalize">
                {item.submission.documentType.replace(/_/g, ' ')}
              </span>
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowRejectModal(true)}
            disabled={submitting}
            className="btn-danger"
          >
            <XCircleIcon className="w-5 h-5 mr-2" />
            Reject
          </button>
          <button
            onClick={handleApprove}
            disabled={submitting}
            className="btn-success"
          >
            <CheckCircleIcon className="w-5 h-5 mr-2" />
            Approve
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Document preview */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Document Preview
          </h2>
          <div className="bg-gray-100 rounded-lg aspect-[4/3] flex items-center justify-center">
            <div className="text-center">
              <DocumentIcon className="w-16 h-16 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">Document preview</p>
              <p className="text-sm text-gray-400">
                S3 Key: {item.submission.s3Key}
              </p>
            </div>
          </div>
        </div>

        {/* Extracted data */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Extracted Information
          </h2>

          {item.submission.extractedData.length === 0 ? (
            <p className="text-gray-500">No data extracted yet</p>
          ) : (
            <div className="space-y-3">
              {item.submission.extractedData.map((field) => (
                <div
                  key={field.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="text-sm text-gray-500 capitalize">
                      {field.fieldName.replace(/_/g, ' ')}
                    </p>
                    <p className="font-medium text-gray-900">{field.value}</p>
                  </div>
                  <span
                    className={clsx(
                      'badge',
                      getConfidenceColor(field.confidenceScore)
                    )}
                  >
                    {Math.round(field.confidenceScore * 100)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* User info & audit log */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* User info */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            User Information
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-gray-500">Name</dt>
              <dd className="font-medium text-gray-900">
                {item.submission.user.firstName} {item.submission.user.lastName}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Email</dt>
              <dd className="font-medium text-gray-900">
                {item.submission.user.email}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Submitted</dt>
              <dd className="font-medium text-gray-900">
                {format(new Date(item.submission.createdAt), 'PPpp')}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Queued</dt>
              <dd className="font-medium text-gray-900">
                {format(new Date(item.queuedAt), 'PPpp')}
              </dd>
            </div>
          </dl>
        </div>

        {/* Audit log */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Activity Log
          </h2>
          {item.submission.auditLogs.length === 0 ? (
            <p className="text-gray-500">No activity yet</p>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {item.submission.auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 text-sm"
                >
                  <div className="w-2 h-2 rounded-full bg-gray-400 mt-1.5" />
                  <div>
                    <p className="text-gray-900 capitalize">
                      {log.action.replace(/_/g, ' ')}
                    </p>
                    <p className="text-gray-500 text-xs">
                      {format(new Date(log.createdAt), 'PPpp')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Reject modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Reject Document
            </h3>
            <p className="text-gray-600 mb-4">
              Please provide a reason for rejection. This will be shown to the
              user.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason..."
              className="input h-32 resize-none"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowRejectModal(false)}
                className="btn-secondary"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                className="btn-danger"
                disabled={submitting || !rejectionReason.trim()}
              >
                {submitting ? 'Rejecting...' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
