const { useState, useEffect } = React;
const Api = window.AdminApi;
const Utils = window.AdminUtils;
const C = window.AdminComponents;

function SupportPage({ onNavigate, showToast }) {
  const [tickets, setTickets] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: pagination.page, limit: pagination.limit });
    if (status) params.set('status', status);
    if (priority) params.set('priority', priority);
    if (category) params.set('category', category);
    Api.get('/api/admin/support-tickets?' + params).then((res) => {
      if (res.error) {
        showToast(res.error, 'error');
        setTickets([]);
        setPagination((p) => ({ ...p, total: 0, pages: 1 }));
      } else {
        const d = res.data?.data || res.data;
        setTickets(d.tickets || []);
        setPagination((p) => ({ ...p, total: d.pagination?.total ?? 0, pages: d.pagination?.pages ?? 1 }));
      }
    }).finally(() => setLoading(false));
  }, [pagination.page, status, priority, category]);

  const columns = [
    { key: 'ticket_id', label: 'ID', render: (v) => (v || '').slice(-8) },
    { key: 'subject', label: 'Subject' },
    { key: 'category', label: 'Category' },
    { key: 'status', label: 'Status' },
    { key: 'priority', label: 'Priority' },
    { key: 'created_at', label: 'Created', render: (v) => Utils.formatDate(v) },
  ];

  const categoryCounts = tickets.reduce((acc, t) => { acc[t.category || 'other'] = (acc[t.category || 'other'] || 0) + 1; return acc; }, {});

  return (
    <div className="space-y-4">
      <C.Breadcrumb items={[{ label: 'Support' }]} />
      <div className="flex flex-wrap gap-2 items-center">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600">
          <option value="">All status</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select value={priority} onChange={(e) => { setPriority(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600">
          <option value="">All priority</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <select value={category} onChange={(e) => { setCategory(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600">
          <option value="">All categories</option>
          <option value="ride_issue">Ride issue</option>
          <option value="payment_issue">Payment issue</option>
          <option value="account_issue">Account issue</option>
          <option value="refund_request">Refund request</option>
          <option value="technical_issue">Technical issue</option>
          <option value="general">General</option>
          <option value="other">Other</option>
        </select>
      </div>
      {Object.keys(categoryCounts).length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="text-gray-600 dark:text-gray-400">Category breakdown:</span>
          {Object.entries(categoryCounts).map(([cat, count]) => (
            <span key={cat} className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700">{cat}: {count}</span>
          ))}
        </div>
      )}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <C.DataTable columns={columns} rows={tickets} keyField="ticket_id" loading={loading} onRowClick={(row) => onNavigate('ticket-detail', row.ticket_id)} emptyMessage="No tickets" />
        <div className="px-4 py-2 border-t dark:border-gray-700">
          <C.Pagination page={pagination.page} totalPages={pagination.pages} onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))} />
        </div>
      </div>
    </div>
  );
}

function TicketDetailPage({ id, onBack, showToast }) {
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [responseText, setResponseText] = useState('');

  const load = () => {
    if (!id) return;
    setLoading(true);
    Api.get('/api/admin/support-tickets/' + id).then((res) => {
      if (res.error) showToast(res.error, 'error');
      else setTicket(res.data?.data || res.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const resolve = () => Api.post('/api/admin/support-tickets/' + id + '/resolve', { resolutionNote: note }).then((r) => {
    if (r.error) showToast(r.error, 'error');
    else { showToast('Ticket resolved'); setTicket((t) => t ? { ...t, ticket: { ...(t.ticket || t), status: 'resolved' } } : null); }
  });

  const assignToMe = () => Api.post('/api/admin/support-tickets/' + id + '/assign', {}).then((r) => {
    if (r.error) showToast(r.error, 'error');
    else { showToast('Assigned to you'); load(); }
  });

  const sendResponse = () => {
    if (!responseText.trim()) return;
    if (responseText.trim().length < 10) { showToast('Response must be at least 10 characters', 'warning'); return; }
    Api.post('/api/admin/support-tickets/' + id + '/respond', { message: responseText.trim() }).then((r) => {
      if (r.error) showToast(r.error, 'error');
      else { showToast('Response sent'); setResponseText(''); load(); }
    });
  };

  if (loading || !ticket) return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>;
  const t = ticket.ticket || ticket;
  const responses = t.responses || [];

  return (
    <div className="space-y-4">
      <C.Breadcrumb items={[{ label: 'Support', href: '#' }, { label: (t.ticket_id || t._id || id)?.slice(-8) }]} />
      <button type="button" onClick={onBack} className="text-blue-600 hover:underline">← Back</button>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
        <div className="flex flex-wrap justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t.subject}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Category: {t.category} · Priority: {t.priority} · Status: {t.status}</p>
            {t.assigned_to && <p className="text-sm text-gray-600 dark:text-gray-300">Assigned to: {t.assigned_to.name}</p>}
          </div>
          <div className="flex gap-2">
            {!t.assigned_to && <button type="button" onClick={assignToMe} className="px-3 py-1.5 bg-gray-600 text-white rounded-lg text-sm">Assign to me</button>}
            {t.status !== 'resolved' && t.status !== 'closed' && (
              <button type="button" onClick={resolve} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm">Resolve</button>
            )}
          </div>
        </div>
        <div className="border-t dark:border-gray-700 pt-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">From: {t.user?.name} ({t.user?.email})</p>
          <p className="mt-2 text-gray-900 dark:text-white whitespace-pre-wrap">{t.description}</p>
        </div>

        <div className="border-t dark:border-gray-700 pt-4">
          <h3 className="font-medium text-gray-900 dark:text-white mb-2">Conversation</h3>
          <ul className="space-y-3">
            {responses.map((r, i) => (
              <li key={i} className="pl-3 border-l-2 border-blue-200 dark:border-blue-800">
                <p className="text-xs text-gray-500 dark:text-gray-400">{r.user?.name} ({r.user?.role || 'admin'}) · {Utils.formatDate(r.created_at)}</p>
                <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{r.message}</p>
              </li>
            ))}
          </ul>
          {t.status !== 'resolved' && t.status !== 'closed' && (
            <div className="mt-4">
              <textarea value={responseText} onChange={(e) => setResponseText(e.target.value)} placeholder="Reply to customer..." className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600" rows={3} />
              <button type="button" onClick={sendResponse} className="mt-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg">Send response</button>
            </div>
          )}
        </div>

        {t.status !== 'resolved' && t.status !== 'closed' && (
          <div className="border-t dark:border-gray-700 pt-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Resolution note (for Resolve action)</p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note / resolution" className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600" rows={2} />
            <button type="button" onClick={resolve} className="mt-2 px-3 py-1.5 bg-green-600 text-white rounded-lg">Resolve ticket</button>
          </div>
        )}
      </div>
    </div>
  );
}

window.AdminPages = window.AdminPages || {};
window.AdminPages.Support = SupportPage;
window.AdminPages.TicketDetail = TicketDetailPage;
