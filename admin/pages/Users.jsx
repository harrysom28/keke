const { useState, useEffect } = React;
const Api = window.AdminApi;
const Utils = window.AdminUtils;
const C = window.AdminComponents;

function UsersPage({ onNavigate, showToast }) {
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [confirm, setConfirm] = useState({ open: false });

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: pagination.page, limit: pagination.limit });
    if (searchDebounced) params.set('search', searchDebounced);
    if (role) params.set('role', role);
    if (status) params.set('status', status);
    Api.get('/api/admin/users?' + params).then((res) => {
      if (res.error) { showToast(res.error, 'error'); setUsers([]); setPagination((p) => ({ ...p, pages: 0 })); return; }
      const d = res.data?.data || res.data;
      setUsers(d.users || []);
      setPagination((p) => ({ ...p, total: d.pagination?.total ?? 0, pages: d.pagination?.pages ?? 1 }));
    }).finally(() => setLoading(false));
  }, [pagination.page, searchDebounced, role, status]);

  const updateUserRow = (userId, patch) => {
    setUsers((prev) => prev.map((user) => (user.user_id === userId ? { ...user, ...patch } : user)));
  };

  const approveUser = (userId) =>
    Api.patch('/api/admin/users/' + userId, { isVerified: true }).then((res) => {
      if (res.error) {
        showToast(res.error, 'error');
        return;
      }
      updateUserRow(userId, { is_verified: true, driver_verification_status: 'approved', driver_documents_verified: true });
      showToast('Driver approved');
    });

  const suspendUser = (userId) =>
    Api.patch('/api/admin/users/' + userId + '/deactivate').then((res) => {
      if (res.error) {
        showToast(res.error, 'error');
        return;
      }
      updateUserRow(userId, { is_active: false });
      showToast('User suspended');
    });

  const unsuspendUser = (userId) =>
    Api.patch('/api/admin/users/' + userId + '/activate').then((res) => {
      if (res.error) {
        showToast(res.error, 'error');
        return;
      }
      updateUserRow(userId, { is_active: true });
      showToast('User restored');
    });

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone', render: (v) => Utils.maskPhone(Utils.formatPhoneForDisplay(v) || '—') },
    { key: 'role', label: 'Role' },
    { key: 'city', label: 'City', render: (v) => v || '—' },
    {
      key: 'approval_display',
      label: 'Approval',
      render: (_, row) => {
        if (row.role === 'driver') {
          const status = row.driver_verification_status || 'pending';
          const cls = status === 'approved' ? 'bg-green-100 text-green-700' : status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
          const label = status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Pending';
          return (<span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${cls}`}>{label}</span>);
        }
        return (<span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Verified</span>);
      },
    },
    {
      key: 'is_active',
      label: 'Status',
      render: (v) => (
        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${v ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {v ? 'Active' : 'Suspended'}
        </span>
      ),
    },
    { key: 'created_at', label: 'Joined', render: (v) => Utils.formatDate(v) },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          {row.role === 'driver' && (row.driver_verification_status || 'pending') === 'pending' && (
            <button
              type="button"
              onClick={() => setConfirm({
                open: true,
                title: 'Approve driver',
                message: `Approve driver ${row.name || 'this user'}? They will be able to go online.`,
                confirmLabel: 'Approve',
                onConfirm: () => approveUser(row.user_id),
              })}
              className="px-2.5 py-1 rounded-md bg-green-600 text-white text-xs"
            >
              Approve
            </button>
          )}
          {row.is_active ? (
            <button
              type="button"
              onClick={() => setConfirm({
                open: true,
                title: 'Suspend user',
                message: `Suspend ${row.name || 'this user'}? They will lose access until restored.`,
                confirmLabel: 'Suspend',
                danger: true,
                onConfirm: () => suspendUser(row.user_id),
              })}
              className="px-2.5 py-1 rounded-md bg-amber-600 text-white text-xs"
            >
              Suspend
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirm({
                open: true,
                title: 'Restore user',
                message: `Restore ${row.name || 'this user'}?`,
                confirmLabel: 'Restore',
                onConfirm: () => unsuspendUser(row.user_id),
              })}
              className="px-2.5 py-1 rounded-md bg-blue-600 text-white text-xs"
            >
              Restore
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <C.Breadcrumb items={[{ label: 'Users' }]} />
      <div className="flex flex-wrap gap-2">
        <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 w-48" />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600">
          <option value="">All roles</option>
          <option value="passenger">Passenger</option>
          <option value="driver">Driver</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600">
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <C.DataTable columns={columns} rows={users} keyField="user_id" loading={loading} onRowClick={(row) => onNavigate('user-detail', row.user_id)} emptyMessage="No users found" />
        <div className="px-4 py-2 border-t dark:border-gray-700">
          <C.Pagination page={pagination.page} totalPages={pagination.pages} onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))} />
        </div>
      </div>
      <C.ConfirmDialog open={confirm.open} onClose={() => setConfirm({ open: false })} onConfirm={confirm.onConfirm} title={confirm.title || 'Confirm'} message={confirm.message} danger={confirm.danger} confirmLabel={confirm.confirmLabel || 'Confirm'} />
    </div>
  );
}

function UserDetailPage({ id, onBack, showToast }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState({ open: false, action: null });

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Api.get('/api/admin/users/' + id).then((res) => {
      if (res.error) { showToast(res.error, 'error'); setUser(null); return; }
      setUser(res.data?.data || res.data);
    }).finally(() => setLoading(false));
  }, [id]);

  const doActivate = () => Api.patch('/api/admin/users/' + id + '/activate').then((r) => { if (r.error) showToast(r.error, 'error'); else { showToast('User activated'); setUser((u) => u ? { ...u, user: { ...u.user, is_active: true } } : null); } });
  const doDeactivate = () => Api.patch('/api/admin/users/' + id + '/deactivate').then((r) => { if (r.error) showToast(r.error, 'error'); else { showToast('User deactivated'); setUser((u) => u ? { ...u, user: { ...u.user, is_active: false } } : null); } });
  const doApprove = () => Api.patch('/api/admin/users/' + id, { isVerified: true }).then((r) => {
    if (r.error) { showToast(r.error, 'error'); return; }
    showToast('Driver approved');
    setUser((prev) => {
      if (!prev) return null;
      const u = prev.user || prev;
      const nextUser = { ...u, is_verified: true };
      const nextDriver = prev.driver ? { ...prev.driver, verification_status: 'approved', documents_verified: true } : null;
      return { ...prev, user: nextUser, driver: nextDriver };
    });
  });
  const doDelete = () => Api.delete('/api/admin/users/' + id).then((r) => { if (r.error) showToast(r.error, 'error'); else { showToast('User deleted'); onBack(); } });

  if (loading || !user) return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>;
  const u = user.user || user;
  const stats = user.statistics || {};
  const detailRows = [
    ['Name', u.name || '—'],
    ['Email', u.email || '—'],
    ['Phone', Utils.formatPhoneForDisplay(u.phone) || '—'],
    ['Role', u.role || '—'],
    ['Status', u.is_active ? 'Active' : 'Inactive'],
    ['Verified', u.role === 'driver' ? (user.driver?.verification_status === 'approved' ? 'Yes (driver approved)' : 'No') : (u.is_reg_verified ? 'Yes (OTP)' : 'No')],
    ['Registration verified', u.is_reg_verified ? 'Yes' : 'No'],
    ['Registration completed', u.is_reg_completed ? 'Yes' : 'No'],
    ['Onboarding stage', u.onboarding_stage || '—'],
    ['KYC status', u.kyc_status || '—'],
    ['Date of birth', u.date_of_birth ? Utils.formatDate(u.date_of_birth) : '—'],
    ['Gender', u.gender || '—'],
    ['Address', u.address || '—'],
    ['City', u.city || '—'],
    ['State', u.state || '—'],
    ['Country', u.country || '—'],
    ['Wallet balance', Utils.formatCurrency(u.balance ?? 0)],
    ['User total rides', u.total_rides ?? 0],
    ['Rating', u.rating ?? 0],
    ['Referral code', u.referral_code || '—'],
    ['Referred by', u.referred_by || '—'],
    ['Wallet account number', u.wallet_account_number || '—'],
    ['Top-up bank', u.topup_bank_name || '—'],
    ['Top-up account name', u.topup_account_name || '—'],
    ['Top-up account number', u.topup_account_number || '—'],
    ['DVA bank', u.dva_bank_name || '—'],
    ['DVA account name', u.dva_account_name || '—'],
    ['DVA account number', u.dva_account_number || '—'],
    ['Police emergency contact', u.police_emergency_contact || '—'],
    ['Ten-ride free claimed', u.ten_ride_free_claimed ? 'Yes' : 'No'],
    ['Referral rewards claimed', u.referral_rewards_claimed_count ?? 0],
    ['Joined', Utils.formatDate(u.created_at)],
    ['Last updated', Utils.formatDate(u.updated_at)],
  ];

  return (
    <div className="space-y-4">
      <C.Breadcrumb items={[{ label: 'Users', href: '#' }, { label: u.name || u.email || id }]} />
      <button type="button" onClick={onBack} className="text-blue-600 hover:underline">← Back</button>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{u.name || 'Unnamed user'}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{u.email || 'No email'} {u.phone ? `· ${Utils.formatPhoneForDisplay(u.phone)}` : ''}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-gray-600 dark:text-gray-300">
            <span className={`inline-flex px-2.5 py-1 rounded-full ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {u.is_active ? 'Active' : 'Suspended'}
            </span>
            <span className={`inline-flex px-2.5 py-1 rounded-full ${u.role === 'driver' ? (user.driver?.verification_status === 'approved' ? 'bg-green-100 text-green-700' : user.driver?.verification_status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700') : 'bg-green-100 text-green-700'}`}>
              {u.role === 'driver' ? (user.driver?.verification_status === 'approved' ? 'Approved' : user.driver?.verification_status === 'rejected' ? 'Rejected' : 'Pending approval') : 'Verified'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-lg border dark:border-gray-700 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Wallet</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{Utils.formatCurrency(u.balance ?? 0)}</p>
          </div>
          <div className="rounded-lg border dark:border-gray-700 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Role</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{u.role || '—'}</p>
          </div>
          <div className="rounded-lg border dark:border-gray-700 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Total rides</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{stats.total_rides ?? u.total_rides ?? 0}</p>
          </div>
          <div className="rounded-lg border dark:border-gray-700 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Joined</p>
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{Utils.formatDate(u.created_at)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
          {detailRows.map(([label, value]) => (
            <div key={label} className="text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-300">{label}:</span>{' '}
              <span className="text-gray-900 dark:text-white">{value}</span>
            </div>
          ))}
        </div>

        {(stats.total_rides != null || stats.completed_rides != null || stats.total_spent != null) && (
          <div className="pt-4 border-t dark:border-gray-700">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3">Activity & value</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <p><strong>Total rides:</strong> {stats.total_rides ?? 0}</p>
              <p><strong>Completed rides:</strong> {stats.completed_rides ?? 0}</p>
              <p><strong>Lifetime value (spent):</strong> {Utils.formatCurrency(stats.total_spent ?? 0)}</p>
            </div>
          </div>
        )}

        {u.current_location && (
          <div className="pt-4 border-t dark:border-gray-700">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3">Current location</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <p><strong>Address:</strong> {u.current_location.address || '—'}</p>
              <p><strong>Coordinates:</strong> {u.current_location.latitude}, {u.current_location.longitude}</p>
              <p><strong>Last updated:</strong> {u.current_location.last_updated ? Utils.formatDate(u.current_location.last_updated) : '—'}</p>
            </div>
          </div>
        )}

        {Array.isArray(u.emergency_contacts) && u.emergency_contacts.length > 0 && (
          <div className="pt-4 border-t dark:border-gray-700">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3">Emergency contacts</h4>
            <div className="space-y-3">
              {u.emergency_contacts.map((contact, index) => (
                <div key={`${contact.phone || index}-${index}`} className="rounded-lg border dark:border-gray-700 p-3 text-sm">
                  <p><strong>Name:</strong> {contact.name || '—'}</p>
                  <p><strong>Phone:</strong> {Utils.formatPhoneForDisplay(contact.phone) || '—'}</p>
                  <p><strong>Relationship:</strong> {contact.relationship || '—'}</p>
                  <p><strong>Added:</strong> {contact.created_at ? Utils.formatDate(contact.created_at) : '—'}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {Array.isArray(u.addresses) && u.addresses.length > 0 && (
          <div className="pt-4 border-t dark:border-gray-700">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3">Saved addresses</h4>
            <div className="space-y-3">
              {u.addresses.map((address, index) => (
                <div key={`${address.address || index}-${index}`} className="rounded-lg border dark:border-gray-700 p-3 text-sm">
                  <p><strong>Label:</strong> {address.name || address.normalised_label || '—'}</p>
                  <p><strong>Address:</strong> {address.address || '—'}</p>
                  <p><strong>Default:</strong> {address.is_default ? 'Yes' : 'No'}</p>
                  <p><strong>Use count:</strong> {address.use_count ?? 0}</p>
                  <p><strong>Last used:</strong> {address.last_used ? Utils.formatDate(address.last_used) : '—'}</p>
                  {address.location && <p><strong>Coordinates:</strong> {address.location.latitude}, {address.location.longitude}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {user.driver && (
          <div className="pt-4 border-t dark:border-gray-700">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3">Driver profile</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <p><strong>Driver ID:</strong> {user.driver.driver_id || '—'}</p>
              <p><strong>Verification:</strong> {user.driver.verification_status || '—'}</p>
              <p><strong>Documents verified:</strong> {user.driver.documents_verified ? 'Yes' : 'No'}</p>
              <p><strong>Online:</strong> {user.driver.is_online ? 'Yes' : 'No'}</p>
              <p><strong>Available:</strong> {user.driver.is_available ? 'Yes' : 'No'}</p>
              <p><strong>License number:</strong> {user.driver.license_number || '—'}</p>
              {user.driver.vehicle_details && (
                <p className="md:col-span-2">
                  <strong>Vehicle:</strong>{' '}
                  {[user.driver.vehicle_details.year, user.driver.vehicle_details.make, user.driver.vehicle_details.model, user.driver.vehicle_details.color, user.driver.vehicle_details.plate_number]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          {u.role === 'driver' && (user.driver?.verification_status || 'pending') === 'pending' && (
            <button type="button" onClick={() => setConfirm({ open: true, action: 'approve', title: 'Approve driver', message: 'Approve this driver? They will be able to go online.', onConfirm: doApprove, confirmLabel: 'Approve' })} className="px-3 py-1.5 bg-green-600 text-white rounded-lg">Approve</button>
          )}
          {u.is_active ? (
            <button type="button" onClick={() => setConfirm({ open: true, action: 'deactivate', title: 'Suspend user', message: 'Suspend this user? They will lose access until restored.', onConfirm: doDeactivate, confirmLabel: 'Suspend', danger: true })} className="px-3 py-1.5 bg-amber-600 text-white rounded-lg">Suspend</button>
          ) : (
            <button type="button" onClick={() => setConfirm({ open: true, action: 'activate', title: 'Restore user', message: 'Restore this user?', onConfirm: doActivate, confirmLabel: 'Restore' })} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg">Restore</button>
          )}
          <button type="button" onClick={() => setConfirm({ open: true, action: 'delete', message: 'Delete this user? This cannot be undone.', onConfirm: doDelete, danger: true })} className="px-3 py-1.5 bg-red-600 text-white rounded-lg">Delete</button>
        </div>
      </div>
      <C.ConfirmDialog open={confirm.open} onClose={() => setConfirm((c) => ({ ...c, open: false }))} onConfirm={confirm.onConfirm} title={confirm.title || 'Confirm'} message={confirm.message} danger={confirm.danger} confirmLabel={confirm.confirmLabel || 'Confirm'} />
    </div>
  );
}

window.AdminPages = window.AdminPages || {};
window.AdminPages.Users = UsersPage;
window.AdminPages.UserDetail = UserDetailPage;
