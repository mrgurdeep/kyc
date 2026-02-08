import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  CloudArrowUpIcon,
  DocumentIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { uploadService } from '../../services/api';

interface DocumentUploadProps {
  documentType: string;
  documentLabel: string;
  onUploadComplete: (submissionId: string) => void;
  disabled?: boolean;
}

type UploadStatus = 'idle' | 'preparing' | 'uploading' | 'confirming' | 'complete' | 'error';

export default function DocumentUpload({
  documentType,
  documentLabel,
  onUploadComplete,
  disabled,
}: DocumentUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setStatus('idle');
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'application/pdf': ['.pdf'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 1,
    disabled: disabled || status === 'uploading',
    onDropRejected: (rejections) => {
      const rejection = rejections[0];
      if (rejection.errors[0]?.code === 'file-too-large') {
        toast.error('File size must be less than 10MB');
      } else if (rejection.errors[0]?.code === 'file-invalid-type') {
        toast.error('Only PNG, JPG, and PDF files are accepted');
      }
    },
  });

  const handleUpload = async () => {
    if (!file) return;

    try {
      setStatus('preparing');
      setProgress(0);
      setError(null);

      // Get presigned URL
      const { submissionId, uploadUrl, fields } = await uploadService.getPresignedUrl({
        documentType,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });

      // Upload to S3
      setStatus('uploading');
      await uploadService.uploadToS3(uploadUrl, fields, file, setProgress);

      // Confirm upload
      setStatus('confirming');
      await uploadService.confirmUpload(submissionId);

      setStatus('complete');
      toast.success('Document uploaded successfully');
      onUploadComplete(submissionId);
    } catch (err: any) {
      setStatus('error');
      setError(err.response?.data?.error || 'Upload failed');
      toast.error('Upload failed. Please try again.');
    }
  };

  const handleRemove = () => {
    setFile(null);
    setStatus('idle');
    setProgress(0);
    setError(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      <label className="label">{documentLabel}</label>

      {!file ? (
        <div
          {...getRootProps()}
          className={clsx(
            'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
            isDragActive
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <input {...getInputProps()} />
          <CloudArrowUpIcon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <p className="text-sm text-gray-600">
            <span className="text-primary-600 font-medium">Click to upload</span> or
            drag and drop
          </p>
          <p className="text-xs text-gray-500 mt-1">PNG, JPG or PDF (max 10MB)</p>
        </div>
      ) : (
        <div className="border rounded-xl p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center">
              <DocumentIcon className="w-10 h-10 text-gray-400" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900">{file.name}</p>
                <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
              </div>
            </div>

            {status === 'idle' && (
              <button
                onClick={handleRemove}
                className="p-1 hover:bg-gray-100 rounded-full"
              >
                <XMarkIcon className="w-5 h-5 text-gray-400" />
              </button>
            )}

            {status === 'complete' && (
              <CheckCircleIcon className="w-6 h-6 text-green-500" />
            )}

            {status === 'error' && (
              <ExclamationCircleIcon className="w-6 h-6 text-red-500" />
            )}
          </div>

          {/* Progress bar */}
          {(status === 'uploading' || status === 'preparing' || status === 'confirming') && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>
                  {status === 'preparing'
                    ? 'Preparing...'
                    : status === 'confirming'
                    ? 'Confirming...'
                    : 'Uploading...'}
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-600 transition-all duration-300"
                  style={{ width: `${status === 'uploading' ? progress : 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          )}

          {/* Upload button */}
          {status === 'idle' && (
            <button
              onClick={handleUpload}
              className="btn-primary w-full mt-4"
            >
              Upload Document
            </button>
          )}

          {status === 'error' && (
            <div className="mt-4 flex gap-2">
              <button onClick={handleRemove} className="btn-secondary flex-1">
                Remove
              </button>
              <button onClick={handleUpload} className="btn-primary flex-1">
                Retry
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
