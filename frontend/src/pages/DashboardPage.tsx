import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DocumentArrowUpIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { kycService } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { wsService, KycStatusUpdate } from '../services/websocket';

interface KycStatus {
  overallStatus: string;
  documents: Record<string, {
    id: string;
    status: string;
    documentType: string;
    createdAt: string;
  }>;
  requiredDocuments: string[];
  completedDocuments: string[];
}

const statusIcons = {
  completed: CheckCircleIcon,
  in_review: ClockIcon,
  processing: ClockIcon,
  pending: ClockIcon,
  requires_resubmission: ExclamationTriangleIcon,
};

const statusColors = {
  completed: 'text-green-600 bg-green-100',
  in_review: 'text-purple-600 bg-purple-100',
  processing: 'text-blue-600 bg-blue-100',
  pending: 'text-yellow-600 bg-yellow-100',
  requires_resubmission: 'text-red-600 bg-red-100',
};

const statusLabels = {
  completed: 'Verified',
  in_review: 'In Review',
  processing: 'Processing',
  pending: 'Pending',
  requires_resubmission: 'Action Required',
};

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const [status, setStatus] = useState<KycStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStatus();

    // Subscribe to status updates
    const unsubscribe = wsService.subscribeToKycUpdates(handleStatusUpdate);

    return () => {
      unsubscribe();
    };
  }, []);

  const loadStatus = async () => {
    try {
      const data = await kycService.getStatus();
      setStatus(data);
    } catch (error) {
      console.error('Failed to load KYC status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = (update: KycStatusUpdate) => {
    // Refresh status when we receive an update
    loadStatus();
  };

  const StatusIcon = status ? statusIcons[status.overallStatus as keyof typeof statusIcons] : ClockIcon;
  const statusColor = status ? statusColors[status.overallStatus as keyof typeof statusColors] : '';
  const statusLabel = status ? statusLabels[status.overallStatus as keyof typeof statusLabels] : '';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome section */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.firstName}!
        </h1>
        <p className="text-gray-600 mt-1">
          Track your identity verification progress below.
        </p>
      </div>

      {/* Overall status card */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className={`p-3 rounded-xl ${statusColor}`}>
              <StatusIcon className="w-8 h-8" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">Verification Status</p>
              <p className="text-xl font-semibold text-gray-900">{statusLabel}</p>
            </div>
          </div>

          {status?.overallStatus !== 'completed' && (
            <Link to="/upload" className="btn-primary">
              <DocumentArrowUpIcon className="w-5 h-5 mr-2" />
              Upload Documents
            </Link>
          )}
        </div>

        {/* Progress bar */}
        {status && (
          <div className="mt-6">
            <div className="flex justify-between text-sm text-gray-500 mb-2">
              <span>
                {status.completedDocuments.length} of{' '}
                {status.requiredDocuments.length} documents verified
              </span>
              <span>
                {Math.round(
                  (status.completedDocuments.length /
                    status.requiredDocuments.length) *
                    100
                )}
                %
              </span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-600 transition-all duration-500"
                style={{
                  width: `${
                    (status.completedDocuments.length /
                      status.requiredDocuments.length) *
                    100
                  }%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Document status grid */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Required Documents
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          {status?.requiredDocuments.map((docType) => {
            const doc = status.documents[docType];
            const isCompleted = status.completedDocuments.includes(docType);

            return (
              <div
                key={docType}
                className="card p-4 flex items-center justify-between"
              >
                <div className="flex items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isCompleted
                        ? 'bg-green-100'
                        : doc
                        ? 'bg-yellow-100'
                        : 'bg-gray-100'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircleIcon className="w-6 h-6 text-green-600" />
                    ) : doc ? (
                      <ClockIcon className="w-6 h-6 text-yellow-600" />
                    ) : (
                      <DocumentArrowUpIcon className="w-6 h-6 text-gray-400" />
                    )}
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-900 capitalize">
                      {docType.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-gray-500">
                      {isCompleted
                        ? 'Verified'
                        : doc
                        ? doc.status.replace(/_/g, ' ')
                        : 'Not uploaded'}
                    </p>
                  </div>
                </div>

                {!isCompleted && (
                  <Link
                    to={`/upload?type=${docType}`}
                    className="btn-secondary text-xs"
                  >
                    {doc ? 'View' : 'Upload'}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid md:grid-cols-3 gap-4">
        <Link
          to="/upload"
          className="card p-4 hover:border-primary-300 transition-colors group"
        >
          <DocumentArrowUpIcon className="w-8 h-8 text-primary-600 mb-2" />
          <h3 className="font-medium text-gray-900 group-hover:text-primary-600">
            Upload Documents
          </h3>
          <p className="text-sm text-gray-500">
            Submit your identity documents
          </p>
        </Link>

        <Link
          to="/status"
          className="card p-4 hover:border-primary-300 transition-colors group"
        >
          <ClockIcon className="w-8 h-8 text-primary-600 mb-2" />
          <h3 className="font-medium text-gray-900 group-hover:text-primary-600">
            Check Status
          </h3>
          <p className="text-sm text-gray-500">
            View detailed submission status
          </p>
        </Link>

        <div className="card p-4 bg-gray-50">
          <ExclamationTriangleIcon className="w-8 h-8 text-gray-400 mb-2" />
          <h3 className="font-medium text-gray-900">Need Help?</h3>
          <p className="text-sm text-gray-500">
            Contact support for assistance
          </p>
        </div>
      </div>
    </div>
  );
}
