import { useState, useEffect } from 'react';
import { metricsAPI, workersAPI } from '../api/client';
import { Calendar, Download } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar
} from 'recharts';
export default function Metrics() {
  const [dashboardStats, setDashboardStats] = useState(null);
  const [throughputData, setThroughputData] = useState([]);
  const [successRate, setSuccessRate] = useState(null);
  const [executionTimes, setExecutionTimes] = useState([]);
  const [queueHealth, setQueueHealth] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 10000);
    return () => clearInterval(interval);
  }, []);
  async function loadAll() {
    try {
      const [dashRes, tpRes, srRes, etRes, qhRes] = await Promise.all([
        metricsAPI.dashboard(),
        metricsAPI.throughput({ hours: 24 }),
        metricsAPI.successRate({ hours: 24 }),
        metricsAPI.executionTimes(),
        metricsAPI.queueHealth(),
      ]);
      setDashboardStats(dashRes.data);
      setThroughputData(tpRes.data.map(d => ({
        time: new Date(d.time_bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        jobs: parseInt(d.completed_count),
        success: parseInt(d.success_count),
        failures: parseInt(d.failure_count),
      })));
      setSuccessRate(srRes.data);
      setExecutionTimes(etRes.data);
      setQueueHealth(qhRes.data);
    } catch (err) {
      console.error('Failed to load metrics:', err);
    }
    setLoading(false);
  }
  const pieData = successRate ? [
    { name: 'Successful', value: parseInt(successRate.successful), color: '#06d6a0' },
    { name: 'Failed', value: parseInt(successRate.failed), color: '#ef476f' },
    { name: 'Retrying', value: parseInt(successRate.retrying), color: '#a0a0b8' },
  ].filter(d => d.value > 0) : [];
  const avgExecMs = dashboardStats?.avg_exec_time_ms;
  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Metrics & Health</h1>
          <p className="page-subtitle">System performance and throughput across distributed nodes.</p>
        </div>
        <div className="flex items-center gap-md">
          <button className="btn btn-secondary"><Calendar size={14} /> Last 24 Hours</button>
          <button className="btn btn-primary"><Download size={14} /> Download Report</button>
        </div>
      </div>
      <div className="page-content">
        {}
        <div className="stats-row">
          <div className="stats-card">
            <div className="stats-card-label">Total Throughput</div>
            <div className="stats-card-value">
              {dashboardStats ? parseInt(dashboardStats.total_processed_24h).toLocaleString() : '—'}
            </div>
            <div className="stats-card-detail">Jobs handled per day</div>
          </div>
          <div className="stats-card">
            <div className="stats-card-label">Success Rate</div>
            <div className="stats-card-value" style={{ color: 'var(--color-success)' }}>
              {successRate ? `${successRate.successRate}%` : '—'}
            </div>
            <div className="stats-card-detail">Across all queues</div>
          </div>
          <div className="stats-card">
            <div className="stats-card-label">Avg Exec Time</div>
            <div className="stats-card-value">
              {avgExecMs ? `${Math.round(avgExecMs)}ms` : '—'}
            </div>
            <div className="stats-card-detail">Per task unit</div>
          </div>
          <div className="stats-card">
            <div className="stats-card-label">Current Backlog</div>
            <div className="stats-card-value">
              {dashboardStats ? parseInt(dashboardStats.current_backlog).toLocaleString() : '—'}
            </div>
            <div className="stats-card-detail">Live queue count</div>
          </div>
        </div>
        {}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '24px' }}>
          {}
          <div className="chart-container">
            <div className="flex items-center justify-between" style={{ marginBottom: '16px' }}>
              <h3 className="chart-title" style={{ margin: 0 }}>Job Throughput</h3>
              <span className="text-xs text-muted">● Jobs/min</span>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={throughputData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,42,58,0.5)" />
                <XAxis dataKey="time" stroke="#6b6b80" fontSize={11} />
                <YAxis stroke="#6b6b80" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: '#1e1e2a', border: '1px solid #2a2a3a',
                    borderRadius: '8px', color: '#f0f0f5', fontSize: '0.82rem'
                  }}
                />
                <Line type="monotone" dataKey="jobs" stroke="#4361ee" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {}
          <div className="chart-container">
            <h3 className="chart-title">Success Rate</h3>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ position: 'relative', width: 180, height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData.length > 0 ? pieData : [{ name: 'No data', value: 1, color: '#2a2a3a' }]}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                    >
                      {(pieData.length > 0 ? pieData : [{ color: '#2a2a3a' }]).map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{successRate?.successRate || 0}%</div>
                  <div className="text-xs text-muted">SUCCESS</div>
                </div>
              </div>
              <div style={{ marginTop: '16px', width: '100%' }}>
                {pieData.map(d => (
                  <div key={d.name} className="flex items-center justify-between" style={{ marginBottom: '8px', fontSize: '0.82rem' }}>
                    <div className="flex items-center gap-sm">
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
                      <span>{d.name}</span>
                    </div>
                    <span className="font-medium">{d.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {}
        <div className="chart-container" style={{ marginBottom: '24px' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: '16px' }}>
            <h3 className="chart-title" style={{ margin: 0 }}>Execution Time per Queue</h3>
            <span className="text-xs text-muted">ms (milliseconds)</span>
          </div>
          {executionTimes.length > 0 ? (
            <div>
              {executionTimes.map(et => {
                const avgMs = Math.round(parseFloat(et.avg_ms) || 0);
                const maxWidth = Math.max(...executionTimes.map(e => parseFloat(e.avg_ms) || 0));
                const pct = maxWidth > 0 ? (avgMs / maxWidth) * 100 : 0;
                const color = avgMs > 500 ? 'var(--color-error)' : avgMs > 200 ? 'var(--accent-primary)' : 'var(--color-success)';
                return (
                  <div key={et.queue_name} style={{ marginBottom: '16px' }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: '4px' }}>
                      <span className="font-medium text-sm">{et.queue_name}</span>
                      <span className="text-sm text-muted">{avgMs}ms</span>
                    </div>
                    <div style={{ height: 8, background: 'var(--bg-elevated)', borderRadius: 4 }}>
                      <div style={{
                        height: '100%', borderRadius: 4, width: `${pct}%`,
                        background: color, transition: 'width 0.5s ease'
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '32px' }}>No execution data available yet</div>
          )}
        </div>
        {}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Live Queue Monitoring</h3>
            <span className="text-xs" style={{ color: 'var(--accent-primary)', cursor: 'pointer' }}>View full logs</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Queue ID</th>
                <th>Active Workers</th>
                <th>Pending</th>
                <th>Failed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {queueHealth.length === 0 ? (
                <tr><td colSpan={5}><div className="empty-state">No queue data</div></td></tr>
              ) : queueHealth.map(q => (
                <tr key={q.id}>
                  <td className="font-mono text-sm">{q.name}</td>
                  <td>{parseInt(q.active_workers || 0)}</td>
                  <td>{parseInt(q.pending || 0)}</td>
                  <td style={{ color: parseInt(q.failed || 0) > 0 ? 'var(--color-error)' : 'inherit' }}>
                    {parseInt(q.failed || 0)}
                  </td>
                  <td>
                    <span className={`badge badge-${q.health_status}`}>{q.health_status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {}
        <div className="flex items-center justify-between" style={{ marginTop: '24px', padding: '12px 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          <span>Last update: {new Date().toLocaleTimeString()}</span>
          <span>VERSION: 1.0.0-STABLE&nbsp;&nbsp;&nbsp;&nbsp;REGION: LOCAL</span>
        </div>
      </div>
    </div>
  );
}