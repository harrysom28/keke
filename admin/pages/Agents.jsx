const { useState, useEffect } = React;
const Api = window.AdminApi;
const C = window.AdminComponents;

function pct(n) {
  return Math.round((Number(n) || 0) * 100) + '%';
}

function AgentsPage({ onNavigate, showToast }) {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    email_phone_number: '',
    name: '',
    zone: '',
    park: '',
    bountyRate: '',
    targetCount: '20',
    targetDeadline: '',
  });

  const load = () => {
    setLoading(true);
    Api.get('/api/admin/agents').then((res) => {
      if (res.error) { showToast(res.error, 'error'); setAgents([]); return; }
      setAgents(res.data?.data?.agents || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    const res = await Api.post('/api/admin/agents', {
      email_phone_number: form.email_phone_number.trim(),
      name: form.name.trim() || undefined,
      zone: form.zone.trim() || undefined,
      park: form.park.trim() || undefined,
      bountyRate: form.bountyRate ? Number(form.bountyRate) : undefined,
      targetCount: form.targetCount ? Number(form.targetCount) : undefined,
      targetDeadline: form.targetDeadline || undefined,
    });
    if (res.error) { showToast(res.error, 'error'); return; }
    showToast('Agent added — they can sign in with that email or phone');
    setOpen(false);
    setForm({ email_phone_number: '', name: '', zone: '', park: '', bountyRate: '', targetCount: '20', targetDeadline: '' });
    load();
  };

  const columns = [
    { key: 'name', label: 'Agent' },
    { key: 'phone', label: 'Phone', render: (v, row) => v || row.email || '—' },
    { key: 'park', label: 'Park / zone', render: (_v, row) => [row.park, row.zone].filter(Boolean).join(' · ') || '—' },
    { key: 'registered', label: 'Registered', render: (_v, row) => row.stats?.registered ?? 0 },
    { key: 'verified', label: 'Verified', render: (_v, row) => row.stats?.verified ?? 0 },
    { key: 'active', label: 'Active', render: (_v, row) => row.stats?.active ?? 0 },
    { key: 'verification_rate', label: 'Verify rate', render: (v) => pct(v) },
    { key: 'activation_rate', label: 'Activate rate', render: (v) => pct(v) },
    { key: 'status', label: 'Status' },
  ];

  return (
    <div className="space-y-4">
      <C.Breadcrumb items={[{ label: 'Agents' }]} />
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">Registered is not the same as performing. Sort is active drivers first.</p>
        <button type="button" onClick={() => setOpen(true)} className="keke-btn-primary px-3 py-2 rounded-lg text-sm">Add agent</button>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <C.DataTable
          columns={columns}
          rows={agents}
          keyField="agent_id"
          loading={loading}
          onRowClick={(row) => onNavigate('agent-detail', row.agent_id)}
          emptyMessage="No agents yet"
        />
      </div>
      <C.Modal open={open} onClose={() => setOpen(false)} title="Add agent">
        <form onSubmit={create} className="space-y-3">
          <p className="text-sm text-gray-500">Use the email or phone of their existing Keke account. They sign in on the agent console with that same identifier.</p>
          <input required value={form.email_phone_number} onChange={(e) => setForm({ ...form, email_phone_number: e.target.value })} placeholder="Email or phone" className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600" />
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Display name (optional)" className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600" />
          <div className="grid grid-cols-2 gap-2">
            <input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} placeholder="Zone" className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600" />
            <input value={form.park} onChange={(e) => setForm({ ...form, park: e.target.value })} placeholder="Park" className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600" />
          </div>
          <input value={form.bountyRate} onChange={(e) => setForm({ ...form, bountyRate: e.target.value })} placeholder="Bounty ₦ per active driver (optional)" inputMode="numeric" className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600" />
          <div className="grid grid-cols-2 gap-2">
            <input value={form.targetCount} onChange={(e) => setForm({ ...form, targetCount: e.target.value })} placeholder="Target count" inputMode="numeric" className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600" />
            <input type="date" value={form.targetDeadline} onChange={(e) => setForm({ ...form, targetDeadline: e.target.value })} className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600" />
          </div>
          <button type="submit" className="keke-btn-primary px-3 py-2 rounded-lg text-sm">Create</button>
        </form>
      </C.Modal>
    </div>
  );
}

function AgentDetailPage({ id, onBack, onNavigate, showToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!id) return;
    setLoading(true);
    Api.get('/api/admin/agents/' + id).then((res) => {
      if (res.error) { showToast(res.error, 'error'); setData(null); return; }
      setData(res.data?.data || res.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const setStatus = async (status) => {
    const res = await Api.patch('/api/admin/agents/' + id, { status });
    if (res.error) showToast(res.error, 'error');
    else { showToast('Updated'); load(); }
  };

  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (!data?.agent) return <p className="text-gray-500">Agent not found</p>;
  const a = data.agent;
  const s = a.stats || {};

  return (
    <div className="space-y-4">
      <C.Breadcrumb items={[{ label: 'Agents' }, { label: a.name || 'Agent' }]} />
      <button type="button" onClick={onBack} className="text-blue-600 hover:underline">← Back</button>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{a.name || 'Agent'}</h2>
          <p className="text-sm text-gray-500">{a.phone || a.email} · {a.park || a.zone || 'No park'} · {a.status}</p>
        </div>
        <div className="flex gap-2">
          {a.status === 'active' ? (
            <button type="button" onClick={() => setStatus('inactive')} className="px-3 py-1.5 rounded-lg border text-sm">Deactivate</button>
          ) : (
            <button type="button" onClick={() => setStatus('active')} className="keke-btn-primary px-3 py-1.5 rounded-lg text-sm">Activate</button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[['Registered', s.registered], ['Verified', s.verified], ['Active (7d)', s.active], ['Verify rate', pct(a.verification_rate)]].map(([label, value]) => (
          <div key={label} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-xl font-semibold">{value ?? 0}</p>
          </div>
        ))}
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <C.DataTable
          columns={[
            { key: 'name', label: 'Driver' },
            { key: 'phone', label: 'Phone' },
            { key: 'verification_status', label: 'Status' },
            { key: 'plate_number', label: 'Plate' },
            { key: 'total_rides', label: 'Rides' },
          ]}
          rows={data.drivers || []}
          keyField="driver_id"
          onRowClick={(row) => onNavigate && onNavigate('driver-detail', row.driver_id)}
          emptyMessage="No drivers tagged to this agent"
        />
      </div>
    </div>
  );
}

window.AdminPages = window.AdminPages || {};
window.AdminPages.Agents = AgentsPage;
window.AdminPages.AgentDetail = AgentDetailPage;
