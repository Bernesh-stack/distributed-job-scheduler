import { useState, useEffect } from 'react';
import { queuesAPI, projectsAPI } from '../api/client';
import { RefreshCw, Plus, Search, X, Pause, Play, Trash2 } from 'lucide-react';
export default function Queues() {
  const [queues, setQueues] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedQueue, setSelectedQueue] = useState(null);
  const [showNewQueue, setShowNewQueue] = useState(false);
  const [newQueueName, setNewQueueName] = useState('');
  const [newQueuePriority, setNewQueuePriority] = useState(10);
  const [newQueueConcurrency, setNewQueueConcurrency] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  useEffect(() => { loadProjects(); }, []);
  useEffect(() => { if (selectedProject) loadQueues(); }, [selectedProject]);
  async function loadProjects() {
    try {
      const res = await projectsAPI.list();
      setProjects(res.data.data);
      if (res.data.data.length > 0) {
        setSelectedProject(res.data.data[0]);
      } else {
        const newProj = await projectsAPI.create({ name: 'Production', description: 'Default production project' });
        setProjects([newProj.data]);
        setSelectedProject(newProj.data);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
    setLoading(false);
  }
  async function loadQueues() {
    if (!selectedProject) return;
    try {
      const res = await queuesAPI.list(selectedProject.id);
      setQueues(res.data.data);
    } catch (err) {
      console.error('Failed to load queues:', err);
    }
  }
  async function togglePause(queue) {
    try {
      if (queue.is_paused) {
        await queuesAPI.resume(selectedProject.id, queue.id);
      } else {
        await queuesAPI.pause(selectedProject.id, queue.id);
      }
      loadQueues();
    } catch (err) {
      console.error('Failed to toggle queue:', err);
    }
  }
  async function createQueue(e) {
    e.preventDefault();
    try {
      await queuesAPI.create(selectedProject.id, {
        name: newQueueName,
        priority: newQueuePriority,
        concurrencyLimit: newQueueConcurrency,
      });
      setShowNewQueue(false);
      setNewQueueName('');
      loadQueues();
    } catch (err) {
      console.error('Failed to create queue:', err);
    }
  }
  async function deleteQueue(id) {
    if (!confirm('Delete this queue and all its jobs?')) return;
    try {
      await queuesAPI.delete(selectedProject.id, id);
      setSelectedQueue(null);
      loadQueues();
    } catch (err) {
      console.error('Failed to delete queue:', err);
    }
  }
  const filteredQueues = queues.filter(q =>
    q.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalStats = {
    throughput: queues.reduce((s, q) => s + parseInt(q.completed_count || 0), 0),
    activeWorkers: queues.reduce((s, q) => s + parseInt(q.running_count || 0), 0),
    pending: queues.reduce((s, q) => s + parseInt(q.pending_count || 0), 0),
  };
  if (loading) {
    return <div className="loading-state"><div className="spinner" /><p>Loading queues...</p></div>;
  }
  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Project: {selectedProject?.name}
            </span>
          </div>
          <h1 className="page-title">Queue Overview</h1>
          <p className="page-subtitle">Monitoring {queues.length} active queues across distributed nodes.</p>
        </div>
        <div className="flex items-center gap-md">
          <div className="search-input">
            <Search size={14} />
            <input
              placeholder="Filter queues..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: 180 }}
            />
          </div>
          <button className="btn btn-secondary" onClick={loadQueues}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={() => setShowNewQueue(true)}>
            <Plus size={14} /> New Queue
          </button>
        </div>
      </div>
      <div className="page-content">
        {}
        <div className="stats-row">
          <div className="stats-card">
            <div className="stats-card-label">Total Throughput</div>
            <div className="stats-card-value">{totalStats.throughput.toLocaleString()}</div>
            <div className="stats-card-detail">Jobs processed</div>
          </div>
          <div className="stats-card">
            <div className="stats-card-label">Active Workers</div>
            <div className="stats-card-value">{totalStats.activeWorkers}</div>
            <div className="stats-card-detail">Running jobs</div>
          </div>
          <div className="stats-card">
            <div className="stats-card-label">Pending Backlog</div>
            <div className="stats-card-value">{totalStats.pending}</div>
            <div className="stats-card-detail">Queued jobs</div>
          </div>
          <div className="stats-card">
            <div className="stats-card-label">Success Rate</div>
            <div className="stats-card-value" style={{ color: 'var(--color-success)' }}>
              {totalStats.throughput > 0
                ? ((totalStats.throughput / (totalStats.throughput + queues.reduce((s, q) => s + parseInt(q.failed_count || 0), 0))) * 100).toFixed(1)
                : '—'}%
            </div>
            <div className="stats-card-detail">Across all queues</div>
          </div>
        </div>
        {}
        <div className="queue-grid">
          {filteredQueues.map(queue => (
            <div
              key={queue.id}
              className="queue-card"
              onClick={() => setSelectedQueue(queue)}
            >
              <div className="queue-card-header">
                <div>
                  <div className="queue-card-title">{queue.name}</div>
                  <div className="queue-card-id">queue_id: {queue.id.slice(0, 8)}</div>
                </div>
                <div
                  className={`toggle ${!queue.is_paused ? 'active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); togglePause(queue); }}
                />
              </div>
              {queue.is_paused && (
                <span className="badge badge-paused" style={{ marginBottom: '12px' }}>Paused</span>
              )}
              <div className="queue-card-stats">
                <div className="queue-stat">
                  <div className="queue-stat-label">Pending</div>
                  <div className="queue-stat-value">{parseInt(queue.pending_count || 0).toLocaleString()}</div>
                </div>
                <div className="queue-stat">
                  <div className="queue-stat-label">Running</div>
                  <div className="queue-stat-value" style={{ color: 'var(--accent-primary)' }}>{queue.running_count || 0}</div>
                </div>
                <div className="queue-stat">
                  <div className="queue-stat-label">Failed</div>
                  <div className="queue-stat-value" style={{ color: 'var(--color-error)' }}>{queue.failed_count || 0}</div>
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Throughput: {parseInt(queue.completed_count || 0).toLocaleString()} completed
                {queue.avg_execution_ms && ` · Avg: ${Math.round(queue.avg_execution_ms)}ms`}
              </div>
            </div>
          ))}
          {}
          <div
            className="queue-card"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px dashed var(--border-default)', cursor: 'pointer', minHeight: 180
            }}
            onClick={() => setShowNewQueue(true)}
          >
            <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
              <Plus size={24} style={{ marginBottom: 8 }} />
              <div>Add New Pipeline</div>
            </div>
          </div>
        </div>
      </div>
      {}
      {selectedQueue && (
        <div className="side-panel">
          <div className="side-panel-header">
            <div>
              <div style={{ fontWeight: 600 }}>{selectedQueue.name}</div>
              <div className="text-xs text-muted">Queue Detail</div>
            </div>
            <button className="btn-ghost" onClick={() => setSelectedQueue(null)}>
              <X size={18} />
            </button>
          </div>
          <div className="side-panel-body">
            <div className="card" style={{ marginBottom: '16px' }}>
              <div className="text-xs text-muted font-semibold" style={{ marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Queue Configuration
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.85rem' }}>
                <div><span className="text-muted">Concurrency</span><br /><strong>{selectedQueue.concurrency_limit}</strong></div>
                <div><span className="text-muted">Max Retries</span><br /><strong>{selectedQueue.policy_max_retries || 3}</strong></div>
                <div><span className="text-muted">Priority</span><br /><strong>{selectedQueue.priority}</strong></div>
                <div><span className="text-muted">Strategy</span><br /><strong>{selectedQueue.retry_strategy || 'exponential'}</strong></div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button className="btn btn-danger btn-sm" onClick={() => deleteQueue(selectedQueue.id)}>
                <Trash2 size={14} /> Delete Queue
              </button>
            </div>
          </div>
        </div>
      )}
      {}
      {showNewQueue && (
        <div style={{
          position: 'fixed', inset: 0, background: 'var(--bg-overlay)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300
        }}>
          <div className="card fade-in" style={{ width: 420, padding: '32px' }}>
            <h2 style={{ marginBottom: '20px', fontSize: '1.2rem' }}>Create New Queue</h2>
            <form onSubmit={createQueue}>
              <div className="form-group">
                <label className="form-label">Queue Name</label>
                <input className="form-input" value={newQueueName} onChange={e => setNewQueueName(e.target.value)} placeholder="e.g. email_processing" required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Priority (1-100)</label>
                  <input className="form-input" type="number" min="1" max="100" value={newQueuePriority} onChange={e => setNewQueuePriority(parseInt(e.target.value))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Concurrency Limit</label>
                  <input className="form-input" type="number" min="1" max="1000" value={newQueueConcurrency} onChange={e => setNewQueueConcurrency(parseInt(e.target.value))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowNewQueue(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Queue</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}