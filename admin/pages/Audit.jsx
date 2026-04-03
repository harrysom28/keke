const { useState, useEffect } = React;
const Api = window.AdminApi;
const Utils = window.AdminUtils;
const C = window.AdminComponents;

const ACTION_LABELS = {
  user_activate: 'User activated',
  user_deactivate: 'User deactivated',
  user_delete: 'User deleted',
  driver_approve: 'Driver approved',
  driver_reject: 'Driver rejected',
  refund: 'Refund processed',
  dispute_resolve: 'Dispute resolved',
  withdrawal_approve: 'Withdrawal approved',
  vehicle_type_delete: 'Vehicle type deleted',
  settings_update: 'Settings updated',
  promocode_create: 'Promocode created',
  promocode_update: 'Promocode updated',
};

const RESOURCE_LABELS = {
  user: 'User',
  driver: 'Driver',
  payment: 'Payment',
  ride: 'Ride',
  withdrawal: 'Withdrawal',
  vehicle_type: 'Vehicle type',
  promocode: 'Promocode',
  settings: 'Settings',
};

function formatResource(log) {
  const type = RESOURCE_LABELS[log.resourceType] || log.resourceType;
  const id = log.resourceId ? `#${String(log.resourceId).slice(-8)}` : '';
  return `${type}${id}`;
}

function formatAction(log) {
  return ACTION_LABELS[log.action] || log.action.replace(/_/g, ' ');
}

function AuditPage({ showToast }) {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [adminIdFilter, setAdminIdFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: pagination.page,
      limit: pagination.limit,
    });
    if (actionFilter) params.set('action', actionFilter);
    if (resourceFilter) params.set('resourceType', resourceFilter);
    if (adminIdFilter) params.set('adminId', adminIdFilter.trim());

    Api.get('/api/admin/audit-logs?' + params).then((res) => {
      if (res.error) {
        showToast(res.error, 'error');
        setLogs([]);
        setPagination((p) => ({ ...p, total: 0, pages: 0 }));
        return;
      }
      const d = res.data?.data || res.data;
      const auditLogs = d.audit_logs || [];
      const pag = d.pagination || {};
      setLogs(auditLogs);
      setPagination((p) => ({
        ...p,
        total: pag.total ?? 0,
        pages: pag.pages ?? 1,
      }));
    }).finally(() => setLoading(false));
  }, [pagination.page, actionFilter, resourceFilter, adminIdFilter]);

  const columns = [
    {
      key: 'createdAt',
      label: 'Time',
      render: (v) => Utils.formatDate(v),
    },
    {
      key: 'adminEmail',
      label: 'Admin',
    },
    {
      key: 'action',
      label: 'Action',
      render: (_, row) => formatAction(row),
    },
    {
      key: 'resource',
      label: 'Resource',
      render: (_, row) => formatResource(row),
    },
    {
      key: 'details',
      label: 'Details',
      render: (v, row) => {
        if (!v || typeof v !== 'object') return '—';
        const parts = [];
        if (v.refundAmount != null) parts.push(`Refund: ${Utils.formatCurrency(v.refundAmount)}`);
        if (v.reason) parts.push(v.reason);
        if (v.resolution) parts.push(`Resolution: ${v.resolution}`);
        if (v.vehicleTypeName) parts.push(v.vehicleTypeName);
        return parts.length ? parts.join(' · ') : '—';
      },
    },
  ];

  return (
    <div className="space-y-4">
      <C.Breadcrumb items={[{ label: 'Audit logs' }]} />
      <div className="flex flex-wrap gap-2">
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
          className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
        >
          <option value="">All actions</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={resourceFilter}
          onChange={(e) => { setResourceFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
          className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
        >
          <option value="">All resources</option>
          {Object.entries(RESOURCE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Admin ID"
          value={adminIdFilter}
          onChange={(e) => { setAdminIdFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
          className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 w-40"
        />
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <C.DataTable
          columns={columns}
          rows={logs}
          keyField="_id"
          loading={loading}
          emptyMessage="No audit logs yet. Admin actions (user/driver changes, refunds, etc.) will appear here."
        />
        {!loading && logs.length > 0 && (
          <div className="px-4 py-2 border-t dark:border-gray-700">
            <C.Pagination
              page={pagination.page}
              totalPages={pagination.pages}
              onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}

window.AdminPages = window.AdminPages || {};
window.AdminPages.Audit = AuditPage;
