import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  ArrowPathIcon,
  FunnelIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { reviewService } from '../../services/api';
import clsx from 'clsx';
import toast from 'react-hot-toast';

interface QueueItem {
  id: string;
  submissionId: string;
  assignedTo: string | null;
  priority: number;
  queuedAt: string;
  claimedAt: string | null;
  submission: {
    id: string;
    documentType: string;
    status: string;
    createdAt: string;
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
    };
  };
  assignee: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
}

const priorityColors = {
  1: 'bg-gray-100 text-gray-800',
  2: 'bg-blue-100 text-blue-800',
  3: 'bg-yellow-100 text-yellow-800',
  4: 'bg-orange-100 text-orange-800',
  5: 'bg-red-100 text-red-800',
};

export default function ReviewQueuePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const assignedToMe = searchParams.get('assignedToMe') === 'true';
  const priorityFilter = searchParams.get('priority');

  useEffect(() => {
    loadQueue();
  }, [page, assignedToMe, priorityFilter]);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const data = await reviewService.getQueue({
        page,
        limit: 20,
        assignedToMe: assignedToMe || undefined,
        priority: priorityFilter ? parseInt(priorityFilter) : undefined,
      });
      setItems(data.items);
      setTotalPages(data.pagination.totalPages);
    } catch (error) {
      console.error('Failed to load queue:', error);
      toast.error('Failed to load review queue');
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async (queueId: string) => {
    try {
      await reviewService.claimItem(queueId);
      toast.success('Item claimed');
      loadQueue();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to claim item');
    }
  };

  const handleRelease = async (queueId: string) => {
    try {
      await reviewService.releaseItem(queueId);
      toast.success('Item released');
      loadQueue();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to release item');
    }
  };

  const toggleFilter = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (newParams.get(key) === value) {
      newParams.delete(key);
    } else {
      newParams.set(key, value);
    }
    setSearchParams(newParams);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
          <p className="text-gray-600 mt-1">
            Documents waiting for manual verification
          </p>
        </div>
        <button
          onClick={loadQueue}
          className="btn-secondary"
          disabled={loading}
        >
          <ArrowPathIcon
            className={clsx('w-5 h-5', loading && 'animate-spin')}
          />
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <FunnelIcon className="w-5 h-5 text-gray-400" />
            <span className="text-sm text-gray-600">Filters:</span>
          </div>

          <button
            onClick={() => toggleFilter('assignedToMe', 'true')}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              assignedToMe
                ? 'bg-primary-100 text-primary-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            <UserIcon className="w-4 h-4 inline mr-1" />
            My Items
          </button>

          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">Priority:</span>
            {[1, 2, 3, 4, 5].map((p) => (
              <button
                key={p}
                onClick={() => toggleFilter('priority', p.toString())}
                className={clsx(
                  'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
                  priorityFilter === p.toString()
                    ? priorityColors[p as keyof typeof priorityColors]
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Queue table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No items in queue</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Document
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Queued
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assigned To
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {item.submission.user.firstName}{' '}
                        {item.submission.user.lastName}
                      </p>
                      <p className="text-sm text-gray-500">
                        {item.submission.user.email}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-900 capitalize">
                      {item.submission.documentType.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={clsx(
                        'badge',
                        priorityColors[item.priority as keyof typeof priorityColors]
                      )}
                    >
                      P{item.priority}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(item.queuedAt), 'MMM d, h:mm a')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {item.assignee ? (
                      <span className="text-sm text-gray-900">
                        {item.assignee.firstName} {item.assignee.lastName}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">Unassigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex justify-end gap-2">
                      {item.assignedTo ? (
                        <>
                          <button
                            onClick={() => handleRelease(item.id)}
                            className="btn-secondary text-xs"
                          >
                            Release
                          </button>
                          <Link
                            to={`/admin/review/${item.id}`}
                            className="btn-primary text-xs"
                          >
                            Review
                          </Link>
                        </>
                      ) : (
                        <button
                          onClick={() => handleClaim(item.id)}
                          className="btn-primary text-xs"
                        >
                          Claim
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-secondary"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-sm text-gray-600">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="btn-secondary"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
