import { CheckIcon, ClockIcon, XMarkIcon } from '@heroicons/react/24/solid';
import clsx from 'clsx';

interface StatusStep {
  id: string;
  name: string;
  description: string;
  status: 'complete' | 'current' | 'upcoming' | 'failed';
  timestamp?: string;
}

interface StatusTimelineProps {
  steps: StatusStep[];
}

export default function StatusTimeline({ steps }: StatusTimelineProps) {
  return (
    <nav aria-label="Progress">
      <ol className="overflow-hidden">
        {steps.map((step, stepIdx) => (
          <li
            key={step.id}
            className={clsx(
              stepIdx !== steps.length - 1 ? 'pb-8' : '',
              'relative'
            )}
          >
            {stepIdx !== steps.length - 1 && (
              <div
                className={clsx(
                  'absolute left-4 top-4 -ml-px mt-0.5 h-full w-0.5',
                  step.status === 'complete' || step.status === 'current'
                    ? 'bg-primary-600'
                    : 'bg-gray-200'
                )}
                aria-hidden="true"
              />
            )}
            <div className="group relative flex items-start">
              <span className="flex h-9 items-center" aria-hidden="true">
                <span
                  className={clsx(
                    'relative z-10 flex h-8 w-8 items-center justify-center rounded-full',
                    step.status === 'complete'
                      ? 'bg-primary-600'
                      : step.status === 'current'
                      ? 'border-2 border-primary-600 bg-white'
                      : step.status === 'failed'
                      ? 'bg-red-600'
                      : 'border-2 border-gray-300 bg-white'
                  )}
                >
                  {step.status === 'complete' ? (
                    <CheckIcon className="h-5 w-5 text-white" />
                  ) : step.status === 'current' ? (
                    <ClockIcon className="h-5 w-5 text-primary-600 animate-pulse" />
                  ) : step.status === 'failed' ? (
                    <XMarkIcon className="h-5 w-5 text-white" />
                  ) : (
                    <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
                  )}
                </span>
              </span>
              <span className="ml-4 flex min-w-0 flex-col">
                <span
                  className={clsx(
                    'text-sm font-medium',
                    step.status === 'complete' || step.status === 'current'
                      ? 'text-gray-900'
                      : step.status === 'failed'
                      ? 'text-red-600'
                      : 'text-gray-500'
                  )}
                >
                  {step.name}
                </span>
                <span className="text-sm text-gray-500">{step.description}</span>
                {step.timestamp && (
                  <span className="text-xs text-gray-400 mt-1">
                    {new Date(step.timestamp).toLocaleString()}
                  </span>
                )}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </nav>
  );
}
