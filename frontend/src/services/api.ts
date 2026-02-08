import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear auth state and redirect to login
      localStorage.removeItem('kyc-auth');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Upload service
export const uploadService = {
  async getPresignedUrl(data: {
    documentType: string;
    fileName: string;
    fileType: string;
    fileSize: number;
  }) {
    const response = await api.post('/upload/presigned-url', data);
    return response.data.data;
  },

  async uploadToS3(
    uploadUrl: string,
    fields: Record<string, string>,
    file: File,
    onProgress?: (progress: number) => void
  ) {
    const formData = new FormData();

    // Add all presigned fields
    Object.entries(fields).forEach(([key, value]) => {
      formData.append(key, value);
    });

    // Add file last
    formData.append('file', file);

    await axios.post(uploadUrl, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(progress);
        }
      },
    });
  },

  async confirmUpload(submissionId: string) {
    const response = await api.post('/upload/confirm', { submissionId });
    return response.data.data;
  },

  async getUploadStatus(submissionId: string) {
    const response = await api.get(`/upload/status/${submissionId}`);
    return response.data.data;
  },
};

// KYC service
export const kycService = {
  async getSubmissions(params?: {
    page?: number;
    limit?: number;
    status?: string;
  }) {
    const response = await api.get('/kyc/submissions', { params });
    return response.data.data;
  },

  async getSubmission(id: string) {
    const response = await api.get(`/kyc/submissions/${id}`);
    return response.data.data;
  },

  async getStatus() {
    const response = await api.get('/kyc/status');
    return response.data.data;
  },

  async getAnalytics() {
    const response = await api.get('/kyc/analytics');
    return response.data.data;
  },
};

// Review service
export const reviewService = {
  async getQueue(params?: {
    page?: number;
    limit?: number;
    priority?: number;
    assignedToMe?: boolean;
  }) {
    const response = await api.get('/review/queue', { params });
    return response.data.data;
  },

  async claimItem(queueId: string) {
    const response = await api.post(`/review/claim/${queueId}`);
    return response.data.data;
  },

  async releaseItem(queueId: string) {
    const response = await api.post(`/review/release/${queueId}`);
    return response.data;
  },

  async getItem(queueId: string) {
    const response = await api.get(`/review/${queueId}`);
    return response.data.data;
  },

  async submitDecision(
    queueId: string,
    data: { action: 'approve' | 'reject'; reason?: string; notes?: string }
  ) {
    const response = await api.post(`/review/${queueId}/decision`, data);
    return response.data.data;
  },

  async getStats() {
    const response = await api.get('/review/stats/summary');
    return response.data.data;
  },
};

export default api;
