import { useState, useEffect } from 'react';
import { queuesAPI, projectsAPI, retryPoliciesAPI } from '../api/client';
import { Save, X } from 'lucide-react';
export default function Configuration() {
  const [queues, setQueues] = useState([]);
  const [selectedQueue, setSelectedQueue] = useState(null);
  const [retryPolicies, setRetryPolicies] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [form, setForm] = useState({ name: '', priority: 10, concurrencyLimit: 10, retryPolicyId: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    retryPoliciesAPI.list().then(res => setRetryPolicies(res.data)).catch(() => {});
    projectsAPI.list().then(res => {
      setProjects(res.data.data);
      if (res.data.data.length > 0) setSelectedProject(res.data.data[0]);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (selectedProject) {
      queuesAPI.list(selectedProject.id).then(res => {
        setQueues(res.data.data);
        if (res.data.data.length > 0) selectQueue(res.data.data[0]);
      }).catch(() => {});
    }
  }, [selectedProject]);
  function selectQueue(queue) {
    setSelectedQueue(queue);
    setForm({
      name: queue.name,
      priority: queue.priority,
      concurrencyLimit: queue.concurrency_limit,
      retryPolicyId: queue.retry_policy_id || '',
    });
    setSaved(false);
  }
  async function handleSave() {
    if (!selectedProject || !selectedQueue) return;
    setSaving(true);
    try {
      await queuesAPI.update(selectedProject.id, selectedQueue.id, form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      const res = await queuesAPI.list(selectedProject.id);
      setQueues(res.data.data);
    } catch (err) {
      console.error('Failed to save:', err);
    }
    setSaving(false);
  }
  async function togglePause() {
    if (!selectedProject || !selectedQueue) return;
    try {
      if (selectedQueue.is_paused) {
        await queuesAPI.resume(selectedProject.id, selectedQueue.id);
      } else {
        await queuesAPI.pause(selectedProject.id, selectedQueue.id);
      }
      const res = await queuesAPI.list(selectedProject.id);
      setQueues(res.data.data);
      const updated = res.data.data.find(q => q.id === selectedQueue.id);
      if (updated) setSelectedQueue(updated);
    } catch (err) {
      console.error('Failed to toggle pause:', err);
    }
  }
  const selectedPolicy = retryPolicies.find(p => p.id === form.retryPolicyId);
  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {selectedProject?.name || 'Production'}
          </span>
          <h1 className="page-title">Queue Configuration</h1>
          <p className="page-subtitle">Manage throughput, priority, and failure resilience for distributed job pipelines.</p>
        </div>
      </div>
      <div className="page-content" style={{ maxWidth: 900 }}>
        {}
        <div className="card" style={{ marginBottom: '24px' }}>
          <label className="form-label">Target Queue</label>
          <select
            className="form-select"
            value={selectedQueue?.id || ''}
            onChange={e => {
              const q = queues.find(q => q.id === e.target.value);
              if (q) selectQueue(q);
            }}
          >
            {queues.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
          </select>
        </div>
        {}
        {selectedQueue && (
          <div className="card" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
              {}
              <div>
                <div className="form-group">
                  <label className="form-label">
                    Priority Weight
                    <span style={{ float: 'right', fontSize: '0.65rem', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>INT[1-100]</span>
                  </label>
                  <input
                    className="form-input"
                    type="number"
                    min="1"
                    max="100"
                    value={form.priority}
                    onChange={e => setForm({ ...form, priority: parseInt(e.target.value) || 1 })}
                  />
                  <div className="form-hint">Determines scheduling weight relative to other queues.</div>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Concurrency Limit
                    <span style={{ float: 'right', fontSize: '0.65rem', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>LIMIT_MAX</span>
                  </label>
                  <input
                    className="form-input"
                    type="number"
                    min="1"
                    max="1000"
                    value={form.concurrencyLimit}
                    onChange={e => setForm({ ...form, concurrencyLimit: parseInt(e.target.value) || 1 })}
                  />
                  <div className="form-hint">Maximum simultaneous jobs across all active nodes.</div>
                </div>
              </div>
              {}
              <div>
                <div className="form-group">
                  <label className="form-label">Retry Strategy</label>
                  <select
                    className="form-select"
                    value={form.retryPolicyId}
                    onChange={e => setForm({ ...form, retryPolicyId: e.target.value })}
                  >
                    <option value="">No retry policy</option>
                    {retryPolicies.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.strategy})</option>
                    ))}
                  </select>
                  {selectedPolicy && (
                    <div className="form-hint">
                      Backoff algorithm: <code style={{ color: 'var(--accent-primary)' }}>
                        {selectedPolicy.strategy === 'exponential' ? `2^retry_count × ${selectedPolicy.base_delay_ms}ms` :
                         selectedPolicy.strategy === 'linear' ? `retry_count × ${selectedPolicy.base_delay_ms}ms` :
                         `${selectedPolicy.base_delay_ms}ms fixed`}
                      </code>
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Operational Status</label>
                  <div className="flex items-center justify-between" style={{
                    background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)', padding: '12px 16px'
                  }}>
                    <span>Active / Accepting Jobs</span>
                    <div
                      className={`toggle ${!selectedQueue.is_paused ? 'active' : ''}`}
                      onClick={togglePause}
                    />
                  </div>
                  <div className="form-hint">Toggle execution without flushing the queue.</div>
                </div>
              </div>
            </div>
            {}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', borderTop: '1px solid var(--border-default)', paddingTop: '20px' }}>
              <button className="btn btn-secondary" onClick={() => selectQueue(selectedQueue)}>Discard</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                <Save size={14} /> {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
        {}
        {selectedQueue && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
            <div className="card" style={{ background: 'var(--bg-secondary)' }}>
              <div className="text-xs font-semibold text-muted" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                ⓘ System Context
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                <div>
                  <div className="text-xs text-muted">Current Node</div>
                  <div className="font-mono font-medium" style={{ fontSize: '0.85rem' }}>worker-local-01</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Queue Depth</div>
                  <div className="font-mono font-medium" style={{ fontSize: '0.85rem' }}>{selectedQueue.pending_count || 0} ops</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Avg Execution</div>
                  <div className="font-mono font-medium" style={{ fontSize: '0.85rem', color: 'var(--color-success)' }}>
                    {selectedQueue.avg_execution_ms ? `${Math.round(selectedQueue.avg_execution_ms)}ms` : '—'}
                  </div>
                </div>
              </div>
            </div>
            <div className="card" style={{ background: 'var(--bg-secondary)', textAlign: 'center' }}>
              <div className="text-xs font-semibold text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                Real-Time Load
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700 }}>
                {selectedQueue.running_count && selectedQueue.concurrency_limit
                  ? `${((parseInt(selectedQueue.running_count) / selectedQueue.concurrency_limit) * 100).toFixed(1)}%`
                  : '0%'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}