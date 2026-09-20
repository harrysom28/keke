const { useState, useEffect } = React;
const Api = window.AdminApi;
const Auth = window.AdminAuth;
const C = window.AdminComponents;

function pct(n) {
  return Math.round((Number(n) || 0) * 100) + '%';
}

function AgentsPage({ onNavigate, showToast }) {
  const canCreateAgents = Auth.getRole() !== 'agents_manager';
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('active');
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

  const approve = async (row) => {
    const res = await Api.patch('/api/admin/agents/' + row.agent_id, { status: 'active' });
    if (res.error) { showToast(res.error, 'error'); return; }
    showToast('Agent approved — they can sign in now');
    load();
  };

  const pending = agents.filter((a) => a.status === 'pending');
  const active = agents.filter((a) => a.status !== 'pending');
  const rows = tab === 'pending' ? pending : active;

  const activeColumns = [
    { key: 'name', label: 'Agent' },
    { key: 'phone', label: 'Phone', render: (v, row) => v || row.email || '—' },
    { key: 'referral_code', label: 'Code', render: (v) => v || '—' },
    { key: 'park', label: 'Park / zone', render: (_v, row) => [row.park, row.zone].filter(Boolean).join(' · ') || '—' },
    { key: 'invited', label: 'Invites', render: (_v, row) => row.stats?.invited ?? 0 },
    { key: 'registered', label: 'Drivers', render: (_v, row) => row.stats?.registered ?? 0 },
    { key: 'verified', label: 'Verified', render: (_v, row) => row.stats?.verified ?? 0 },
    { key: 'active', label: 'Active', render: (_v, row) => row.stats?.active ?? 0 },
    { key: 'verification_rate', label: 'Verify rate', render: (v) => pct(v) },
    { key: 'activation_rate', label: 'Activate rate', render: (v) => pct(v) },
    { key: 'status', label: 'Status' },
  ];

  const pendingColumns = [
    { key: 'name', label: 'Name' },
    { key: 'phone', label: 'Phone / email', render: (v, row) => v || row.email || '—' },
    { key: 'zone', label: 'Zone', render: (v, row) => [row.park, row.zone].filter(Boolean).join(' · ') || '—' },
    { key: 'reason', label: 'Reason', render: (v) => v || '—' },
    {
      key: 'approve',
      label: '',
      render: (_v, row) => (
        <button
          type="button"
          className="keke-btn-primary px-3 py-1.5 rounded-lg text-sm"
          onClick={(e) => { e.stopPropagation(); approve(row); }}
        >
          Approve
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <C.Breadcrumb items={[{ label: 'Agents' }]} />
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div className="flex gap-2">
          {[
            ['pending', 'Pending', pending.length],
            ['active', 'Active', active.length],
          ].map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-3 py-1.5 rounded-lg text-sm ${tab === id ? 'keke-btn-primary' : 'border dark:border-gray-600'}`}
            >
              {label} ({count})
            </button>
          ))}
        </div>
        {canCreateAgents && (
          <button type="button" onClick={() => setOpen(true)} className="keke-btn-primary px-3 py-2 rounded-lg text-sm">Add agent</button>
        )}
      </div>
      {tab === 'active' && (
        <p className="text-sm text-gray-500">Invites are people who used the agent&apos;s code in the app. Drivers are those who completed driver registration. Sort is active drivers first.</p>
      )}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <C.DataTable
          columns={tab === 'pending' ? pendingColumns : activeColumns}
          rows={rows}
          keyField="agent_id"
          loading={loading}
          onRowClick={(row) => onNavigate('agent-detail', row.agent_id)}
          emptyMessage={tab === 'pending' ? 'No pending applications' : 'No agents yet'}
        />
      </div>
      {canCreateAgents && (
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
      )}
    </div>
  );
}

function AgentDetailPage({ id, onBack, onNavigate, showToast }) {
  const canSetTarget = Auth.getRole() !== 'agents_manager';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [targetForm, setTargetForm] = useState({
    cycleName: 'Recruitment cycle',
    targetCount: '20',
    deadline: '',
    bountyRate: '',
  });
  const [savingTarget, setSavingTarget] = useState(false);

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

  const createTarget = async (e) => {
    e.preventDefault();
    if (!targetForm.targetCount || !targetForm.deadline) {
      showToast('Target count and deadline are required', 'error');
      return;
    }
    setSavingTarget(true);
    const res = await Api.post('/api/admin/agents/' + id + '/targets', {
      cycleName: targetForm.cycleName.trim() || 'Recruitment cycle',
      targetCount: Number(targetForm.targetCount),
      deadline: targetForm.deadline,
      bountyRate: targetForm.bountyRate !== '' ? Number(targetForm.bountyRate) : undefined,
    });
    setSavingTarget(false);
    if (res.error) { showToast(res.error, 'error'); return; }
    showToast('Target set');
    setTargetForm({ cycleName: 'Recruitment cycle', targetCount: '20', deadline: '', bountyRate: '' });
    load();
  };

  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (!data?.agent) return <p className="text-gray-500">Agent not found</p>;
  const a = data.agent;
  const s = a.stats || {};
  const cycle = data.cycle;

  return (
    <div className="space-y-4">
      <C.Breadcrumb items={[{ label: 'Agents' }, { label: a.name || 'Agent' }]} />
      <button type="button" onClick={onBack} className="text-blue-600 hover:underline">← Back</button>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{a.name || 'Agent'}</h2>
          <p className="text-sm text-gray-500">{a.phone || a.email} · {a.park || a.zone || 'No park'} · {a.status}</p>
          {a.referral_code && (
            <p className="mt-1 text-sm font-medium">Referral code: {a.referral_code}</p>
          )}
          {a.status === 'pending' && a.reason && (
            <p className="mt-1 text-sm text-gray-600">{a.reason}</p>
          )}
        </div>
        <div className="flex gap-2">
          {a.status === 'active' ? (
            <button type="button" onClick={() => setStatus('inactive')} className="px-3 py-1.5 rounded-lg border text-sm">Deactivate</button>
          ) : (
            <button type="button" onClick={() => setStatus('active')} className="keke-btn-primary px-3 py-1.5 rounded-lg text-sm">
              {a.status === 'pending' ? 'Approve' : 'Activate'}
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[['Invites', s.invited], ['Drivers', s.registered], ['Verified', s.verified], ['Active', s.active], ['Verify rate', pct(a.verification_rate)]].map(([label, value]) => (
          <div key={label} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-xl font-semibold">{value ?? 0}</p>
          </div>
        ))}
      </div>
      {cycle ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">{cycle.cycleName || 'Recruitment cycle'}</p>
          <p className="text-lg font-semibold mt-1">Target {cycle.targetCount} drivers</p>
          <p className="mt-2 text-sm text-gray-600">Deadline {cycle.deadline ? new Date(cycle.deadline).toLocaleDateString() : '—'}</p>
          <p className="text-sm text-gray-600 mt-1">Verified {s.verified ?? 0} / {cycle.targetCount}</p>
        </div>
      ) : canSetTarget ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
          <p className="text-sm font-medium">No active target</p>
          <form onSubmit={createTarget} className="space-y-2">
            <input
              value={targetForm.cycleName}
              onChange={(e) => setTargetForm({ ...targetForm, cycleName: e.target.value })}
              placeholder="Cycle name"
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={targetForm.targetCount}
                onChange={(e) => setTargetForm({ ...targetForm, targetCount: e.target.value })}
                placeholder="Target count"
                inputMode="numeric"
                className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600"
              />
              <input
                type="date"
                value={targetForm.deadline}
                onChange={(e) => setTargetForm({ ...targetForm, deadline: e.target.value })}
                className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600"
              />
            </div>
            <input
              value={targetForm.bountyRate}
              onChange={(e) => setTargetForm({ ...targetForm, bountyRate: e.target.value })}
              placeholder="Bounty ₦ per active driver (optional)"
              inputMode="numeric"
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600"
            />
            <button type="submit" disabled={savingTarget} className="keke-btn-primary px-3 py-2 rounded-lg text-sm">
              {savingTarget ? 'Saving…' : 'Set target'}
            </button>
          </form>
        </div>
      ) : null}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <C.DataTable
          columns={[
            { key: 'name', label: 'Driver' },
            { key: 'phone', label: 'Phone' },
            { key: 'stage', label: 'Stage', render: (v) => (v ? String(v).replace(/^./, (c) => c.toUpperCase()) : 'Registered') },
            { key: 'next_step', label: 'Next', render: (v) => v || '—' },
            { key: 'total_rides', label: 'Rides' },
          ]}
          rows={data.drivers || []}
          keyField="driver_id"
          onRowClick={canSetTarget ? (row) => onNavigate && onNavigate('driver-detail', row.driver_id) : undefined}
          emptyMessage="No drivers tagged to this agent"
        />
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <C.DataTable
          columns={[
            { key: 'name', label: 'App invite', render: (v) => v || '—' },
            { key: 'phone', label: 'Phone / email', render: (v, row) => v || row.email || '—' },
            { key: 'is_driver', label: 'Driver?', render: (v) => (v ? 'Yes' : 'Passenger') },
          ]}
          rows={data.invites || []}
          keyField="user_id"
          emptyMessage="Nobody has used this agent's invite code yet"
        />
      </div>
    </div>
  );
}

window.AdminPages = window.AdminPages || {};
window.AdminPages.Agents = AgentsPage;
window.AdminPages.AgentDetail = AgentDetailPage;
