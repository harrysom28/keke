const { useState, useEffect } = React;
const Api = window.AdminApi;
const Utils = window.AdminUtils;
const C = window.AdminComponents;

function DriversPage({ onNavigate, showToast }) {
  const [drivers, setDrivers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState('');
  const [agentId, setAgentId] = useState('');
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    Api.get('/api/admin/agents').then((res) => {
      if (!res.error) setAgents(res.data?.data?.agents || []);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: pagination.page, limit: 20 });
    if (verificationStatus) params.set('verificationStatus', verificationStatus);
    if (agentId) params.set('agentId', agentId);
    Api.get('/api/admin/drivers?' + params).then((res) => {
      if (res.error) { showToast(res.error, 'error'); setDrivers([]); return; }
      const d = res.data?.data || res.data;
      setDrivers(d.drivers || []);
      setPagination((p) => ({ ...p, pages: d.pagination?.pages ?? 1 }));
    }).finally(() => setLoading(false));
  }, [pagination.page, verificationStatus, agentId]);

  const columns = [
    { key: 'user', label: 'Name', render: (v) => v?.name ?? '—' },
    { key: 'verification_status', label: 'Status' },
    { key: 'documents_verified', label: 'Verified', render: (v) => (v ? 'Yes' : 'No') },
    { key: 'is_online', label: 'Online', render: (v) => (v ? 'Yes' : 'No') },
    {
      key: 'rating',
      label: 'Rating',
      render: (v) => {
        if (!v || typeof v !== 'object') return v ?? '—';
        const avg = typeof v.average === 'number' ? v.average.toFixed(1) : null;
        const count = typeof v.count === 'number' ? v.count : null;
        if (avg == null && count == null) return '—';
        if (avg != null && count != null) return `${avg} (${count})`;
        if (avg != null) return String(avg);
        return `${count}`;
      },
    },
  ];

  return (
    <div className="space-y-4">
      <C.Breadcrumb items={[{ label: 'Drivers' }]} />
      <div className="flex gap-2 flex-wrap">
        <select value={verificationStatus} onChange={(e) => { setVerificationStatus(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select value={agentId} onChange={(e) => { setAgentId(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600">
          <option value="">All agents</option>
          {agents.filter((a) => a.status === 'active').map((a) => (
            <option key={a.agent_id} value={a.agent_id}>{a.name || a.phone || a.email || a.agent_id}</option>
          ))}
        </select>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <C.DataTable columns={columns} rows={drivers} keyField="driver_id" loading={loading} onRowClick={(row) => onNavigate('driver-detail', row.driver_id || row.user?.user_id)} emptyMessage="No drivers found" />
        <div className="px-4 py-2 border-t dark:border-gray-700">
          <C.Pagination page={pagination.page} totalPages={pagination.pages} onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))} />
        </div>
      </div>
    </div>
  );
}

function DriverDetailPage({ id, onBack, onNavigate, showToast }) {
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, type: '', reason: '' });

  const loadDriver = () => {
    if (!id) return;
    setLoading(true);
    Api.get('/api/admin/drivers/' + id).then((res) => {
      if (res.error) { showToast(res.error, 'error'); setDriver(null); return; }
      setDriver(res.data?.data || res.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDriver();
  }, [id]);

  const doVerify = () => Api.patch('/api/admin/drivers/' + (driver?.driver?.driver_id || id) + '/verify').then((r) => {
    if (r.error) showToast(r.error, 'error');
    else { showToast('Driver verified'); loadDriver(); }
    setModal({ open: false, type: '', reason: '' });
  });
  const doReject = () => {
    if (!modal.reason || modal.reason.trim().length < 10) {
      showToast('Rejection reason must be at least 10 characters', 'warning');
      return;
    }
    Api.patch('/api/admin/drivers/' + (driver?.driver?.driver_id || id) + '/reject', { reason: modal.reason.trim() }).then((r) => {
      if (r.error) showToast(r.error, 'error');
      else { showToast('Driver rejected'); loadDriver(); }
      setModal({ open: false, type: '', reason: '' });
    });
  };

  const doSuspend = () => Api.patch('/api/admin/users/' + review.user_id + '/deactivate').then((r) => {
    if (r.error) showToast(r.error, 'error');
    else { showToast('Driver suspended'); loadDriver(); }
    setModal({ open: false, type: '', reason: '' });
  });

  const doRestore = () => Api.patch('/api/admin/users/' + review.user_id + '/activate').then((r) => {
    if (r.error) showToast(r.error, 'error');
    else { showToast('Driver restored'); loadDriver(); }
    setModal({ open: false, type: '', reason: '' });
  });

  const doApproveKyc = () => Api.patch('/api/admin/drivers/kyc/' + review.user_id + '/approve').then((r) => {
    if (r.error) showToast(r.error, 'error');
    else { showToast('Identity documents approved'); loadDriver(); }
    setModal({ open: false, type: '', reason: '' });
  });

  const doApproveVehicle = () => Api.patch('/api/admin/drivers/vehicle/' + review.user_id + '/approve').then((r) => {
    if (r.error) showToast(r.error, 'error');
    else { showToast('Vehicle documents approved'); loadDriver(); }
    setModal({ open: false, type: '', reason: '' });
  });

  const doRejectKyc = () => {
    if (!modal.reason || modal.reason.trim().length < 10) {
      showToast('Rejection reason must be at least 10 characters', 'warning');
      return;
    }
    Api.patch('/api/admin/drivers/kyc/' + review.user_id + '/reject', { reason: modal.reason.trim() }).then((r) => {
      if (r.error) showToast(r.error, 'error');
      else { showToast('Identity documents rejected'); loadDriver(); }
      setModal({ open: false, type: '', reason: '' });
    });
  };

  const doRejectVehicle = () => {
    if (!modal.reason || modal.reason.trim().length < 10) {
      showToast('Rejection reason must be at least 10 characters', 'warning');
      return;
    }
    Api.patch('/api/admin/drivers/vehicle/' + review.user_id + '/reject', { reason: modal.reason.trim() }).then((r) => {
      if (r.error) showToast(r.error, 'error');
      else { showToast('Vehicle documents rejected'); loadDriver(); }
      setModal({ open: false, type: '', reason: '' });
    });
  };

  if (loading || !driver) return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>;
  const d = driver.driver || driver;
  const u = d.user || {};
  const review = driver.review || {};
  const identity = review.identity || {};
  const vehicle = review.vehicle || {};
  const progress = review.upload_progress || {};
  const progressPercent = progress.percent ?? 0;
  const isPdf = (url) => {
    if (!url || typeof url !== 'string') return false;
    const u = url.toLowerCase();
    if (u.includes('.pdf')) return true;
    if (u.includes('/raw/upload/')) return true;
    if (u.includes('res.cloudinary.com') && u.includes('/raw/')) return true;
    return false;
  };
  const badgeClass = (value) => {
    if (value === 'verified' || value === 'approved') return 'bg-green-100 text-green-700';
    if (value === 'rejected') return 'bg-red-100 text-red-700';
    if (value === 'pending') return 'bg-amber-100 text-amber-700';
    return 'bg-gray-100 text-gray-700';
  };
  const Checklist = ({ items }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
      {(items || []).map((item) => (
        <div key={item.key} className="flex items-center gap-2">
          <span className={`inline-flex w-5 h-5 rounded-full items-center justify-center text-xs ${item.complete ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {item.complete ? '✓' : '•'}
          </span>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
  return (
    <div className="space-y-4">
      <C.Breadcrumb items={[{ label: 'Drivers', href: '#' }, { label: u.name || id }]} />
      <button type="button" onClick={onBack} className="text-blue-600 hover:underline">← Back</button>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{u.name || 'Unnamed driver'}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{u.email || 'No email'} {u.phone ? `· ${Utils.formatPhoneForDisplay(u.phone)}` : ''}</p>
            {d.referred_by_agent_id && (
              <button
                type="button"
                onClick={() => onNavigate && onNavigate('agent-detail', d.referred_by_agent_id)}
                className="mt-1 text-sm text-blue-600 hover:underline"
              >
                Referred by agent
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex px-2.5 py-1 rounded-full text-sm ${badgeClass(review.overall_verification_status || d.verification_status)}`}>
              {review.overall_verification_status || d.verification_status || 'pending'}
            </span>
            <span className={`inline-flex px-2.5 py-1 rounded-full text-sm ${review.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {review.is_active ? 'Active' : 'Suspended'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-lg border dark:border-gray-700 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Upload progress</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{progressPercent}%</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{progress.completed_items ?? 0} / {progress.total_items ?? 0} items completed</p>
          </div>
          <div className="rounded-lg border dark:border-gray-700 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Onboarding stage</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{d.onboarding_stage || '—'}</p>
          </div>
          <div className="rounded-lg border dark:border-gray-700 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">KYC status</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{d.kyc_status || '—'}</p>
          </div>
          <div className="rounded-lg border dark:border-gray-700 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Total rides</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{driver.statistics?.total_rides ?? 0}</p>
          </div>
        </div>

        <div>
          <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div className="h-full bg-green-600" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            {(progress.steps || []).map((step) => (
              <div key={step.key} className="rounded-lg border dark:border-gray-700 p-3 text-sm">
                <p className="font-medium text-gray-900 dark:text-white">{step.label}</p>
                <p className={`mt-1 inline-flex px-2 py-0.5 rounded-full text-xs ${step.rejected ? 'bg-red-100 text-red-700' : step.verified ? 'bg-green-100 text-green-700' : step.complete ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>
                  {step.rejected ? 'Rejected' : step.verified ? 'Verified' : step.complete ? 'Uploaded' : 'Not started'}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {d.has_driver_profile && d.verification_status === 'pending' && (
            <>
              <button type="button" onClick={() => setModal({ open: true, type: 'verify' })} className="px-3 py-1.5 bg-green-600 text-white rounded-lg">Approve driver</button>
              <button type="button" onClick={() => setModal({ open: true, type: 'reject', reason: '' })} className="px-3 py-1.5 bg-red-600 text-white rounded-lg">Reject driver</button>
            </>
          )}
          {review.user_id && (review.is_active ? (
            <button type="button" onClick={() => setModal({ open: true, type: 'suspend' })} className="px-3 py-1.5 bg-amber-600 text-white rounded-lg">Suspend driver</button>
          ) : (
            <button type="button" onClick={() => setModal({ open: true, type: 'restore' })} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg">Restore driver</button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t dark:border-gray-700">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-gray-900 dark:text-white">Identity documents</h3>
              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs ${badgeClass(identity.verification_status)}`}>
                {identity.verification_status || 'not_started'}
              </span>
            </div>
            <Checklist items={identity.checklist} />
            <div className="space-y-2 text-sm">
              <p><strong>ID type:</strong> {identity.id_type || '—'}</p>
              <p><strong>ID number:</strong> {identity.id_number || '—'}</p>
              <p><strong>Uploaded:</strong> {identity.created_at ? Utils.formatDate(identity.created_at) : '—'}</p>
              {identity.rejection_reason && <p><strong>Rejection reason:</strong> {identity.rejection_reason}</p>}
            </div>
            {(identity.id_image_url || identity.selfie_url) && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Preview</p>
                <div className="flex flex-wrap gap-3">
                  {identity.id_image_url && (
                    <div className="flex flex-col gap-1">
                      {isPdf(identity.id_image_url) ? (
                        <div>
                          <iframe
                            src={identity.id_image_url}
                            style={{ width: '100%', height: '400px', border: 'none' }}
                            title="Document preview"
                          />
                          <a href={identity.id_image_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginTop: '8px', fontSize: '13px' }}>
                            Open document in new tab
                          </a>
                        </div>
                      ) : (
                        <>
                          <img
                            src={identity.id_image_url}
                            alt="ID document"
                            className="h-32 w-48 object-cover rounded border dark:border-gray-700"
                            style={{ maxWidth: '100%' }}
                          />
                          <a href={identity.id_image_url} target="_blank" rel="noreferrer" className="px-2 py-1 border rounded text-xs text-center">
                            Open full ID
                          </a>
                        </>
                      )}
                    </div>
                  )}
                  {identity.selfie_url && (
                    <div className="flex flex-col gap-1">
                      {isPdf(identity.selfie_url) ? (
                        <div>
                          <iframe
                            src={identity.selfie_url}
                            style={{ width: '100%', height: '400px', border: 'none' }}
                            title="Document preview"
                          />
                          <a href={identity.selfie_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginTop: '8px', fontSize: '13px' }}>
                            Open document in new tab
                          </a>
                        </div>
                      ) : (
                        <>
                          <img
                            src={identity.selfie_url}
                            alt="Selfie"
                            className="h-32 w-32 object-cover rounded-full border dark:border-gray-700"
                            style={{ maxWidth: '100%' }}
                          />
                          <a href={identity.selfie_url} target="_blank" rel="noreferrer" className="px-2 py-1 border rounded text-xs text-center">
                            Open full selfie
                          </a>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            {review.user_id && identity.exists && (
              <div className="flex flex-wrap gap-2">
                {identity.verification_status !== 'verified' && (
                  <button type="button" onClick={() => setModal({ open: true, type: 'approve-kyc' })} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm">Approve identity</button>
                )}
                <button type="button" onClick={() => setModal({ open: true, type: 'reject-kyc', reason: '' })} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm">Reject identity</button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-gray-900 dark:text-white">Vehicle documents</h3>
              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs ${badgeClass(vehicle.verification_status)}`}>
                {vehicle.verification_status || 'not_started'}
              </span>
            </div>
            <Checklist items={vehicle.checklist} />
            <div className="space-y-2 text-sm">
              <p><strong>Vehicle type:</strong> {vehicle.vehicle_type?.name || '—'}</p>
              <p><strong>Plate number:</strong> {vehicle.plate_number || d.vehicle_details?.plate_number || '—'}</p>
              <p><strong>Vehicle:</strong> {[vehicle.year, vehicle.make, vehicle.model, vehicle.color].filter(Boolean).join(' · ') || '—'}</p>
              <p><strong>Uploaded:</strong> {vehicle.created_at ? Utils.formatDate(vehicle.created_at) : '—'}</p>
              {vehicle.rejection_reason && <p><strong>Rejection reason:</strong> {vehicle.rejection_reason}</p>}
            </div>
            {(vehicle.insurance_document_url || (vehicle.vehicle_documents || []).some((doc) => doc.url)) && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Vehicle document previews</p>
                <div className="flex flex-wrap gap-3">
                  {vehicle.insurance_document_url && (
                    <div className="flex flex-col gap-1">
                      {isPdf(vehicle.insurance_document_url) ? (
                        <div>
                          <iframe
                            src={vehicle.insurance_document_url}
                            style={{ width: '100%', height: '400px', border: 'none' }}
                            title="Document preview"
                          />
                          <a href={vehicle.insurance_document_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginTop: '8px', fontSize: '13px' }}>
                            Open document in new tab
                          </a>
                        </div>
                      ) : (
                        <>
                          <img
                            src={vehicle.insurance_document_url}
                            alt="Insurance document"
                            className="h-32 w-48 object-cover rounded border dark:border-gray-700"
                            style={{ maxWidth: '100%' }}
                          />
                          <a href={vehicle.insurance_document_url} target="_blank" rel="noreferrer" className="px-2 py-1 border rounded text-xs text-center">
                            Open full insurance
                          </a>
                        </>
                      )}
                    </div>
                  )}
                  {(vehicle.vehicle_documents || []).map((doc, index) =>
                    doc.url ? (
                      <div key={`${doc.type || index}-${index}`} className="flex flex-col gap-1">
                        {isPdf(doc.url) ? (
                          <div>
                            <iframe
                              src={doc.url}
                              style={{ width: '100%', height: '400px', border: 'none' }}
                              title="Document preview"
                            />
                            <a href={doc.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginTop: '8px', fontSize: '13px' }}>
                              Open document in new tab
                            </a>
                          </div>
                        ) : (
                          <>
                            <img
                              src={doc.url}
                              alt={doc.type || `Vehicle document ${index + 1}`}
                              className="h-32 w-48 object-cover rounded border dark:border-gray-700"
                              style={{ maxWidth: '100%' }}
                            />
                            <a href={doc.url} target="_blank" rel="noreferrer" className="px-2 py-1 border rounded text-xs text-center">
                              Open full {doc.type || `document ${index + 1}`}
                            </a>
                          </>
                        )}
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            )}
            {review.user_id && vehicle.exists && (
              <div className="flex flex-wrap gap-2">
                {vehicle.verification_status !== 'verified' && (
                  <button type="button" onClick={() => setModal({ open: true, type: 'approve-vehicle' })} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm">Approve vehicle</button>
                )}
                <button type="button" onClick={() => setModal({ open: true, type: 'reject-vehicle', reason: '' })} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm">Reject vehicle</button>
              </div>
            )}
          </div>
        </div>

        <div className="pt-4 border-t dark:border-gray-700 text-sm space-y-2">
          <p><strong>Email:</strong> {u.email || '—'}</p>
          <p><strong>Phone:</strong> {Utils.maskPhone(Utils.formatPhoneForDisplay(u.phone) || '—')}</p>
          <p>
            <strong>Rating:</strong>{' '}
            {(() => {
              const v = d.rating;
              if (!v || typeof v !== 'object') return v ?? '—';
              const avg = typeof v.average === 'number' ? v.average.toFixed(1) : null;
              const count = typeof v.count === 'number' ? v.count : null;
              if (avg == null && count == null) return '—';
              if (avg != null && count != null) return `${avg} (${count})`;
              if (avg != null) return String(avg);
              return `${count}`;
            })()}
          </p>
          <p><strong>Documents verified:</strong> {d.documents_verified ? 'Yes' : 'No'}</p>
          {review.overall_rejection_reason && <p><strong>Overall rejection reason:</strong> {review.overall_rejection_reason}</p>}
        </div>
      </div>
      {modal.open && modal.type === 'verify' && (
        <C.ConfirmDialog open onClose={() => setModal({ open: false })} onConfirm={doVerify} title="Approve driver" message="Approve this driver?" confirmLabel="Approve" />
      )}
      {modal.open && modal.type === 'approve-kyc' && (
        <C.ConfirmDialog open onClose={() => setModal({ open: false })} onConfirm={doApproveKyc} title="Approve identity documents" message="Approve this driver's identity documents?" confirmLabel="Approve" />
      )}
      {modal.open && modal.type === 'approve-vehicle' && (
        <C.ConfirmDialog open onClose={() => setModal({ open: false })} onConfirm={doApproveVehicle} title="Approve vehicle documents" message="Approve this driver's vehicle documents?" confirmLabel="Approve" />
      )}
      {modal.open && modal.type === 'suspend' && (
        <C.ConfirmDialog open onClose={() => setModal({ open: false })} onConfirm={doSuspend} title="Suspend driver" message="Suspend this driver? They will lose access until restored." confirmLabel="Suspend" danger />
      )}
      {modal.open && modal.type === 'restore' && (
        <C.ConfirmDialog open onClose={() => setModal({ open: false })} onConfirm={doRestore} title="Restore driver" message="Restore this driver?" confirmLabel="Restore" />
      )}
      {modal.open && modal.type === 'reject' && (
        <C.Modal open title="Reject driver" onClose={() => setModal({ open: false })}>
          <input value={modal.reason} onChange={(e) => setModal((m) => ({ ...m, reason: e.target.value }))} placeholder="Reason (required)" className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600" />
          <button type="button" onClick={doReject} className="mt-2 px-3 py-1.5 bg-red-600 text-white rounded-lg">Reject</button>
        </C.Modal>
      )}
      {modal.open && modal.type === 'reject-kyc' && (
        <C.Modal open title="Reject identity documents" onClose={() => setModal({ open: false })}>
          <input value={modal.reason} onChange={(e) => setModal((m) => ({ ...m, reason: e.target.value }))} placeholder="Reason (required)" className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600" />
          <button type="button" onClick={doRejectKyc} className="mt-2 px-3 py-1.5 bg-red-600 text-white rounded-lg">Reject identity</button>
        </C.Modal>
      )}
      {modal.open && modal.type === 'reject-vehicle' && (
        <C.Modal open title="Reject vehicle documents" onClose={() => setModal({ open: false })}>
          <input value={modal.reason} onChange={(e) => setModal((m) => ({ ...m, reason: e.target.value }))} placeholder="Reason (required)" className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600" />
          <button type="button" onClick={doRejectVehicle} className="mt-2 px-3 py-1.5 bg-red-600 text-white rounded-lg">Reject vehicle</button>
        </C.Modal>
      )}
    </div>
  );
}

window.AdminPages = window.AdminPages || {};
window.AdminPages.Drivers = DriversPage;
window.AdminPages.DriverDetail = DriverDetailPage;
