import { useState, useEffect } from 'react';
import { workersAPI } from '../api/client';
import { RefreshCw, Plus, ChevronLeft, ChevronRight, MoreVertical } from 'lucide-react';
export default function Workers() {
  const [workers, setWorkers] = useState([]);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  useEffect(() => { loadWorkers(); }, [page, statusFilter]);
  useEffect(() => {
    workersAPI.stats().then(res => setStats(res.data)).catch(() => {});
    const interval = setInterval(loadWorkers, 5000);
    return () => clearInterval(interval);
  }, []);
  async function loadWorkers() {
    try {
      const params = { page, limit: 10 };
      if (statusFilter) params.status = statusFilter;
      const res = await workersAPI.list(params);
      setWorkers(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      console.error('Failed to load workers:', err);
    }
    setLoading(false);
  }
  function getConcurrencyLevel(active, limit) {
    const pct = (active / limit) * 100;
    if (pct >= 90) return 'critical';
    if (pct >= 70) return 'high';
    if (pct >= 40) return 'medium';
    return 'low';
  }
  function getWorkerStatus(worker) {
    if (worker.status === 'offline') return 'offline';
    if (worker.status === 'draining') return 'draining';
    const lastHb = new Date(worker.last_heartbeat);
    const now = new Date();
    if (now - lastHb > 30000) return 'late';
    return 'active';
  }
  const totalCapacity = parseInt(stats?.total_capacity || 0);
  const totalActiveJobs = parseInt(stats?.total_active_jobs || 0);
  const clusterLoad = totalCapacity > 0 ? Math.round((totalActiveJobs / totalCapacity) * 100) : 0;
  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Worker Monitor</h1>
          <p className="page-subtitle">Real-time status of the distributed worker cluster.</p>
        </div>
        <div className="flex items-center gap-md">
          <button className="btn btn-secondary" onClick={loadWorkers}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn btn-primary">
            <Plus size={14} /> Provision New
          </button>
        </div>
      </div>
      <div className="page-content">
        {}
        <div className="stats-row">
          <div className="stats-card">
            <div className="stats-card-label">Total Workers</div>
            <div className="stats-card-value">{stats ? parseInt(stats.total_count) : '—'}</div>
          </div>
          <div className="stats-card">
            <div className="stats-card-label">Cluster Load</div>
            <div className="stats-card-value">{clusterLoad}%</div>
            <div style={{ marginTop: '8px', height: 4, background: 'var(--bg-elevated)', borderRadius: 2 }}>
              <div style={{
                height: '100%', borderRadius: 2, width: `${Math.min(clusterLoad, 100)}%`,
                background: clusterLoad > 80 ? 'var(--color-error)' : clusterLoad > 50 ? 'var(--color-warning)' : 'var(--text-primary)',
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
          <div className="stats-card">
            <div className="stats-card-label">Degraded State</div>
            <div className="stats-card-value" style={{ color: parseInt(stats?.offline_count || 0) > 0 ? 'var(--color-error)' : 'var(--text-primary)' }}>
              {String(parseInt(stats?.offline_count || 0)).padStart(2, '0')}
            </div>
          </div>
          <div className="stats-card">
            <div className="stats-card-label">Active Threads</div>
            <div className="stats-card-value">{totalActiveJobs.toLocaleString()}</div>
          </div>
        </div>
        {}
        <div className="flex items-center gap-sm" style={{ marginBottom: '16px' }}>
          {['', 'active', 'draining', 'offline'].map(s => (
            <button
              key={s || 'all'}
              className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setStatusFilter(s); setPage(1); }}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
        {}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Hostname / IP</th>
                <th>Concurrency</th>
                <th>Last Seen</th>
                <th>Version</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}><div className="loading-state"><div className="spinner" /></div></td></tr>
              ) : workers.length === 0 ? (
                <tr><td colSpan={6}><div className="empty-state">No workers registered. Start a worker with <code>npm run worker</code></div></td></tr>
              ) : workers.map(worker => {
                const status = getWorkerStatus(worker);
                const active = parseInt(worker.current_jobs || worker.active_jobs || 0);
                const limit = worker.concurrency_limit;
                const pct = Math.round((active / limit) * 100);
                const level = getConcurrencyLevel(active, limit);
                return (
                  <tr key={worker.id}>
                    <td>
                      <div className="flex items-center gap-sm">
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: status === 'active' ? 'var(--color-success)' : status === 'late' ? 'var(--color-warning)' : 'var(--color-error)'
                        }} />
                        <span className={`badge badge-${status === 'late' ? 'draining' : status}`} style={{ textTransform: 'capitalize' }}>
                          {status === 'late' ? 'Late' : status}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div>
                        <div className="font-medium">{worker.hostname}</div>
                        <div className="text-xs text-muted">{worker.ip_address}</div>
                      </div>
                    </td>
                    <td style={{ width: 200 }}>
                      <div className="flex items-center gap-sm">
                        <span className="text-xs font-mono">{active} / {limit} slots</span>
                        <div className="concurrency-bar" style={{ flex: 1 }}>
                          <div className={`concurrency-bar-fill ${level}`} style={{ width: `${pct}%` }}>
                            {pct > 20 ? `${pct}%` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ color: status === 'late' ? 'var(--color-warning)' : 'var(--text-muted)' }}>
                        {new Date(worker.last_heartbeat).toLocaleString()}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-queued">v{worker.version}</span>
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm">
                        <MoreVertical size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {}
        <div className="flex items-center justify-between" style={{ marginTop: '16px' }}>
          <span className="pagination-info">Showing {workers.length} of {pagination.total} workers</span>
          <div className="pagination">
            <button className="pagination-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => i + 1).map(p => (
              <button key={p} className={`pagination-btn ${page === p ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
            ))}
            <button className="pagination-btn" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}