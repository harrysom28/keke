const { useState, useEffect } = React;
const Api = window.AdminApi;
const Utils = window.AdminUtils;
const C = window.AdminComponents;

function ConfigPage({ showToast, defaultTab }) {
  const [tab, setTab] = useState(defaultTab || 'vehicle-types');
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [promocodes, setPromocodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState(null);
  const [alertsSaving, setAlertsSaving] = useState(false);
  const [referral, setReferral] = useState(null);
  const [referralSaving, setReferralSaving] = useState(false);
  const [topup, setTopup] = useState(null);
  const [topupSaving, setTopupSaving] = useState(false);
  const [dvaPreferredBank, setDvaPreferredBank] = useState('wema-bank');
  const [driverTasks, setDriverTasks] = useState(null);
  const [driverTasksSaving, setDriverTasksSaving] = useState(false);
  const [driverChallengeDefs, setDriverChallengeDefs] = useState(null);
  const [driverChallengeDefsSaving, setDriverChallengeDefsSaving] = useState(false);
  const [pricing, setPricing] = useState(null);
  const [pricingSaving, setPricingSaving] = useState(false);
  const [fees, setFees] = useState(null);
  const [cancellation, setCancellation] = useState(null);
  const [arrival, setArrival] = useState(null);
  const [walletLimits, setWalletLimits] = useState(null);
  const [feesSaving, setFeesSaving] = useState(false);
  const [vtModal, setVtModal] = useState({ open: false, editing: null, name: '', display_name: '', description: '', base_fare: '', per_km_rate: '', per_minute_rate: '', minimum_fare: '', multiplier: '1', capacity: '4', order: '0', is_active: true });
  const [promoModal, setPromoModal] = useState({ open: false, editing: null, code: '', description: '', discount_type: 'percentage', discount_value: '', max_discount: '', min_amount: '0', max_uses: '', max_uses_per_user: '1', valid_from: '', valid_to: '', is_active: true });

  const loadVehicleTypes = () => Api.get('/api/admin/vehicle-types').then((res) => {
    if (res.error) showToast(res.error, 'error');
    else setVehicleTypes(res.data?.data?.vehicle_types || res.data?.vehicleTypes || []);
  });
  const loadPromocodes = () => Api.get('/api/admin/promocodes').then((res) => {
    if (res.error) showToast(res.error, 'error');
    else setPromocodes(res.data?.data?.promocodes || res.data?.promocodes || []);
  });

  useEffect(() => {
    setLoading(true);
    if (tab === 'vehicle-types') loadVehicleTypes().finally(() => setLoading(false));
    else if (tab === 'promocodes') loadPromocodes().finally(() => setLoading(false));
    else if (tab === 'alerts' || tab === 'referral' || tab === 'topup' || tab === 'driver-tasks' || tab === 'pricing' || tab === 'fee-settings') {
      Api.get('/api/admin/settings').then((r) => {
        if (!r.error) {
          const d = r.data?.data || r.data;
          if (tab === 'alerts') setAlerts(d?.alerts || null);
          setReferral(d?.referral || null);
          setTopup(d?.topup || null);
          setDvaPreferredBank(d?.dvaPreferredBank || 'wema-bank');
          setDriverTasks(d?.driverTasks || null);
          setDriverChallengeDefs(d?.driverChallengeDefs || null);
          setPricing(d?.pricing || null);
          setFees(d?.fees || null);
          setCancellation(d?.cancellation || null);
          setArrival(d?.arrival || null);
          setWalletLimits(d?.wallet || null);
        }
      }).catch(() => {}).finally(() => setLoading(false));
    }
  }, [tab]);

  const updateReferral = (key, value) => {
    const next = { ...(referral || {}), [key]: value };
    setReferral(next);
    setReferralSaving(true);
    Api.patch('/api/admin/settings', { referral: next }).then((r) => {
      if (r.error) showToast(r.error, 'error');
      else showToast('Referral settings saved');
    }).finally(() => setReferralSaving(false));
  };

  const updateTopup = (key, value) => {
    const next = { ...(topup || {}), [key]: value };
    setTopup(next);
    setTopupSaving(true);
    Api.patch('/api/admin/settings', { topup: next }).then((r) => {
      if (r.error) showToast(r.error, 'error');
      else showToast('Top-up bank details saved');
    }).finally(() => setTopupSaving(false));
  };

  const updateDvaPreferredBank = (value) => {
    setDvaPreferredBank(value);
    setTopupSaving(true);
    Api.patch('/api/admin/settings', { dvaPreferredBank: value }).then((r) => {
      if (r.error) showToast(r.error, 'error');
      else showToast('DVA preferred bank saved');
    }).finally(() => setTopupSaving(false));
  };

  const updateAlert = (key, value) => {
    const next = { ...alerts, [key]: value };
    setAlerts(next);
    setAlertsSaving(true);
    Api.patch('/api/admin/settings', { alerts: next }).then((r) => {
      if (r.error) showToast(r.error, 'error');
      else showToast('Alert settings saved');
    }).finally(() => setAlertsSaving(false));
  };

  const updateDriverTask = (key, value) => {
    const next = { ...(driverTasks || {}), [key]: value };
    setDriverTasks(next);
    setDriverTasksSaving(true);
    Api.patch('/api/admin/settings', { driverTasks: next }).then((r) => {
      if (r.error) showToast(r.error, 'error');
      else showToast('Driver task reward saved');
    }).finally(() => setDriverTasksSaving(false));
  };

  const patchDriverChallengeDefs = (next) => {
    setDriverChallengeDefs(next);
    setDriverChallengeDefsSaving(true);
    Api.patch('/api/admin/settings', { driverChallengeDefs: next }).then((r) => {
      if (r.error) showToast(r.error, 'error');
      else showToast('Driver challenges saved');
    }).finally(() => setDriverChallengeDefsSaving(false));
  };

  const updateChallengeDef = (id, patch) => {
    const current = Array.isArray(driverChallengeDefs) ? driverChallengeDefs : [];
    const next = current.map((d) => d.id === id ? { ...d, ...patch } : d);
    patchDriverChallengeDefs(next);
  };

  const updatePricing = (next) => {
    setPricing(next);
    setPricingSaving(true);
    Api.patch('/api/admin/settings', { pricing: next }).then((r) => {
      if (r.error) showToast(r.error, 'error');
      else showToast('Pricing settings saved');
    }).finally(() => setPricingSaving(false));
  };

  const openAddVt = () => setVtModal({ open: true, editing: null, name: '', display_name: '', description: '', base_fare: '', per_km_rate: '', per_minute_rate: '', minimum_fare: '', multiplier: '1', capacity: '4', order: '0', is_active: true });
  const openEditVt = (row) => setVtModal({
    open: true,
    editing: row.vehicle_id,
    name: row.name || '',
    display_name: row.display_name || '',
    description: row.description || '',
    base_fare: row.base_fare != null ? String(row.base_fare) : '',
    per_km_rate: row.per_km_rate != null ? String(row.per_km_rate) : '',
    per_minute_rate: row.per_minute_rate != null ? String(row.per_minute_rate) : '',
    minimum_fare: row.minimum_fare != null ? String(row.minimum_fare) : '',
    multiplier: row.multiplier != null ? String(row.multiplier) : '1',
    capacity: row.capacity != null ? String(row.capacity) : '4',
    order: row.order != null ? String(row.order) : '0',
    is_active: row.is_active !== false,
  });

  const saveVt = () => {
    const payload = {
      name: vtModal.name.trim(),
      displayName: vtModal.display_name.trim(),
      description: vtModal.description || undefined,
      baseFare: parseFloat(vtModal.base_fare),
      perKmRate: parseFloat(vtModal.per_km_rate),
      perMinuteRate: parseFloat(vtModal.per_minute_rate),
      ...(vtModal.minimum_fare !== '' ? { minimumFare: parseFloat(vtModal.minimum_fare) } : {}),
      ...(vtModal.multiplier !== '' ? { multiplier: parseFloat(vtModal.multiplier) } : {}),
      capacity: parseInt(vtModal.capacity, 10) || 4,
      order: parseInt(vtModal.order, 10) || 0,
      isActive: vtModal.is_active,
    };
    if (vtModal.editing) {
      Api.patch('/api/admin/vehicle-types/' + vtModal.editing, payload).then((r) => {
        if (r.error) showToast(r.error, 'error');
        else { showToast('Vehicle type updated'); setVtModal((m) => ({ ...m, open: false })); loadVehicleTypes(); }
      });
    } else {
      Api.post('/api/admin/vehicle-types', payload).then((r) => {
        if (r.error) showToast(r.error, 'error');
        else { showToast('Vehicle type created'); setVtModal((m) => ({ ...m, open: false })); loadVehicleTypes(); }
      });
    }
  };

  const openAddPromo = () => {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 30);
    setPromoModal({
      open: true,
      editing: null,
      code: '',
      description: '',
      discount_type: 'percentage',
      discount_value: '',
      max_discount: '',
      min_amount: '0',
      max_uses: '',
      max_uses_per_user: '1',
      valid_from: from.toISOString().slice(0, 16),
      valid_to: to.toISOString().slice(0, 16),
      is_active: true,
    });
  };
  const openEditPromo = (row) => setPromoModal({
    open: true,
    editing: row.promo_id,
    code: row.code || '',
    description: row.description || '',
    discount_type: row.discount_type || 'percentage',
    discount_value: row.discount_value != null ? String(row.discount_value) : '',
    max_discount: row.max_discount != null ? String(row.max_discount) : '',
    min_amount: row.min_amount != null ? String(row.min_amount) : '0',
    max_uses: row.max_uses != null ? String(row.max_uses) : '',
    max_uses_per_user: row.max_uses_per_user != null ? String(row.max_uses_per_user) : '1',
    valid_from: row.valid_from ? new Date(row.valid_from).toISOString().slice(0, 16) : '',
    valid_to: row.valid_to ? new Date(row.valid_to).toISOString().slice(0, 16) : '',
    is_active: row.is_active !== false,
  });

  const savePromo = () => {
    const payload = {
      code: promoModal.code.trim().toUpperCase(),
      description: promoModal.description || undefined,
      discountType: promoModal.discount_type,
      discountValue: parseFloat(promoModal.discount_value),
      maxDiscount: promoModal.max_discount ? parseFloat(promoModal.max_discount) : undefined,
      minAmount: parseFloat(promoModal.min_amount) || 0,
      maxUses: promoModal.max_uses ? parseInt(promoModal.max_uses, 10) : undefined,
      maxUsesPerUser: parseInt(promoModal.max_uses_per_user, 10) || 1,
      validFrom: new Date(promoModal.valid_from).toISOString(),
      validTo: new Date(promoModal.valid_to).toISOString(),
      isActive: promoModal.is_active,
      applicableUserTypes: ['all'],
    };
    if (promoModal.editing) {
      Api.patch('/api/admin/promocodes/' + promoModal.editing, payload).then((r) => {
        if (r.error) showToast(r.error, 'error');
        else { showToast('Promo updated'); setPromoModal((m) => ({ ...m, open: false })); loadPromocodes(); }
      });
    } else {
      Api.post('/api/admin/promocodes', payload).then((r) => {
        if (r.error) showToast(r.error, 'error');
        else { showToast('Promo created'); setPromoModal((m) => ({ ...m, open: false })); loadPromocodes(); }
      });
    }
  };

  const vtColumns = [
    { key: 'name', label: 'Name' },
    { key: 'display_name', label: 'Display name' },
    { key: 'base_fare', label: 'Base fare', render: (v) => v != null ? Utils.formatCurrency(v) : '—' },
    { key: 'per_km_rate', label: 'Per km', render: (v) => v != null ? Utils.formatCurrency(v) : '—' },
    { key: 'minimum_fare', label: 'Min fare', render: (v) => v != null ? Utils.formatCurrency(v) : '—' },
    { key: 'multiplier', label: '× Mult' },
    { key: 'per_minute_rate', label: 'Per min', render: (v) => v != null ? Utils.formatCurrency(v) : '—' },
    { key: 'capacity', label: 'Capacity' },
    { key: 'is_active', label: 'Active', render: (v) => v ? 'Yes' : 'No' },
    { key: 'vehicle_id', label: 'Action', render: (v, row) => <button type="button" onClick={() => openEditVt(row)} className="text-blue-600 hover:underline text-sm">Edit</button> },
  ];
  const pcColumns = [
    { key: 'code', label: 'Code' },
    { key: 'discount_type', label: 'Type' },
    { key: 'discount_value', label: 'Value' },
    { key: 'used_count', label: 'Used' },
    { key: 'max_uses', label: 'Max uses', render: (v) => v ?? '∞' },
    { key: 'valid_from', label: 'Valid from', render: (v) => Utils.formatDate(v) },
    { key: 'valid_to', label: 'Valid to', render: (v) => Utils.formatDate(v) },
    { key: 'is_active', label: 'Active', render: (v) => v ? 'Yes' : 'No' },
    { key: 'promo_id', label: 'Action', render: (v, row) => <button type="button" onClick={() => openEditPromo(row)} className="text-blue-600 hover:underline text-sm">Edit</button> },
  ];

  return (
    <div className="space-y-4">
      <C.Breadcrumb items={[{ label: defaultTab === 'promocodes' ? 'Offers' : 'Configuration' }]} />
      <div className="flex gap-2">
        <button type="button" onClick={() => setTab('vehicle-types')} className={`px-3 py-1.5 rounded-lg ${tab === 'vehicle-types' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 dark:text-gray-200'}`}>Vehicle types & pricing</button>
        <button type="button" onClick={() => setTab('promocodes')} className={`px-3 py-1.5 rounded-lg ${tab === 'promocodes' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 dark:text-gray-200'}`}>Promo codes</button>
        <button type="button" onClick={() => setTab('alerts')} className={`px-3 py-1.5 rounded-lg ${tab === 'alerts' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 dark:text-gray-200'}`}>Alert settings</button>
        <button type="button" onClick={() => setTab('referral')} className={`px-3 py-1.5 rounded-lg ${tab === 'referral' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 dark:text-gray-200'}`}>Referral program</button>
        <button type="button" onClick={() => setTab('topup')} className={`px-3 py-1.5 rounded-lg ${tab === 'topup' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 dark:text-gray-200'}`}>Top-up (Bank Transfer)</button>
        <button type="button" onClick={() => setTab('driver-tasks')} className={`px-3 py-1.5 rounded-lg ${tab === 'driver-tasks' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 dark:text-gray-200'}`}>Driver challenges</button>
        <button type="button" onClick={() => setTab('pricing')} className={`px-3 py-1.5 rounded-lg ${tab === 'pricing' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 dark:text-gray-200'}`}>Ride pricing</button>
        <button type="button" onClick={() => setTab('fee-settings')} className={`px-3 py-1.5 rounded-lg ${tab === 'fee-settings' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 dark:text-gray-200'}`}>Fee settings</button>
      </div>

      {tab === 'vehicle-types' && (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400 px-1">
            Fares use each vehicle type&apos;s base, per km, minimum, and multiplier. Empty or legacy values fall back to <strong>Ride pricing</strong> defaults.
          </p>
          <div className="flex justify-end min-w-0">
            <button type="button" onClick={openAddVt} className="shrink-0 whitespace-nowrap px-3 py-1.5 bg-blue-600 text-white rounded-lg">Add vehicle type</button>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <C.DataTable columns={vtColumns} rows={vehicleTypes} keyField="vehicle_id" loading={loading} emptyMessage="No vehicle types" />
          </div>
        </>
      )}

      {tab === 'promocodes' && (
        <>
          <div className="flex justify-end">
            <button type="button" onClick={openAddPromo} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg">Create promo code</button>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <C.DataTable columns={pcColumns} rows={promocodes} keyField="promo_id" loading={loading} emptyMessage="No promocodes" />
          </div>
        </>
      )}

      {tab === 'alerts' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 max-w-lg">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Automated alerts</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">When enabled, the system can send email or SMS for critical events. (Delivery requires email/SMS configuration in the backend.)</p>
          {loading ? <C.Skeleton className="h-20 w-full" /> : alerts ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-gray-700 dark:text-gray-300">Ride waiting threshold (minutes)</label>
                <input type="number" min={1} max={60} value={alerts.rideWaitingThresholdMinutes ?? 5} onChange={(e) => updateAlert('rideWaitingThresholdMinutes', parseInt(e.target.value, 10) || 5)} className="w-20 px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-600" />
              </div>
              <label className="flex items-center justify-between gap-2">
                <span className="text-gray-700 dark:text-gray-300">Email when rides waiting &gt; threshold</span>
                <input type="checkbox" checked={!!alerts.emailOnRideWaiting} onChange={(e) => updateAlert('emailOnRideWaiting', e.target.checked)} />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-gray-700 dark:text-gray-300">SMS when rides waiting &gt; threshold</span>
                <input type="checkbox" checked={!!alerts.smsOnRideWaiting} onChange={(e) => updateAlert('smsOnRideWaiting', e.target.checked)} />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-gray-700 dark:text-gray-300">Email on new driver signup</span>
                <input type="checkbox" checked={!!alerts.emailOnNewDriverSignup} onChange={(e) => updateAlert('emailOnNewDriverSignup', e.target.checked)} />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-gray-700 dark:text-gray-300">Email on new support ticket</span>
                <input type="checkbox" checked={!!alerts.emailOnNewTicket} onChange={(e) => updateAlert('emailOnNewTicket', e.target.checked)} />
              </label>
              {alertsSaving && <p className="text-sm text-gray-500">Saving…</p>}
            </div>
          ) : <p className="text-gray-500">Could not load settings.</p>}
        </div>
      )}

      {tab === 'referral' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 max-w-lg">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Referral program</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Rewards are only granted when invited users complete registration and at least one ride.</p>
          {loading ? <C.Skeleton className="h-20 w-full" /> : referral ? (
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-2">
                <span className="text-gray-700 dark:text-gray-300">Enable referral program</span>
                <input type="checkbox" checked={!!referral.enabled} onChange={(e) => updateReferral('enabled', e.target.checked)} />
              </label>
              <div className="flex flex-col gap-1">
                <label className="text-gray-700 dark:text-gray-300">Reward type</label>
                <select value={referral.rewardType || 'free_ride'} onChange={(e) => updateReferral('rewardType', e.target.value)} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200">
                  <option value="cash">Cash (wallet credit)</option>
                  <option value="free_ride">Free ride (wallet credit)</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-gray-700 dark:text-gray-300">Successful invites required</label>
                <input type="number" min={1} max={20} value={referral.successfulInvitesRequired ?? 3} onChange={(e) => updateReferral('successfulInvitesRequired', parseInt(e.target.value, 10) || 1)} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
                <p className="text-xs text-gray-500">Number of friends who must complete signup and at least 1 ride</p>
              </div>
              {referral.rewardType === 'cash' ? (
                <div className="flex flex-col gap-1">
                  <label className="text-gray-700 dark:text-gray-300">Cash amount (₦)</label>
                  <input type="number" min={0} step={100} value={referral.cashAmount ?? 500} onChange={(e) => updateReferral('cashAmount', parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <label className="text-gray-700 dark:text-gray-300">Free ride amount (₦)</label>
                  <input type="number" min={0} step={100} value={referral.freeRideAmount ?? 1000} onChange={(e) => updateReferral('freeRideAmount', parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-gray-700 dark:text-gray-300">Description (shown in app)</label>
                <textarea rows={3} value={referral.description || ''} onChange={(e) => updateReferral('description', e.target.value)} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" placeholder="Invite friends! When they complete signup and their first ride..." />
              </div>
              {referralSaving && <p className="text-sm text-gray-500">Saving…</p>}
            </div>
          ) : <p className="text-gray-500">Could not load referral settings.</p>}
        </div>
      )}

      {tab === 'topup' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 max-w-lg space-y-8">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Paystack Dedicated Virtual Accounts (DVA)</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">When PAYSTACK_SECRET_KEY is set, new users get a unique bank account (DVA) for wallet top-ups. Choose the preferred bank for new DVAs.</p>
            {loading ? <C.Skeleton className="h-12 w-full" /> : (
              <div className="flex flex-col gap-1">
                <label className="text-gray-700 dark:text-gray-300">Preferred bank for new DVAs</label>
                <select value={dvaPreferredBank} onChange={(e) => updateDvaPreferredBank(e.target.value)} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200">
                  <option value="wema-bank">Wema Bank</option>
                  <option value="titan-paystack">Titan Paystack</option>
                </select>
              </div>
            )}
          </div>
          <div className="border-t border-gray-200 dark:border-gray-600 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Platform bank account (fallback)</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">If DVA is unavailable, users see these bank details with a unique reference (KEKE + user ID) to include when transferring.</p>
            {loading ? <C.Skeleton className="h-20 w-full" /> : (
              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  <label className="text-gray-700 dark:text-gray-300">Bank name</label>
                  <input type="text" value={topup?.bankName || ''} onChange={(e) => updateTopup('bankName', e.target.value)} placeholder="e.g. Providus Bank" className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-gray-700 dark:text-gray-300">Account name</label>
                  <input type="text" value={topup?.accountName || ''} onChange={(e) => updateTopup('accountName', e.target.value)} placeholder="e.g. Keke Ride Ltd" className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-gray-700 dark:text-gray-300">Account number</label>
                  <input type="text" value={topup?.accountNumber || ''} onChange={(e) => updateTopup('accountNumber', e.target.value)} placeholder="e.g. 9012345678" className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
                </div>
              </div>
            )}
            {topupSaving && <p className="text-sm text-gray-500 mt-2">Saving…</p>}
          </div>
        </div>
      )}

      {tab === 'pricing' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 max-w-lg">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">KEKE ride pricing (₦)</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            <strong>Formula:</strong> Total Fare = Base Fare + (Distance × Per KM Rate). If the result is less than the minimum fare, the minimum fare is charged. These are <strong>default fallback</strong> values when a vehicle type has no rate set (see Vehicle types &amp; pricing). Rider service charge is under Fee settings.
          </p>
          {loading ? <C.Skeleton className="h-48 w-full" /> : pricing ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-gray-700 dark:text-gray-300 font-medium">1. Base fare (₦)</label>
                <p className="text-xs text-gray-500 dark:text-gray-400">Starting price the moment a ride begins (e.g. just for entering the keke)</p>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={pricing.baseFare ?? 500}
                  onChange={(e) => setPricing((p) => ({ ...p, baseFare: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-gray-700 dark:text-gray-300 font-medium">2. Per KM rate (₦)</label>
                <p className="text-xs text-gray-500 dark:text-gray-400">Amount charged for every kilometer traveled</p>
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={pricing.perKmRate ?? 150}
                  onChange={(e) => setPricing((p) => ({ ...p, perKmRate: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-gray-700 dark:text-gray-300 font-medium">3. Minimum fare (₦)</label>
                <p className="text-xs text-gray-500 dark:text-gray-400">Floor price — protects drivers; short trips charge at least this amount</p>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={pricing.minimumFare ?? 800}
                  onChange={(e) => setPricing((p) => ({ ...p, minimumFare: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-gray-700 dark:text-gray-300 font-medium">Currency</label>
                <input
                  type="text"
                  value={pricing.currency ?? 'NGN'}
                  onChange={(e) => setPricing((p) => ({ ...p, currency: e.target.value.trim() || 'NGN' }))}
                  className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                />
              </div>
              <div className="rounded-lg bg-gray-100 dark:bg-gray-700/50 p-3 text-sm text-gray-600 dark:text-gray-400">
                <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Example (4 km trip)</p>
                <p>₦{pricing.baseFare ?? 500} + (4 × ₦{pricing.perKmRate ?? 150}) = ₦{(pricing.baseFare ?? 500) + 4 * (pricing.perKmRate ?? 150)}. If below ₦{pricing.minimumFare ?? 800}, rider pays ₦{pricing.minimumFare ?? 800}.</p>
              </div>
              <button
                type="button"
                onClick={() => updatePricing(pricing)}
                disabled={pricingSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {pricingSaving ? 'Saving…' : 'Save pricing'}
              </button>
            </div>
          ) : <p className="text-gray-500">Could not load pricing settings.</p>}
        </div>
      )}

      {tab === 'fee-settings' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 max-w-2xl">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">KEKE Admin — Fee Settings</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Escrow fees and cancellation policy. Changes apply to new rides within 5 minutes. Rides already in progress use the values locked at booking.</p>
          {loading ? <C.Skeleton className="h-64 w-full" /> : (fees || cancellation || arrival || walletLimits) ? (
            <div className="space-y-6">
              <div>
                <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-2">Fees</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-gray-700 dark:text-gray-300">Rider service charge (₦)</label>
                    <p className="text-xs text-gray-500">Charged when driver marks arrived. ₦0 – ₦500</p>
                    <input type="number" min={0} max={500} step={10} value={fees?.riderServiceCharge ?? 100} onChange={(e) => setFees((p) => ({ ...(p || {}), riderServiceCharge: parseFloat(e.target.value) || 0 }))} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-gray-700 dark:text-gray-300">Driver platform rate (%)</label>
                    <p className="text-xs text-gray-500">1% – 25%. Stored as decimal (8% = 0.08)</p>
                    <input type="number" min={1} max={25} step={0.5} value={((fees?.driverPlatformRate ?? 0.08) * 100).toFixed(1)} onChange={(e) => setFees((p) => ({ ...(p || {}), driverPlatformRate: (parseFloat(e.target.value) || 0) / 100 }))} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
                  </div>
                </div>
              </div>
              <div>
                <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-2">Cancellation policy</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-gray-700 dark:text-gray-300">Grace period (seconds)</label>
                    <p className="text-xs text-gray-500">Free cancel for rider within this time after driver accepts</p>
                    <input type="number" min={0} max={300} value={cancellation?.gracePeriodSeconds ?? 60} onChange={(e) => setCancellation((p) => ({ ...(p || {}), gracePeriodSeconds: parseInt(e.target.value, 10) || 0 }))} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-gray-700 dark:text-gray-300">After-accept penalty (₦)</label>
                    <input type="number" min={0} step={50} value={cancellation?.afterAcceptPenalty ?? 200} onChange={(e) => setCancellation((p) => ({ ...(p || {}), afterAcceptPenalty: parseFloat(e.target.value) || 0 }))} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-gray-700 dark:text-gray-300">After-accept driver payout (₦)</label>
                    <input type="number" min={0} step={50} value={cancellation?.afterAcceptPayout ?? 200} onChange={(e) => setCancellation((p) => ({ ...(p || {}), afterAcceptPayout: parseFloat(e.target.value) || 0 }))} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-gray-700 dark:text-gray-300">After-arrival driver comp (₦)</label>
                    <input type="number" min={0} step={50} value={cancellation?.afterArrivalPayout ?? 150} onChange={(e) => setCancellation((p) => ({ ...(p || {}), afterArrivalPayout: parseFloat(e.target.value) || 0 }))} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-gray-700 dark:text-gray-300">Max cancel payouts per driver per day</label>
                    <p className="text-xs text-gray-500">Abuse guard: cap how many cancel compensations a driver can collect in one day</p>
                    <input type="number" min={1} max={20} value={cancellation?.maxDriverPayoutsPerDay ?? 3} onChange={(e) => setCancellation((p) => ({ ...(p || {}), maxDriverPayoutsPerDay: parseInt(e.target.value, 10) || 1 }))} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
                  </div>
                </div>
              </div>
              <div>
                <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-2">Arrival verification</h4>
                <div className="flex flex-col gap-1">
                  <label className="text-gray-700 dark:text-gray-300">Max distance from pickup (meters)</label>
                  <p className="text-xs text-gray-500">Driver must be within this distance to mark arrived. 50 – 500 m</p>
                  <input type="number" min={50} max={500} value={arrival?.maxRadiusMeters ?? 150} onChange={(e) => setArrival((p) => ({ ...(p || {}), maxRadiusMeters: parseInt(e.target.value, 10) || 150 }))} className="w-32 px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
                </div>
              </div>
              <div>
                <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-2">Wallet limits</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-gray-700 dark:text-gray-300">Min top-up (₦)</label>
                    <input type="number" min={0} step={100} value={walletLimits?.minTopupAmount ?? 500} onChange={(e) => setWalletLimits((p) => ({ ...(p || {}), minTopupAmount: parseFloat(e.target.value) || 0 }))} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-gray-700 dark:text-gray-300">Min withdrawal (₦)</label>
                    <input type="number" min={0} step={100} value={walletLimits?.minWithdrawAmount ?? 1000} onChange={(e) => setWalletLimits((p) => ({ ...(p || {}), minWithdrawAmount: parseFloat(e.target.value) || 0 }))} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-gray-700 dark:text-gray-300">Daily withdrawal cap (₦)</label>
                    <input type="number" min={0} step={10000} value={walletLimits?.maxDailyWithdrawal ?? 500000} onChange={(e) => setWalletLimits((p) => ({ ...(p || {}), maxDailyWithdrawal: parseFloat(e.target.value) || 0 }))} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => { setFeesSaving(true); Api.patch('/api/admin/settings', { fees, cancellation, arrival, wallet: walletLimits }).then((r) => { if (r.error) showToast(r.error, 'error'); else showToast('Fee settings saved. Changes apply to new rides within 5 minutes.'); }).finally(() => setFeesSaving(false)); }} disabled={feesSaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{feesSaving ? 'Saving…' : 'Save changes'}</button>
            </div>
          ) : <p className="text-gray-500">Could not load fee settings.</p>}
        </div>
      )}

      {tab === 'driver-tasks' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 max-w-2xl">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Driver challenge rewards (₦)</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Set the cash reward (in Naira) for each gamified task. Drivers earn these amounts when they complete the challenge. Rewards are added to driver earnings.</p>
          {loading ? <C.Skeleton className="h-64 w-full" /> : (driverTasks && driverChallengeDefs) ? (
            <div className="space-y-8">
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Which challenges appear in the driver app</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">Disable a challenge to hide it from drivers (awards also stop if reward is set to ₦0).</p>
                <div className="space-y-3">
                  {(driverChallengeDefs || []).map((d) => (
                    <div key={d.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{d.title}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{d.id}</div>
                        </div>
                        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                          <input type="checkbox" checked={d.enabled !== false} onChange={(e) => updateChallengeDef(d.id, { enabled: e.target.checked })} />
                          Enabled
                        </label>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-gray-600 dark:text-gray-400">Title</label>
                          <input value={d.title || ''} onChange={(e) => updateChallengeDef(d.id, { title: e.target.value })} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-gray-600 dark:text-gray-400">Target</label>
                          <input type="number" min={1} value={d.target ?? 1} onChange={(e) => updateChallengeDef(d.id, { target: parseInt(e.target.value, 10) || 1 })} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
                        </div>
                        <div className="flex flex-col gap-1 sm:col-span-2">
                          <label className="text-xs text-gray-600 dark:text-gray-400">Description</label>
                          <input value={d.description || ''} onChange={(e) => updateChallengeDef(d.id, { description: e.target.value })} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-gray-600 dark:text-gray-400">Unit</label>
                          <input value={d.unit || ''} onChange={(e) => updateChallengeDef(d.id, { unit: e.target.value })} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {driverChallengeDefsSaving && <p className="text-sm text-gray-500">Saving…</p>}
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Rewards (₦)</h4>
              {[
                { key: 'first_ride_today', label: 'First ride of the day', hint: 'Complete first ride today' },
                { key: 'rides_3_today', label: 'Triple threat (3 rides today)', hint: 'Complete 3 rides in a day' },
                { key: 'rides_5_today', label: 'High five (5 rides today)', hint: 'Complete 5 rides in a day' },
                { key: 'rides_10_today', label: 'Ten for the win (10 rides today)', hint: 'Complete 10 rides in a day' },
                { key: 'early_bird', label: 'Early bird', hint: 'Complete a ride before 8:00 AM' },
                { key: 'night_owl', label: 'Night owl', hint: 'Complete a ride after 10:00 PM' },
                { key: 'weekend_warrior', label: 'Weekend warrior', hint: 'Complete 5 rides on Saturday or Sunday' },
              ].map(({ key, label, hint }) => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-gray-700 dark:text-gray-300 font-medium">{label}</label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">₦</span>
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={driverTasks[key] ?? 0}
                      onChange={(e) => updateDriverTask(key, parseFloat(e.target.value) || 0)}
                      className="w-32 px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                    />
                  </div>
                </div>
              ))}
              {driverTasksSaving && <p className="text-sm text-gray-500">Saving…</p>}
              </div>
            </div>
          ) : <p className="text-gray-500">Could not load driver challenge settings.</p>}
        </div>
      )}

      <C.Modal open={vtModal.open} onClose={() => setVtModal((m) => ({ ...m, open: false }))} title={vtModal.editing ? 'Edit vehicle type' : 'Add vehicle type'} width="max-w-md">
        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-gray-700 dark:text-gray-300">Name</label>
            <input value={vtModal.name} onChange={(e) => setVtModal((m) => ({ ...m, name: e.target.value }))} placeholder="e.g. keke" className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" disabled={!!vtModal.editing} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-gray-700 dark:text-gray-300">Display name</label>
            <input value={vtModal.display_name} onChange={(e) => setVtModal((m) => ({ ...m, display_name: e.target.value }))} placeholder="e.g. Keke" className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-gray-700 dark:text-gray-300">Description (optional)</label>
            <input value={vtModal.description} onChange={(e) => setVtModal((m) => ({ ...m, description: e.target.value }))} placeholder="Short description" className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-gray-700 dark:text-gray-300">Base fare (₦)</label>
            <input type="number" step="0.01" min={0} value={vtModal.base_fare} onChange={(e) => setVtModal((m) => ({ ...m, base_fare: e.target.value }))} placeholder="0.00" className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-gray-700 dark:text-gray-300">Per km rate (₦)</label>
            <input type="number" step="0.01" min={0} value={vtModal.per_km_rate} onChange={(e) => setVtModal((m) => ({ ...m, per_km_rate: e.target.value }))} placeholder="0.00" className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-gray-700 dark:text-gray-300">Per minute rate (₦)</label>
            <input type="number" step="0.01" min={0} value={vtModal.per_minute_rate} onChange={(e) => setVtModal((m) => ({ ...m, per_minute_rate: e.target.value }))} placeholder="0.00" className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-gray-700 dark:text-gray-300">Capacity (seats)</label>
            <input type="number" min={1} max={10} value={vtModal.capacity} onChange={(e) => setVtModal((m) => ({ ...m, capacity: e.target.value }))} placeholder="4" className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-gray-700 dark:text-gray-300">Display order</label>
            <input type="number" min={0} value={vtModal.order} onChange={(e) => setVtModal((m) => ({ ...m, order: e.target.value }))} placeholder="0" className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200" />
            <p className="text-xs text-gray-500 dark:text-gray-400">Lower numbers appear first in lists.</p>
          </div>
          <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={vtModal.is_active} onChange={(e) => setVtModal((m) => ({ ...m, is_active: e.target.checked }))} />
            Active (vehicle type visible to drivers and riders)
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-600 pt-2 mt-2">
            Vehicle years for driver registration are set automatically (current year back 15 years). Drivers choose their vehicle year in the app when registering.
          </p>
        </div>
        <button type="button" onClick={saveVt} className="mt-4 px-3 py-1.5 bg-blue-600 text-white rounded-lg">Save</button>
      </C.Modal>

      <C.Modal open={promoModal.open} onClose={() => setPromoModal((m) => ({ ...m, open: false }))} title={promoModal.editing ? 'Edit promo code' : 'Create promo code'} width="max-w-md">
        <div className="space-y-2">
          <input value={promoModal.code} onChange={(e) => setPromoModal((m) => ({ ...m, code: e.target.value.toUpperCase() }))} placeholder="Code (e.g. SAVE20)" className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600" disabled={!!promoModal.editing} />
          <input value={promoModal.description} onChange={(e) => setPromoModal((m) => ({ ...m, description: e.target.value }))} placeholder="Description (optional)" className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600" />
          <select value={promoModal.discount_type} onChange={(e) => setPromoModal((m) => ({ ...m, discount_type: e.target.value }))} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600">
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed amount</option>
          </select>
          <input type="number" step="0.01" value={promoModal.discount_value} onChange={(e) => setPromoModal((m) => ({ ...m, discount_value: e.target.value }))} placeholder="Discount value (%) or amount" className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600" />
          <input type="number" step="0.01" value={promoModal.max_discount} onChange={(e) => setPromoModal((m) => ({ ...m, max_discount: e.target.value }))} placeholder="Max discount (optional, for %)" className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600" />
          <input type="number" step="0.01" value={promoModal.min_amount} onChange={(e) => setPromoModal((m) => ({ ...m, min_amount: e.target.value }))} placeholder="Min ride amount" className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600" />
          <input type="number" value={promoModal.max_uses} onChange={(e) => setPromoModal((m) => ({ ...m, max_uses: e.target.value }))} placeholder="Max uses (optional)" className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600" />
          <input type="number" value={promoModal.max_uses_per_user} onChange={(e) => setPromoModal((m) => ({ ...m, max_uses_per_user: e.target.value }))} placeholder="Max uses per user" className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600" />
          <input type="datetime-local" value={promoModal.valid_from} onChange={(e) => setPromoModal((m) => ({ ...m, valid_from: e.target.value }))} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600" />
          <input type="datetime-local" value={promoModal.valid_to} onChange={(e) => setPromoModal((m) => ({ ...m, valid_to: e.target.value }))} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600" />
          <label className="flex items-center gap-2"><input type="checkbox" checked={promoModal.is_active} onChange={(e) => setPromoModal((m) => ({ ...m, is_active: e.target.checked }))} /> Active</label>
        </div>
        <button type="button" onClick={savePromo} className="mt-4 px-3 py-1.5 bg-blue-600 text-white rounded-lg">Save</button>
      </C.Modal>
    </div>
  );
}

window.AdminPages = window.AdminPages || {};
window.AdminPages.Config = ConfigPage;
