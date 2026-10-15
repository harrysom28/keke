const { useState, useEffect } = React;
const Api = window.AdminApi;
const Utils = window.AdminUtils;
const C = window.AdminComponents;

function RidesPage({ onNavigate, showToast }) {
  const [rides, setRides] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [searchId, setSearchId] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  useEffect(() => { const t = setTimeout(() => setSearchDebounced(searchId), 300); return () => clearTimeout(t); }, [searchId]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: pagination.page, limit: 20 });
    if (status) params.set('status', status);
    if (searchDebounced) params.set('search', searchDebounced);
    Api.get('/api/admin/rides?' + params).then((res) => {
      if (res.error) { showToast(res.error, 'error'); setRides([]); return; }
      const d = res.data?.data || res.data;
      setRides(d.rides || []);
      setPagination((p) => ({ ...p, pages: d.pagination?.pages ?? 1 }));
    }).finally(() => setLoading(false));
  }, [pagination.page, status, searchDebounced]);

  const columns = [
    { key: 'ride_id', label: 'Ride ID', render: (v) => (v || '').slice(-8) },
    { key: 'rider', label: 'Rider', render: (v) => v?.name ?? '—' },
    { key: 'driver', label: 'Driver', render: (v) => v?.name ?? '—' },
    { key: 'status', label: 'Status' },
    { key: 'fare', label: 'Fare', render: (v) => Utils.formatCurrency(v) },
  ];

  return (
    <div className="space-y-4">
      <C.Breadcrumb items={[{ label: 'Rides' }]} />
      <div className="flex flex-wrap gap-2">
        <input type="text" placeholder="Ride, rider, or driver..." value={searchId} onChange={(e) => setSearchId(e.target.value)} className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 w-56" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600">
          <option value="">All status</option>
          <option value="requested">Requested</option>
          <option value="accepted">Accepted</option>
          <option value="in-progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <C.DataTable columns={columns} rows={rides} keyField="ride_id" loading={loading} onRowClick={(row) => onNavigate('ride-detail', row.ride_id)} emptyMessage="No rides found" />
        <div className="px-4 py-2 border-t dark:border-gray-700">
          <C.Pagination page={pagination.page} totalPages={pagination.pages} onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))} />
        </div>
      </div>
    </div>
  );
}

function RideDetailPage({ id, onBack, showToast }) {
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [drivers, setDrivers] = useState([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [assignDriverId, setAssignDriverId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [completeModal, setCompleteModal] = useState({ open: false, reason: '', adminNote: '' });
  const [completing, setCompleting] = useState(false);
  const [statusDraft, setStatusDraft] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);
  const [dispute, setDispute] = useState({ resolution: 'no_action', refundAmount: '', reason: '' });
  const [disputing, setDisputing] = useState(false);

  const loadRide = () => {
    if (!id) return;
    setLoading(true);
    Api.get('/api/admin/rides/' + id).then((res) => {
      if (res.error) { showToast(res.error, 'error'); setRide(null); return; }
      setRide(res.data?.data || res.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadRide(); }, [id]);

  const r = ride?.ride || ride;
  const nextStatuses = ride?.allowed_next_statuses || [];
  const canDispute = r && (r.status === 'completed' || r.status === 'issue_flagged');
  const canAssign = r && (r.status === 'requested' || r.status === 'no-driver-found') && !r.driver;
  const canForceComplete = r && ['in-progress', 'issue_flagged', 'driver_offline'].includes(r.status);
  const vehicleTypeId = r?.vehicle_type_id || null;

  useEffect(() => {
    if (!canAssign) return;
    setDriversLoading(true);
    Api.get('/api/admin/drivers?limit=100&verificationStatus=approved').then((res) => {
      if (res.error) { setDrivers([]); return; }
      const list = res.data?.data?.drivers || res.data?.drivers || [];
      setDrivers(list);
    }).finally(() => setDriversLoading(false));
  }, [canAssign]);

  const eligibleDrivers = vehicleTypeId
    ? drivers.filter((d) => (d.vehicle_details?.vehicle_type || d.vehicle_type) === vehicleTypeId)
    : drivers;

  const handleAssignDriver = () => {
    if (!assignDriverId || assigning) return;
    setAssigning(true);
    Api.post('/api/admin/rides/' + id + '/assign', { driverId: assignDriverId })
      .then((res) => {
        if (res.error) { showToast(res.error, 'error'); return; }
        showToast('Driver assigned successfully');
        setAssignDriverId('');
        loadRide();
      })
      .finally(() => setAssigning(false));
  };

  const handleForceComplete = () => {
    if (completing) return;
    setCompleting(true);
    Api.post('/api/admin/rides/' + id + '/complete', {
      reason: completeModal.reason || undefined,
      adminNote: completeModal.adminNote || undefined,
    }).then((res) => {
      if (res.error) { showToast(res.error, 'error'); return; }
      showToast('Ride marked completed');
      setCompleteModal({ open: false, reason: '', adminNote: '' });
      loadRide();
    }).finally(() => setCompleting(false));
  };

  const handleStatusChange = () => {
    if (!statusDraft || statusSaving) return;
    if (statusReason.trim().length < 3) {
      showToast('Reason must be at least 3 characters', 'warning');
      return;
    }
    setStatusSaving(true);
    Api.patch('/api/admin/rides/' + id, { status: statusDraft, reason: statusReason.trim() }).then((res) => {
      if (res.error) { showToast(res.error, 'error'); return; }
      showToast('Ride status updated');
      setStatusDraft('');
      setStatusReason('');
      loadRide();
    }).finally(() => setStatusSaving(false));
  };

  const handleDispute = () => {
    if (disputing) return;
    const payload = {
      resolution: dispute.resolution,
      reason: dispute.reason.trim() || undefined,
    };
    if (dispute.refundAmount !== '') {
      const amount = parseFloat(dispute.refundAmount);
      if (Number.isNaN(amount) || amount < 0) {
        showToast('Refund amount must be a number', 'warning');
        return;
      }
      if (amount > 0) payload.refundAmount = amount;
    }
    setDisputing(true);
    Api.post('/api/admin/rides/' + id + '/dispute', payload).then((res) => {
      if (res.error) { showToast(res.error, 'error'); return; }
      showToast('Dispute recorded');
      setDispute({ resolution: 'no_action', refundAmount: '', reason: '' });
      loadRide();
    }).finally(() => setDisputing(false));
  };

  if (loading || !ride) return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>;
  return (
    <div className="space-y-4">
      <C.Breadcrumb items={[{ label: 'Rides', href: '#' }, { label: r.ride_id?.slice(-8) || id }]} />
      <button type="button" onClick={onBack} className="text-blue-600 hover:underline">← Back</button>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
        <p><strong>Rider:</strong> {r.rider?.name} ({Utils.maskPhone(Utils.formatPhoneForDisplay(r.rider?.phone) || '—')})</p>
        <p><strong>Driver:</strong> {r.driver?.name ?? '—'}</p>
        <p><strong>Status:</strong> {r.status}</p>
        <p><strong>Fare:</strong> {Utils.formatCurrency(r.fare)}</p>
        <p><strong>Created:</strong> {Utils.formatDate(r.created_at)}</p>

        {canAssign && (
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Assign driver</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Select a verified driver to assign to this ride. Only drivers matching the ride&apos;s vehicle type are shown.</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1 min-w-[200px]">
                <label htmlFor="assign-driver" className="text-sm text-gray-700 dark:text-gray-300">Driver</label>
                <select
                  id="assign-driver"
                  value={assignDriverId}
                  onChange={(e) => setAssignDriverId(e.target.value)}
                  disabled={driversLoading}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                >
                  <option value="">Select driver...</option>
                  {eligibleDrivers.map((d) => (
                    <option key={d.driver_id} value={d.driver_id}>
                      {d.user?.name || 'Driver'} {d.vehicle_details?.plate_number ? `(${d.vehicle_details.plate_number})` : ''}
                    </option>
                  ))}
                </select>
                {driversLoading && <span className="text-xs text-gray-500">Loading drivers...</span>}
                {!driversLoading && eligibleDrivers.length === 0 && <span className="text-xs text-amber-600 dark:text-amber-400">No verified drivers match this ride&apos;s vehicle type.</span>}
              </div>
              <button
                type="button"
                onClick={handleAssignDriver}
                disabled={!assignDriverId || assigning}
                className="shrink-0 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {assigning ? 'Assigning...' : 'Assign driver'}
              </button>
            </div>
          </div>
        )}

        {canForceComplete && (
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Force complete</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Mark this stuck ride as completed. Payment processing runs automatically when possible.</p>
            <button
              type="button"
              onClick={() => setCompleteModal({ open: true, reason: '', adminNote: '' })}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
            >
              Force complete ride
            </button>
          </div>
        )}

        {nextStatuses.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Change status</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Only transitions the ride already allows are listed. Fare stays as quoted.</p>
            {nextStatuses.includes('completed') && (
              <p className="text-sm text-amber-700 dark:text-amber-400 mb-3">Choosing completed here only changes the status. Use Force complete to settle payment on a stuck trip.</p>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="ride-status" className="text-sm text-gray-700 dark:text-gray-300">New status</label>
                <select id="ride-status" value={statusDraft} onChange={(e) => setStatusDraft(e.target.value)} className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200">
                  <option value="">Select status...</option>
                  {nextStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </div>
              <input type="text" placeholder="Reason (required)" value={statusReason} onChange={(e) => setStatusReason(e.target.value)} className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 min-w-[220px]" />
              <button type="button" onClick={handleStatusChange} disabled={!statusDraft || statusSaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {statusSaving ? 'Saving…' : 'Update status'}
              </button>
            </div>
          </div>
        )}

        {canDispute && (
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600 space-y-2">
            <h3 className="font-medium text-gray-900 dark:text-gray-100">Dispute</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Opens a support ticket for this ride. A refund is applied only when a completed payment exists.</p>
            <select value={dispute.resolution} onChange={(e) => setDispute((d) => ({ ...d, resolution: e.target.value }))} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200">
              <option value="no_action">No refund</option>
              <option value="refund">Full refund</option>
              <option value="partial_refund">Partial refund</option>
              <option value="refund_to_wallet">Refund to wallet</option>
            </select>
            <input type="number" min="0" step="0.01" placeholder="Refund amount (optional)" value={dispute.refundAmount} onChange={(e) => setDispute((d) => ({ ...d, refundAmount: e.target.value }))} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200" />
            <input type="text" placeholder="Reason" value={dispute.reason} onChange={(e) => setDispute((d) => ({ ...d, reason: e.target.value }))} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200" />
            {ride?.payment && ride.payment.status !== 'completed' && dispute.refundAmount && (
              <p className="text-sm text-amber-700 dark:text-amber-400">This ride&apos;s payment is {ride.payment.status}, so a refund amount will not be applied.</p>
            )}
            {!ride?.payment && dispute.refundAmount && (
              <p className="text-sm text-amber-700 dark:text-amber-400">No payment is on file, so a refund amount will not be applied.</p>
            )}
            <button type="button" onClick={handleDispute} disabled={disputing} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {disputing ? 'Saving…' : 'Record dispute'}
            </button>
          </div>
        )}
      </div>

      <C.Modal open={completeModal.open} onClose={() => setCompleteModal({ open: false, reason: '', adminNote: '' })} title="Force complete ride">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Optional notes for audit trail.</p>
        <input type="text" placeholder="Reason shown in status history" value={completeModal.reason} onChange={(e) => setCompleteModal((m) => ({ ...m, reason: e.target.value }))} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 mb-2" />
        <input type="text" placeholder="Internal admin note" value={completeModal.adminNote} onChange={(e) => setCompleteModal((m) => ({ ...m, adminNote: e.target.value }))} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 mb-2" />
        <button type="button" onClick={handleForceComplete} disabled={completing} className="mt-2 px-3 py-1.5 bg-amber-600 text-white rounded-lg disabled:opacity-50">
          {completing ? 'Completing…' : 'Confirm force complete'}
        </button>
      </C.Modal>
    </div>
  );
}

window.AdminPages = window.AdminPages || {};
window.AdminPages.Rides = RidesPage;
window.AdminPages.RideDetail = RideDetailPage;
