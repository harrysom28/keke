const { useMemo, useState } = React;
const Api = window.AdminApi;
const C = window.AdminComponents;

function NotificationsPage({ showToast }) {
  const [targetRole, setTargetRole] = useState('all');
  const [type, setType] = useState('inbox');
  const [priority, setPriority] = useState('normal');
  const [screen, setScreen] = useState('home');
  const [actionType, setActionType] = useState('none');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [cities, setCities] = useState('');
  const [minRideCount, setMinRideCount] = useState('');
  const [inactiveDays, setInactiveDays] = useState('');
  const [previewCount, setPreviewCount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const targetingRules = useMemo(() => {
    const rules = {};
    const parsedCities = (cities || '')
      .split(',')
      .map((city) => city.trim())
      .filter(Boolean);
    if (parsedCities.length > 0) rules.cities = parsedCities;
    if (minRideCount !== '' && !Number.isNaN(Number(minRideCount))) {
      rules.min_ride_count = Number(minRideCount);
    }
    if (inactiveDays !== '' && !Number.isNaN(Number(inactiveDays))) {
      rules.inactive_days = Number(inactiveDays);
    }
    return rules;
  }, [cities, inactiveDays, minRideCount]);

  const payload = useMemo(() => {
    const actionPayload = actionType === 'navigate' ? { screen } : null;
    return {
      title: title.trim(),
      message: message.trim(),
      type,
      priority,
      target_role: targetRole,
      targeting_rules: targetingRules,
      screen,
      action_type: actionType,
      action_payload: actionPayload,
    };
  }, [actionType, message, priority, screen, targetRole, targetingRules, title, type]);

  const preview = () => {
    setPreviewLoading(true);
    Api.post('/api/admin/notifications/targeting-preview', {
      target_role: targetRole,
      targeting_rules: targetingRules,
    }).then((r) => {
      if (r.error) {
        showToast(r.error, 'error');
        setPreviewCount(null);
      } else {
        const count = r.data?.data?.matching_users ?? r.data?.matching_users ?? 0;
        setPreviewCount(count);
        showToast(`Preview: ${count} matching user${count === 1 ? '' : 's'}`);
      }
    }).finally(() => setPreviewLoading(false));
  };

  const send = () => {
    if (!title.trim()) { showToast('Enter a title', 'warning'); return; }
    if (!message.trim()) { showToast('Enter a message', 'warning'); return; }
    setLoading(true);
    Api.post('/api/admin/notifications/broadcast', payload).then((r) => {
      if (r.error) showToast(r.error, 'error');
      else {
        const sent = r.data?.data?.sent ?? r.data?.sent ?? 0;
        showToast(`Notification sent to ${sent} user${sent === 1 ? '' : 's'}`);
        setTitle('');
        setMessage('');
        setCities('');
        setMinRideCount('');
        setInactiveDays('');
        setPreviewCount(null);
      }
      setLoading(false);
    });
  };

  return (
    <div className="space-y-4">
      <C.Breadcrumb items={[{ label: 'Notifications' }]} />
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 max-w-3xl space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target</label>
            <select value={targetRole} onChange={(e) => setTargetRole(e.target.value)} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600">
              <option value="all">All users</option>
              <option value="rider">Riders</option>
              <option value="driver">Drivers</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Delivery type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600">
              <option value="inbox">Inbox</option>
              <option value="alert">Alert</option>
              <option value="banner">Banner</option>
              <option value="push">Push</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600">
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Screen</label>
            <select value={screen} onChange={(e) => setScreen(e.target.value)} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600">
              <option value="home">Home</option>
              <option value="ride">Ride</option>
              <option value="wallet">Wallet</option>
              <option value="notifications">Notifications</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600" placeholder="Notification title" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600" rows={4} placeholder="Message body" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cities</label>
            <input value={cities} onChange={(e) => setCities(e.target.value)} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600" placeholder="Abakaliki, Enugu" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Min ride count</label>
            <input value={minRideCount} onChange={(e) => setMinRideCount(e.target.value)} type="number" min="0" className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600" placeholder="Optional" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Inactive days</label>
            <input value={inactiveDays} onChange={(e) => setInactiveDays(e.target.value)} type="number" min="0" className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600" placeholder="Optional" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Action on tap</label>
          <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="w-full max-w-xs px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600">
            <option value="none">None</option>
            <option value="navigate">Navigate</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={preview} disabled={previewLoading} className="px-4 py-2 border rounded-lg hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700 disabled:opacity-50">
            {previewLoading ? 'Checking…' : 'Preview audience'}
          </button>
          <button type="button" onClick={send} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Sending…' : 'Send notification'}
          </button>
          {previewCount != null && (
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Matching users: <strong>{previewCount}</strong>
            </span>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        This page uses <code>POST /api/admin/notifications/broadcast</code> and <code>POST /api/admin/notifications/targeting-preview</code>.
      </p>
    </div>
  );
}

window.AdminPages = window.AdminPages || {};
window.AdminPages.Notifications = NotificationsPage;
