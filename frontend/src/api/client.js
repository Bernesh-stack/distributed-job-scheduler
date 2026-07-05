import axios from 'axios';
const API_BASE = '/api';
const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};
export const projectsAPI = {
  list: (params) => api.get('/projects', { params }),
  get: (id) => api.get(`/projects/${id}`),
  create: (data) => api.post('/projects', data),
  update: (id, data) => api.put(`/projects/${id}`, data),
  delete: (id) => api.delete(`/projects/${id}`),
};
export const queuesAPI = {
  list: (projectId, params) => api.get(`/projects/${projectId}/queues`, { params }),
  get: (projectId, id) => api.get(`/projects/${projectId}/queues/${id}`),
  create: (projectId, data) => api.post(`/projects/${projectId}/queues`, data),
  update: (projectId, id, data) => api.put(`/projects/${projectId}/queues/${id}`, data),
  pause: (projectId, id) => api.post(`/projects/${projectId}/queues/${id}/pause`),
  resume: (projectId, id) => api.post(`/projects/${projectId}/queues/${id}/resume`),
  delete: (projectId, id) => api.delete(`/projects/${projectId}/queues/${id}`),
};
export const jobsAPI = {
  list: (params) => api.get('/jobs', { params }),
  listByQueue: (queueId, params) => api.get(`/queues/${queueId}/jobs`, { params }),
  get: (id) => api.get(`/jobs/${id}`),
  create: (queueId, data) => api.post(`/queues/${queueId}/jobs`, data),
  createBatch: (queueId, data) => api.post(`/queues/${queueId}/jobs/batch`, data),
  retry: (id) => api.post(`/jobs/${id}/retry`),
  cancel: (id) => api.post(`/jobs/${id}/cancel`),
  logs: (id, params) => api.get(`/jobs/${id}/logs`, { params }),
};
export const workersAPI = {
  list: (params) => api.get('/workers', { params }),
  get: (id) => api.get(`/workers/${id}`),
  stats: () => api.get('/workers/stats'),
  heartbeats: (id, params) => api.get(`/workers/${id}/heartbeats`, { params }),
};
export const dlqAPI = {
  list: (params) => api.get('/dlq', { params }),
  retry: (id) => api.post(`/dlq/${id}/retry`),
  delete: (id) => api.delete(`/dlq/${id}`),
};
export const metricsAPI = {
  dashboard: () => api.get('/metrics/dashboard'),
  throughput: (params) => api.get('/metrics/throughput', { params }),
  successRate: (params) => api.get('/metrics/success-rate', { params }),
  queueHealth: () => api.get('/metrics/queue-health'),
  executionTimes: () => api.get('/metrics/execution-times'),
};
export const retryPoliciesAPI = {
  list: () => api.get('/retry-policies'),
};
export default api;