import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  QueueListIcon,
  CheckCircleIcon,
  ClockIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { reviewService, kycService } from '../../services/api';

interface ReviewStats {
  pendingReviews: number;
  myClaimedReviews: number;
  reviewedToday: number;
  totalReviewed: number;
}

interface Analytics {
  statusDistribution: Record<string, number>;
  last30Days: {
    submissions: number;
    approved: number;
    approvalRate: number;
    avgProcessingTimeHours: number | null;
  };
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsData, analyticsData] = await Promise.all([
        reviewService.getStats(),
        kycService.getAnalytics(),
      ]);
      setStats(statsData);
      setAnalytics(analyticsData);
    } catch (error) {
      console.error('Failed to load admin data:', error);
    } finally {
      setLoading(false);
    }
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600 mt-1">
          Overview of KYC verification queue and statistics
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-xl bg-yellow-100">
              <QueueListIcon className="w-6 h-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">Pending Reviews</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats?.pendingReviews || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-xl bg-blue-100">
              <ClockIcon className="w-6 h-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">My Claimed</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats?.myClaimedReviews || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-xl bg-green-100">
              <CheckCircleIcon className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">Reviewed Today</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats?.reviewedToday || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-xl bg-purple-100">
              <ChartBarIcon className="w-6 h-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">Total Reviewed</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats?.totalReviewed || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid md:grid-cols-2 gap-4">
        <Link
          to="/admin/queue"
          className="card p-6 hover:border-primary-300 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary-600">
                Review Queue
              </h3>
              <p className="text-gray-600 mt-1">
                {stats?.pendingReviews || 0} items waiting for review
              </p>
            </div>
            <QueueListIcon className="w-8 h-8 text-gray-400 group-hover:text-primary-600" />
          </div>
        </Link>

        <Link
          to="/admin/queue?assignedToMe=true"
          className="card p-6 hover:border-primary-300 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary-600">
                My Queue
              </h3>
              <p className="text-gray-600 mt-1">
                {stats?.myClaimedReviews || 0} items assigned to you
              </p>
            </div>
            <ClockIcon className="w-8 h-8 text-gray-400 group-hover:text-primary-600" />
          </div>
        </Link>
      </div>

      {/* Analytics */}
      {analytics && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Last 30 Days Analytics
          </h2>

          <div className="grid sm:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-gray-500">Total Submissions</p>
              <p className="text-3xl font-bold text-gray-900">
                {analytics.last30Days.submissions}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Approved</p>
              <p className="text-3xl font-bold text-green-600">
                {analytics.last30Days.approved}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Approval Rate</p>
              <p className="text-3xl font-bold text-gray-900">
                {analytics.last30Days.approvalRate ?? 0}%
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Avg Processing Time</p>
              <p className="text-3xl font-bold text-gray-900">
                {typeof analytics.last30Days.avgProcessingTimeHours === 'number'
                  ? `${analytics.last30Days.avgProcessingTimeHours.toFixed(1)}h`
                  : 'N/A'}
              </p>
            </div>
          </div>

          {/* Status distribution */}
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              Status Distribution
            </h3>
            <div className="flex gap-4">
              {Object.entries(analytics.statusDistribution).map(
                ([status, count]) => (
                  <div key={status} className="flex items-center">
                    <span
                      className={`badge ${
                        status === 'approved'
                          ? 'badge-approved'
                          : status === 'rejected'
                          ? 'badge-rejected'
                          : status === 'review'
                          ? 'badge-review'
                          : status === 'processing'
                          ? 'badge-processing'
                          : 'badge-pending'
                      }`}
                    >
                      {status.replace(/_/g, ' ')}: {count}
                    </span>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
