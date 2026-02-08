import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import DocumentUpload from '../components/upload/DocumentUpload';

const DOCUMENT_TYPES = [
  {
    id: 'passport',
    label: 'Passport',
    description: 'Upload the photo page of your passport',
    required: true,
  },
  {
    id: 'national_id',
    label: 'National ID',
    description: 'Front and back of your national ID card',
    required: true,
  },
  {
    id: 'drivers_license',
    label: "Driver's License",
    description: 'Front of your driver\'s license',
    required: false,
  },
  {
    id: 'utility_bill',
    label: 'Utility Bill',
    description: 'Recent utility bill for address verification',
    required: false,
  },
  {
    id: 'bank_statement',
    label: 'Bank Statement',
    description: 'Recent bank statement (last 3 months)',
    required: false,
  },
];

export default function UploadPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') || '';

  const [uploadedDocuments, setUploadedDocuments] = useState<
    Record<string, string>
  >({});
  const [activeDocument, setActiveDocument] = useState(
    initialType || DOCUMENT_TYPES[0].id
  );

  const handleUploadComplete = (documentType: string, submissionId: string) => {
    setUploadedDocuments((prev) => ({
      ...prev,
      [documentType]: submissionId,
    }));

    // Move to next document if available
    const currentIndex = DOCUMENT_TYPES.findIndex((d) => d.id === documentType);
    const nextDocument = DOCUMENT_TYPES[currentIndex + 1];
    if (nextDocument) {
      setActiveDocument(nextDocument.id);
    }
  };

  const requiredDocuments = DOCUMENT_TYPES.filter((d) => d.required);
  const allRequiredUploaded = requiredDocuments.every(
    (d) => uploadedDocuments[d.id]
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Upload Documents</h1>
        <p className="text-gray-600 mt-1">
          Upload your identity documents for verification. All documents must be
          clear and readable.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Document type selector */}
        <div className="md:col-span-1">
          <nav className="space-y-1">
            {DOCUMENT_TYPES.map((doc) => {
              const isUploaded = !!uploadedDocuments[doc.id];
              const isActive = activeDocument === doc.id;

              return (
                <button
                  key={doc.id}
                  onClick={() => setActiveDocument(doc.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary-50 border-l-4 border-primary-600'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p
                        className={`font-medium ${
                          isActive ? 'text-primary-700' : 'text-gray-900'
                        }`}
                      >
                        {doc.label}
                        {doc.required && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {doc.description}
                      </p>
                    </div>
                    {isUploaded && (
                      <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                    )}
                  </div>
                </button>
              );
            })}
          </nav>

          <p className="text-xs text-gray-500 mt-4 px-4">
            <span className="text-red-500">*</span> Required documents
          </p>
        </div>

        {/* Upload area */}
        <div className="md:col-span-2">
          <div className="card p-6">
            {DOCUMENT_TYPES.map((doc) => (
              <div
                key={doc.id}
                className={activeDocument === doc.id ? 'block' : 'hidden'}
              >
                {uploadedDocuments[doc.id] ? (
                  <div className="text-center py-8">
                    <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      {doc.label} Uploaded
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Your document has been submitted for verification.
                    </p>
                    <button
                      onClick={() => {
                        setUploadedDocuments((prev) => {
                          const next = { ...prev };
                          delete next[doc.id];
                          return next;
                        });
                      }}
                      className="btn-secondary"
                    >
                      Upload Different Document
                    </button>
                  </div>
                ) : (
                  <DocumentUpload
                    documentType={doc.id}
                    documentLabel={doc.label}
                    onUploadComplete={(submissionId) =>
                      handleUploadComplete(doc.id, submissionId)
                    }
                  />
                )}
              </div>
            ))}
          </div>

          {/* Completion status */}
          {allRequiredUploaded && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl">
              <div className="flex items-center">
                <CheckCircleIcon className="w-6 h-6 text-green-600" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800">
                    All required documents uploaded!
                  </h3>
                  <p className="text-sm text-green-700 mt-1">
                    Your documents are being processed. You can check the status
                    on your dashboard.
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <button
                  onClick={() => navigate('/status')}
                  className="btn-primary"
                >
                  View Status
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
