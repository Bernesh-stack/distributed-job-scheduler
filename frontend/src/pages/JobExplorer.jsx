import { useState, useEffect, useCallback } from 'react';
import { jobsAPI, metricsAPI } from '../api/client';
import { Search, Filter, Plus, X, RefreshCw, RotateCcw, ChevronRight, ChevronLeft } from 'lucide-react';
export default function JobExplorer() {
  const [jobs, setJobs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobLogs, setJobLogs] = useState([]);
  const [filters, setFilters] = useState({ status: '', type: '', page: 1 });
  const [stats, setStats] = useState(null);
  const [showNewJob, setShowNewJob] = useState(false);
  const loadJobs = useCallback(async () => {
    try {
      const params = { page: filters.page, limit: 10 };
      if (filters.status) params.status = filters.status;
      if (filters.type) params.type = filters.type;
      const res = await jobsAPI.list(params);
      setJobs(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      console.error('Failed to load jobs:', err);
    }
    setLoading(false);
  }, [filters]);
  useEffect(() => { loadJobs(); }, [loadJobs]);
  useEffect(() => {
    metricsAPI.dashboard().then(res => setStats(res.data)).catch(() => {});
    const interval = setInterval(loadJobs, 5000);
    return () => clearInterval(interval);
  }, [loadJobs]);
  async function selectJob(job) {
    setSelectedJob(job);
    try {
      const [detailRes, logsRes] = await Promise.all([
        jobsAPI.get(job.id),
        jobsAPI.logs(job.id),
      ]);
      setSelectedJob(detailRes.data);
      setJobLogs(logsRes.data.data);
    } catch (err) {
      console.error('Failed to load job details:', err);
    }
  }
  async function retryJob(id) {
    try {
      await jobsAPI.retry(id);
      loadJobs();
      if (selectedJob?.id === id) {
        const res = await jobsAPI.get(id);
        setSelectedJob(res.data);
      }
    } catch (err) {
      console.error('Failed to retry job:', err);
    }
  }
  const statusFilters = ['', 'queued', 'scheduled', 'claimed', 'running', 'completed', 'failed', 'retrying', 'dead_letter'];
  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Job Explorer</h1>
          <p className="page-subtitle">Real-time status of distributed job processing units across the cluster.</p>
        </div>
        <div className="flex items-center gap-md">
          <button className="btn btn-secondary" onClick={loadJobs}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={() => setShowNewJob(true)}>
            <Plus size={14} /> New Job
          </button>
        </div>
      </div>
      <div className="page-content">
        {}
        <div className="stats-row">
          <div className="stats-card">
            <div className="stats-card-label">Throughput</div>
            <div className="stats-card-value">{stats ? parseInt(stats.total_processed_24h).toLocaleString() : '—'}</div>
            <div className="stats-card-detail">Jobs / 24h</div>
          </div>
          <div className="stats-card">
            <div className="stats-card-label">Success Rate</div>
            <div className="stats-card-value" style={{ color: 'var(--color-success)' }}>
              {stats && parseInt(stats.total_processed_24h) > 0
                ? (((parseInt(stats.total_processed_24h) - parseInt(stats.failures_24h)) / parseInt(stats.total_processed_24h)) * 100).toFixed(2)
                : '—'}%
            </div>
          </div>
          <div className="stats-card">
            <div className="stats-card-label">Active Workers</div>
            <div className="stats-card-value">{stats?.active_workers || 0}</div>
          </div>
          <div className="stats-card">
            <div className="stats-card-label">Failures (24H)</div>
            <div className="stats-card-value" style={{ color: 'var(--color-error)' }}>{stats?.failures_24h || 0}</div>
          </div>
        </div>
        {}
        <div className="flex items-center gap-md" style={{ marginBottom: '16px' }}>
          <div className="search-input" style={{ flex: 1, maxWidth: 300 }}>
            <Search size={14} />
            <input
              placeholder="Search by Job ID or Tag..."
              value={filters.type}
              onChange={e => setFilters({ ...filters, type: e.target.value, page: 1 })}
            />
          </div>
          <div className="flex items-center gap-sm" style={{ flexWrap: 'wrap' }}>
            {statusFilters.map(s => (
              <button
                key={s || 'all'}
                className={`btn btn-sm ${filters.status === s ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilters({ ...filters, status: s, page: 1 })}
              >
                {s || 'All'}
              </button>
            ))}
          </div>
        </div>
        {}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Status</th>
                <th>Queue</th>
                <th>Created At</th>
                <th>Execution Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}><div className="loading-state"><div className="spinner" /></div></td></tr>
              ) : jobs.length === 0 ? (
                <tr><td colSpan={6}><div className="empty-state">No jobs found</div></td></tr>
              ) : jobs.map(job => (
                <tr key={job.id} onClick={() => selectJob(job)} style={{ cursor: 'pointer' }}>
                  <td>
                    <span className="font-mono text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {job.id.slice(0, 16)}...
                    </span>
                  </td>
                  <td><span className={`badge badge-${job.status}`}>{job.status}</span></td>
                  <td>{job.queue_name || job.type}</td>
                  <td className="text-muted">{new Date(job.created_at).toLocaleString()}</td>
                  <td>
                    {job.execution_duration_ms
                      ? `${job.execution_duration_ms < 1000 ? job.execution_duration_ms + 'ms' : (job.execution_duration_ms / 1000).toFixed(1) + 's'}`
                      : '—'}
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); selectJob(job); }}>
                      <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {}
        <div className="flex items-center justify-between" style={{ marginTop: '16px' }}>
          <span className="pagination-info">Showing {jobs.length} of {pagination.total} jobs</span>
          <div className="pagination">
            <button
              className="pagination-btn"
              disabled={pagination.page <= 1}
              onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                className={`pagination-btn ${pagination.page === p ? 'active' : ''}`}
                onClick={() => setFilters({ ...filters, page: p })}
              >
                {p}
              </button>
            ))}
            <button
              className="pagination-btn"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
      {}
      {selectedJob && (
        <div className="side-panel">
          <div className="side-panel-header">
            <div>
              <div className="font-mono text-sm">{selectedJob.id?.slice(0, 20)}...</div>
              <div className="text-xs text-muted" style={{ marginTop: 2 }}>{selectedJob.type}</div>
            </div>
            <button className="btn-ghost" onClick={() => setSelectedJob(null)}><X size={18} /></button>
          </div>
          <div className="side-panel-body">
            {}
            <div style={{ marginBottom: '20px' }}>
              <span className={`badge badge-${selectedJob.status}`}>{selectedJob.status}</span>
            </div>
            {}
            <div style={{ marginBottom: '20px' }}>
              <div className="text-xs text-muted font-semibold" style={{ marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Execution Timeline
              </div>
              <div className="timeline">
                <div className="timeline-item completed">
                  <div className="font-medium text-sm">Job Received</div>
                  <div className="text-xs text-muted">{new Date(selectedJob.created_at).toLocaleString()}</div>
                </div>
                {selectedJob.started_at && (
                  <div className="timeline-item completed">
                    <div className="font-medium text-sm">Execution Started</div>
                    <div className="text-xs text-muted">{new Date(selectedJob.started_at).toLocaleString()}</div>
                  </div>
                )}
                {selectedJob.completed_at && (
                  <div className={`timeline-item ${selectedJob.status === 'completed' ? 'completed' : 'failed'}`}>
                    <div className="font-medium text-sm">{selectedJob.status === 'completed' ? 'Completed' : 'Failed'}</div>
                    <div className="text-xs text-muted">{new Date(selectedJob.completed_at).toLocaleString()}</div>
                  </div>
                )}
                {!selectedJob.completed_at && selectedJob.status === 'running' && (
                  <div className="timeline-item pending">
                    <div className="font-medium text-sm">Execution In Progress</div>
                    <div className="text-xs text-muted pulse">Running...</div>
                  </div>
                )}
              </div>
            </div>
            {}
            <div style={{ marginBottom: '20px' }}>
              <div className="text-xs text-muted font-semibold" style={{ marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Job Parameters
              </div>
              <pre className="log-viewer" style={{ maxHeight: 160 }}>
                {JSON.stringify(selectedJob.payload, null, 2)}
              </pre>
            </div>
            {}
            {selectedJob.error && (
              <div style={{ marginBottom: '20px' }}>
                <div className="text-xs text-muted font-semibold" style={{ marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Error
                </div>
                <div style={{ background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', borderRadius: '8px', padding: '12px', color: 'var(--color-error)', fontSize: '0.82rem' }}>
                  {selectedJob.error}
                </div>
              </div>
            )}
            {}
            {jobLogs.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div className="text-xs text-muted font-semibold" style={{ marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Execution Logs
                </div>
                <div className="log-viewer">
                  {jobLogs.map((log, i) => (
                    <div key={i} className="log-line">
                      <span className="log-timestamp">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                      <span className={`log-level-${log.level}`}>{log.level.toUpperCase()}</span>
                      <span>{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {}
            <div style={{ display: 'flex', gap: '8px' }}>
              {['failed', 'dead_letter'].includes(selectedJob.status) && (
                <button className="btn btn-secondary" onClick={() => retryJob(selectedJob.id)}>
                  <RotateCcw size={14} /> Retry Job
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {}
      {showNewJob && <NewJobModal onClose={() => setShowNewJob(false)} onCreated={loadJobs} />}
    </div>
  );
}
function NewJobModal({ onClose, onCreated }) {
  const [queueId, setQueueId] = useState('');
  const [type, setType] = useState('');
  const [payload, setPayload] = useState('{}');
  const [priority, setPriority] = useState(0);
  const [scheduledAt, setScheduledAt] = useState('');
  const [queues, setQueues] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    import('../api/client').then(({ projectsAPI, queuesAPI }) => {
      projectsAPI.list().then(res => {
        const projects = res.data.data;
        Promise.all(projects.map(p => queuesAPI.list(p.id))).then(results => {
          setQueues(results.flatMap(r => r.data.data));
        });
      });
    });
  }, []);
  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      JSON.parse(payload);
      await jobsAPI.create(queueId, { type, payload: JSON.parse(payload), priority, scheduledAt: scheduledAt || undefined });
      onCreated();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to create job');
    }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div className="card fade-in" style={{ width: 480, padding: '32px' }}>
        <h2 style={{ marginBottom: '20px' }}>Create New Job</h2>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Target Queue</label>
            <select className="form-select" value={queueId} onChange={e => setQueueId(e.target.value)} required>
              <option value="">Select a queue...</option>
              {queues.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Job Type</label>
            <input className="form-input" value={type} onChange={e => setType(e.target.value)} placeholder="e.g. email_send, image_processing" required />
          </div>
          <div className="form-group">
            <label className="form-label">Payload (JSON)</label>
            <textarea className="form-input" rows={4} value={payload} onChange={e => setPayload(e.target.value)} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Priority (0-100)</label>
              <input className="form-input" type="number" min="0" max="100" value={priority} onChange={e => setPriority(parseInt(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">Schedule At (optional)</label>
              <input className="form-input" type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Create Job</button>
          </div>
        </form>
      </div>
    </div>
  );
}