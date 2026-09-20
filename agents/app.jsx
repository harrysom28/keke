const { useState, useEffect, useCallback } = React;
const Auth = window.AgentAuth;
const Api = window.AgentApi;

const STATUS_STYLES = {
  submitted: 'bg-gray-100 text-gray-700',
  in_review: 'bg-amber-100 text-amber-800',
  verified: 'bg-sky-100 text-sky-800',
  active: 'bg-emerald-100 text-emerald-800',
  inactive: 'bg-slate-100 text-slate-600',
  rejected: 'bg-red-100 text-red-700',
};
const STATUS_LABELS = {
  submitted: 'Submitted',
  in_review: 'In review',
  verified: 'Verified',
  active: 'Active',
  inactive: 'Inactive',
  rejected: 'Rejected',
};

const STAGE_STYLES = {
  registered: 'bg-gray-100 text-gray-700',
  verified: 'bg-sky-100 text-sky-800',
  active: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-700',
};
const STAGE_LABELS = {
  registered: 'Registered',
  verified: 'Verified',
  active: 'Active',
  rejected: 'Rejected',
};

const NG_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo',
  'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa',
  'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba',
  'Yobe', 'Zamfara',
];

function pct(n) {
  return Math.round((Number(n) || 0) * 100) + '%';
}

function naira(n) {
  return '₦' + Number(n || 0).toLocaleString();
}

function fmtDate(value) {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString();
}

function isDocumentsPending(nextStep) {
  const text = String(nextStep || '').toLowerCase();
  return text.includes('document') || text.includes('photo');
}

function missingDocumentError(selfie, licenseImage, idImage, vehicleImage) {
  if (!selfie) return 'Please upload a photo of yourself.';
  if (!licenseImage) return 'Please upload an image of your driver license.';
  if (!idImage) return 'Please upload an image of your government-issued ID card.';
  if (!vehicleImage) return 'Please upload a photo of the vehicle.';
  return '';
}

function Pill({ status }) {
  return (
    <span className={`status-pill ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-700'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function StagePill({ stage }) {
  return (
    <span className={`status-pill ${STAGE_STYLES[stage] || 'bg-gray-100 text-gray-700'}`}>
      {STAGE_LABELS[stage] || stage}
    </span>
  );
}

function LoginPage({ onLogin }) {
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('id');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingMessage, setPendingMessage] = useState('');
  const [apply, setApply] = useState({ name: '', zone: '', reason: '' });

  const resetToId = () => {
    setStep('id');
    setOtp('');
    setError('');
    setPendingMessage('');
    setApply({ name: '', zone: '', reason: '' });
  };

  const requestCode = async (e) => {
    e.preventDefault();
    setError('');
    const value = identifier.trim();
    if (!value) { setError('Enter the email or phone on your Keke account'); return; }
    setLoading(true);
    const res = await Api.post('/api/agents/auth/request-otp', { email_phone_number: value });
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    const applicationStatus = res.data?.data?.application_status;
    if (applicationStatus === 'pending') {
      setPendingMessage('Your application is still pending review.');
      setStep('pending');
      return;
    }
    if (applicationStatus === 'none') {
      setStep('apply');
      return;
    }
    setStep('otp');
  };

  const submitApply = async (e) => {
    e.preventDefault();
    setError('');
    if (!apply.name.trim()) { setError('Enter your name'); return; }
    if (!apply.zone.trim()) { setError('Enter the park or zone you would cover'); return; }
    if (!apply.reason.trim()) { setError('Enter a short line on why'); return; }
    setLoading(true);
    const res = await Api.post('/api/agents/apply', {
      email_phone_number: identifier.trim(),
      name: apply.name.trim(),
      zone: apply.zone.trim(),
      reason: apply.reason.trim(),
    });
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    setPendingMessage(res.data?.message || 'Your application has been submitted and is pending review.');
    setStep('pending');
  };

  const verify = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await Api.post('/api/agents/auth/verify', {
      email_phone_number: identifier.trim(),
      otp: otp.trim(),
      device_id: 'agent-web',
    });
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    const token = res.data?.authorisation?.token;
    const refresh = res.data?.authorisation?.refresh_token;
    const agent = res.data?.data?.agent;
    if (!token) { setError('Invalid response from server'); return; }
    Auth.setSession(token, refresh, agent);
    onLogin();
  };

  return (
    <div className="min-h-full flex flex-col px-5 py-10" style={{ background: 'linear-gradient(180deg, #3C8F7C 0%, #2f7263 42%, #F4F7F6 42%)' }}>
      <div className="text-white mb-8 pt-6">
        <p className="text-sm opacity-80">Keke Ride</p>
        <h1 className="text-3xl font-semibold mt-1">Agent console</h1>
        <p className="mt-2 text-sm text-white/80 max-w-xs">Sign in with the email or phone already on your Keke account.</p>
      </div>
      <div className="agent-card p-5">
        {step === 'id' ? (
          <form onSubmit={requestCode} className="space-y-4">
            <label className="block text-sm font-medium">Email or phone number</label>
            <input
              type="text"
              inputMode="email"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none"
              placeholder="0803… or you@email.com"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={loading} className="keke-btn w-full py-3 rounded-xl font-medium">
              {loading ? 'Checking…' : 'Continue'}
            </button>
          </form>
        ) : step === 'apply' ? (
          <form onSubmit={submitApply} className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Apply to become an agent</h2>
              <p className="mt-1 text-sm text-gray-600">
                Applying as <span className="font-medium text-gray-900">{identifier}</span>
              </p>
            </div>
            <input
              value={apply.name}
              onChange={(e) => setApply({ ...apply, name: e.target.value })}
              placeholder="Your name"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none"
            />
            <input
              value={apply.zone}
              onChange={(e) => setApply({ ...apply, zone: e.target.value })}
              placeholder="Park / zone you would cover"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none"
            />
            <input
              value={apply.reason}
              onChange={(e) => setApply({ ...apply, reason: e.target.value })}
              placeholder="One line on why"
              maxLength={280}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={loading} className="keke-btn w-full py-3 rounded-xl font-medium">
              {loading ? 'Submitting…' : 'Submit application'}
            </button>
            <button type="button" className="w-full text-sm text-[#3C8F7C]" onClick={resetToId}>
              Use a different email or phone
            </button>
          </form>
        ) : step === 'pending' ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Application pending</h2>
            <p className="text-sm text-gray-600">{pendingMessage || 'Your application is still pending review.'}</p>
            <button type="button" className="w-full text-sm text-[#3C8F7C]" onClick={resetToId}>
              Use a different email or phone
            </button>
          </div>
        ) : (
          <form onSubmit={verify} className="space-y-4">
            <p className="text-sm text-gray-600">We sent a login code to <span className="font-medium text-gray-900">{identifier}</span>.</p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 tracking-[0.4em] text-center text-lg outline-none"
              placeholder="••••••"
              maxLength={6}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={loading} className="keke-btn w-full py-3 rounded-xl font-medium">
              {loading ? 'Signing in…' : 'Let me in'}
            </button>
            <button type="button" className="w-full text-sm text-[#3C8F7C]" onClick={resetToId}>
              Use a different email or phone
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Overview({ go }) {
  const stored = Auth.getAgent() || {};
  const [data, setData] = useState(null);
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([
      Api.get('/api/agents/me/drivers'),
      Api.get('/api/agents/overview'),
    ]).then(([driversRes, overviewRes]) => {
      if (driversRes.error) setError(driversRes.error);
      else setData(driversRes.data?.data || driversRes.data);
      if (!overviewRes.error) setOverview(overviewRes.data?.data || overviewRes.data);
    });
  }, []);
  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!data) return <p className="text-gray-500 text-sm">Loading…</p>;
  const s = data.stats || {};
  const drivers = data.drivers || [];
  const referralCode = data.referral_code || stored.referral_code;
  const cycle = overview?.cycle;
  const earnings = overview?.earnings;
  return (
    <div className="space-y-4">
      {referralCode && (
        <div className="agent-card p-4">
          <p className="text-xs text-gray-500">Your referral code</p>
          <p className="text-2xl font-semibold tracking-wide mt-1">{referralCode}</p>
          <p className="text-xs text-gray-500 mt-1">Drivers enter this at signup.</p>
        </div>
      )}
      {cycle && (
        <div className="agent-card p-4">
          <p className="text-xs text-gray-500">{cycle.cycle_name || 'Recruitment cycle'}</p>
          <p className="text-lg font-semibold mt-1">Target {cycle.target_count} drivers</p>
          <p className="mt-2 text-sm text-gray-600">Deadline {fmtDate(cycle.deadline)}</p>
          {cycle.days_remaining != null && (
            <p className="text-sm text-gray-600">{cycle.days_remaining} days remaining</p>
          )}
          {cycle.pace_needed != null && (
            <p className="text-sm text-gray-600">{cycle.pace_needed} verified / day to hit target</p>
          )}
        </div>
      )}
      {earnings && (
        <div className="agent-card p-4">
          <p className="text-xs text-gray-500">Bounty</p>
          <p className="text-lg font-semibold mt-1">{naira(earnings.bounty_rate)} per active driver</p>
          <p className="mt-1 text-sm text-gray-600">Projected {naira(earnings.projected_owed)}</p>
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <div className="agent-card p-4">
          <p className="text-xs text-gray-500">Invites</p>
          <p className="text-2xl font-semibold mt-1">{s.invited || 0}</p>
        </div>
        <div className="agent-card p-4">
          <p className="text-xs text-gray-500">Drivers</p>
          <p className="text-2xl font-semibold mt-1">{s.registered || 0}</p>
        </div>
        <div className="agent-card p-4">
          <p className="text-xs text-gray-500">Verify rate</p>
          <p className="text-2xl font-semibold mt-1">{pct(s.verification_rate)}</p>
        </div>
      </div>
      <p className="text-xs text-gray-500">Invites are people who used your code in the Keke app, including passengers. Drivers are those who completed driver registration.</p>
      {((data.invites || []).length > 0) && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">People who used your code</p>
          {(data.invites || []).map((invite) => (
            <div key={invite.user_id} className="agent-card p-3 flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{invite.name || '—'}</p>
                <p className="text-sm text-gray-500">{invite.phone || invite.email || '—'}</p>
              </div>
              <span className={`status-pill ${invite.is_driver ? 'bg-sky-100 text-sky-800' : 'bg-gray-100 text-gray-700'}`}>
                {invite.is_driver ? 'Driver' : 'Passenger'}
              </span>
            </div>
          ))}
        </div>
      )}
      {drivers.length === 0 ? (
        <p className="text-sm text-gray-500">No drivers yet. Register one from the field.</p>
      ) : (
        drivers.map((d) => (
          <button
            type="button"
            key={d.driver_id}
            onClick={() => go('driver', d.driver_id)}
            className="agent-card p-4 w-full text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{d.name || 'Unnamed'}</p>
                <p className="text-sm text-gray-500">{d.phone || d.email || '—'}</p>
              </div>
              <StagePill stage={d.stage} />
            </div>
            {d.next_step && <p className="mt-2 text-sm text-gray-600">{d.next_step}</p>}
            <p className="mt-1 text-xs text-gray-400">{d.total_rides || 0} rides completed</p>
          </button>
        ))
      )}
      <button type="button" onClick={() => go('register')} className="keke-btn w-full py-3 rounded-xl font-medium">
        Register a driver
      </button>
    </div>
  );
}

function fileField(form, name) {
  return form[name] && form[name][0] ? form[name][0] : null;
}

function Register({ onDone }) {
  const [types, setTypes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    Api.get('/api/vehicle/types').then((res) => {
      const list = res.data?.data || [];
      setTypes(Array.isArray(list) ? list : []);
    });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setOk('');
    const form = e.target;
    const fd = new FormData();
    fd.append('name', form.name.value.trim());
    fd.append('phone', form.phone.value.trim());
    fd.append('gender', form.gender.value);
    fd.append('state', form.state.value);
    fd.append('city', form.city.value.trim());
    fd.append('union_number', form.union_number.value.trim());
    fd.append('plateNumber', form.plateNumber.value.trim());
    fd.append('vehicleType', form.vehicleType.value);
    fd.append('color', form.color.value.trim());
    const selfie = fileField(form, 'selfie');
    const licenseImage = fileField(form, 'license_image');
    const idImage = fileField(form, 'id_image');
    const vehicleImage = fileField(form, 'vehicle_image');
    const photoError = missingDocumentError(selfie, licenseImage, idImage, vehicleImage);
    if (photoError) {
      setError(photoError);
      return;
    }
    fd.append('selfie', selfie);
    fd.append('license_image', licenseImage);
    fd.append('id_image', idImage);
    fd.append('vehicle_image', vehicleImage);

    setSaving(true);
    const send = () => Api.post('/api/agents/drivers', fd);
    let res;
    try {
      res = await send();
    } catch (err) {
      queueOffline(fd);
      setSaving(false);
      setOk('Saved on this phone. It will upload when you are back online.');
      return;
    }
    setSaving(false);
    if (res.status === 0) {
      queueOffline(fd);
      setOk('Saved on this phone. It will upload when you are back online.');
      return;
    }
    if (res.error) { setError(res.error); return; }
    setOk(res.data?.message || 'Driver registered');
    form.reset();
    if (onDone) setTimeout(onDone, 800);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-gray-500">Same details the driver app already collects. This driver is tagged to you automatically. They finish bank details in the Keke app, then admin verifies.</p>
      <input name="name" required placeholder="Full name" className="w-full rounded-xl border border-gray-200 px-4 py-3" />
      <input name="phone" required placeholder="Phone number" inputMode="tel" className="w-full rounded-xl border border-gray-200 px-4 py-3" />
      <select name="gender" required className="w-full rounded-xl border border-gray-200 px-4 py-3 bg-white">
        <option value="">Gender</option>
        <option value="male">Male</option>
        <option value="female">Female</option>
      </select>
      <select name="state" required className="w-full rounded-xl border border-gray-200 px-4 py-3 bg-white">
        <option value="">State</option>
        {NG_STATES.map((state) => (
          <option key={state} value={state}>{state}</option>
        ))}
      </select>
      <input name="city" required placeholder="Town / city" className="w-full rounded-xl border border-gray-200 px-4 py-3" />
      <input name="union_number" required placeholder="Union / licence number" className="w-full rounded-xl border border-gray-200 px-4 py-3" />
      <input name="plateNumber" required placeholder="Plate number" className="w-full rounded-xl border border-gray-200 px-4 py-3 uppercase" />
      <select name="vehicleType" required className="w-full rounded-xl border border-gray-200 px-4 py-3 bg-white">
        <option value="">Vehicle type</option>
        {types.map((t) => (
          <option key={t.vehicle_id || t._id || t.id} value={t.vehicle_id || t._id || t.id}>
            {t.display_name || t.displayName || t.name}
          </option>
        ))}
      </select>
      <input name="color" required placeholder="Colour" className="w-full rounded-xl border border-gray-200 px-4 py-3" />
      <label className="block text-sm text-gray-600">Driver photo
        <input name="selfie" type="file" accept="image/*" capture="user" required className="mt-1 block w-full text-sm" />
      </label>
      <label className="block text-sm text-gray-600">Licence photo
        <input name="license_image" type="file" accept="image/*" required className="mt-1 block w-full text-sm" />
      </label>
      <label className="block text-sm text-gray-600">ID card photo
        <input name="id_image" type="file" accept="image/*" required className="mt-1 block w-full text-sm" />
      </label>
      <label className="block text-sm text-gray-600">Keke / bike photo
        <input name="vehicle_image" type="file" accept="image/*" required className="mt-1 block w-full text-sm" />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && <p className="text-sm text-emerald-700">{ok}</p>}
      <button type="submit" disabled={saving} className="keke-btn w-full py-3 rounded-xl font-medium">
        {saving ? 'Saving…' : 'Register driver'}
      </button>
    </form>
  );
}

const QUEUE_KEY = 'agentOfflineQueue';
function queueOffline() {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    q.push({ at: Date.now() });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch (_) { /* ignore quota */ }
}

function AddDocumentsForm({ driverId, onDone }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setError('');
    setOk('');
    const form = e.target;
    const selfie = fileField(form, 'selfie');
    const licenseImage = fileField(form, 'license_image');
    const idImage = fileField(form, 'id_image');
    const vehicleImage = fileField(form, 'vehicle_image');
    const photoError = missingDocumentError(selfie, licenseImage, idImage, vehicleImage);
    if (photoError) {
      setError(photoError);
      return;
    }
    const fd = new FormData();
    fd.append('selfie', selfie);
    fd.append('license_image', licenseImage);
    fd.append('id_image', idImage);
    fd.append('vehicle_image', vehicleImage);
    setSaving(true);
    const res = await Api.patch('/api/agents/drivers/' + driverId + '/documents', fd);
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    setOk(res.data?.message || 'Documents saved');
    form.reset();
    if (onDone) onDone(res.data?.data?.driver);
  };

  return (
    <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="mt-3 space-y-2">
      <label className="block text-sm text-gray-600">Driver photo
        <input name="selfie" type="file" accept="image/*" capture="user" required className="mt-1 block w-full text-sm" />
      </label>
      <label className="block text-sm text-gray-600">Licence photo
        <input name="license_image" type="file" accept="image/*" required className="mt-1 block w-full text-sm" />
      </label>
      <label className="block text-sm text-gray-600">ID card photo
        <input name="id_image" type="file" accept="image/*" required className="mt-1 block w-full text-sm" />
      </label>
      <label className="block text-sm text-gray-600">Keke / bike photo
        <input name="vehicle_image" type="file" accept="image/*" required className="mt-1 block w-full text-sm" />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && <p className="text-sm text-emerald-700">{ok}</p>}
      <button type="submit" disabled={saving} className="keke-btn w-full py-2.5 rounded-xl font-medium">
        {saving ? 'Saving…' : 'Save documents'}
      </button>
    </form>
  );
}

function DriverDetail({ id, onBack }) {
  const [driver, setDriver] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    if (!id) return;
    Api.get('/api/agents/drivers/' + id).then((res) => {
      if (res.error) { setError(res.error); setDriver(null); return; }
      setDriver(res.data?.data?.driver || null);
    });
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={onBack} className="text-sm text-[#3C8F7C]">← Back</button>
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }
  if (!driver) return <p className="text-gray-500 text-sm">Loading…</p>;
  const vehicle = driver.vehicle_details || {};
  const vehicleType = vehicle.vehicleType?.displayName || vehicle.vehicleType?.name || driver.vehicle_type || '—';
  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="text-sm text-[#3C8F7C]">← Back</button>
      <div className="agent-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">{driver.name || 'Unnamed'}</p>
            <p className="text-sm text-gray-500">{driver.phone || driver.email || '—'}</p>
          </div>
          <StagePill stage={driver.stage} />
        </div>
        {driver.next_step && <p className="mt-2 text-sm text-gray-600">{driver.next_step}</p>}
        <p className="mt-1 text-xs text-gray-400">{driver.total_rides || 0} rides completed</p>
      </div>
      <div className="agent-card p-4 space-y-1">
        <p className="text-xs text-gray-500">Vehicle</p>
        <p className="text-sm">{vehicle.make || driver.park || '—'} {vehicle.model || ''}</p>
        <p className="text-sm text-gray-600">{driver.plate_number || vehicle.plateNumber || '—'}</p>
        <p className="text-sm text-gray-600">{vehicleType}{vehicle.color ? ` · ${vehicle.color}` : ''}</p>
      </div>
      {(driver.kyc_status || driver.kyc_rejection || driver.rejection_reason) && (
        <div className="agent-card p-4 space-y-1">
          <p className="text-xs text-gray-500">KYC</p>
          {driver.kyc_status && <p className="text-sm capitalize">{driver.kyc_status}</p>}
          {driver.kyc_rejection && <p className="text-sm text-red-600">{driver.kyc_rejection}</p>}
          {driver.rejection_reason && <p className="text-sm text-red-600">Rejected: {driver.rejection_reason}</p>}
        </div>
      )}
      {isDocumentsPending(driver.next_step) && (
        <div className="agent-card p-4">
          <p className="text-sm font-medium">Add documents</p>
          <AddDocumentsForm driverId={driver.driver_id} onDone={(next) => { if (next) setDriver(next); else load(); }} />
        </div>
      )}
    </div>
  );
}

function Drivers({ go }) {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [docsFor, setDocsFor] = useState(null);
  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (filter) params.set('status', filter);
    if (search) params.set('search', search);
    Api.get('/api/agents/drivers?' + params.toString()).then((res) => {
      if (res.error) setError(res.error);
      else setRows(res.data?.data?.drivers || []);
    });
  }, [filter, search]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, plate" className="w-full rounded-xl border border-gray-200 px-4 py-3" />
      <div className="flex gap-2 overflow-auto pb-1">
        {['', 'submitted', 'in_review', 'verified', 'active', 'inactive', 'rejected'].map((s) => (
          <button
            key={s || 'all'}
            type="button"
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${filter === s ? 'bg-[#3C8F7C] text-white' : 'bg-white text-gray-600'}`}
          >
            {s ? STATUS_LABELS[s] : 'All'}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows.length === 0 && <p className="text-sm text-gray-500">No drivers yet. Register one from the field.</p>}
      {rows.map((d) => (
        <div
          key={d.driver_id}
          role="button"
          tabIndex={0}
          onClick={() => go('driver', d.driver_id)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') go('driver', d.driver_id); }}
          className="agent-card p-4 text-left"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{d.name || 'Unnamed'}</p>
              <p className="text-sm text-gray-500">{d.phone}</p>
              {d.plate_number && <p className="text-xs text-gray-400 mt-1">{d.plate_number}</p>}
            </div>
            <Pill status={d.status} />
          </div>
          {d.next_step && <p className="mt-2 text-sm text-gray-600">{d.next_step}</p>}
          <p className="mt-1 text-xs text-gray-400">{d.total_rides || 0} rides completed</p>
          {d.status === 'rejected' && d.rejection_reason && (
            <p className="mt-2 text-sm text-red-600">Rejected: {d.rejection_reason}</p>
          )}
          {isDocumentsPending(d.next_step) && (
            <div className="mt-3">
              <button
                type="button"
                className="text-sm font-medium text-[#3C8F7C]"
                onClick={(e) => {
                  e.stopPropagation();
                  setDocsFor(docsFor === d.driver_id ? null : d.driver_id);
                }}
              >
                {docsFor === d.driver_id ? 'Close' : 'Add documents'}
              </button>
              {docsFor === d.driver_id && (
                <AddDocumentsForm
                  driverId={d.driver_id}
                  onDone={() => { setDocsFor(null); load(); }}
                />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Profile({ onLogout }) {
  const stored = Auth.getAgent() || {};
  const [agent, setAgent] = useState(stored);
  const [form, setForm] = useState({
    accountName: stored.bank_account?.accountName || '',
    accountNumber: stored.bank_account?.accountNumber || '',
    bankName: stored.bank_account?.bankName || '',
    park: stored.park || '',
    zone: stored.zone || '',
  });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    Api.get('/api/agents/me').then((res) => {
      const a = res.data?.data?.agent;
      if (!a) return;
      setAgent(a);
      Auth.setSession(Auth.getToken(), localStorage.getItem('agentRefreshToken'), a);
      setForm({
        accountName: a.bank_account?.accountName || '',
        accountNumber: a.bank_account?.accountNumber || '',
        bankName: a.bank_account?.bankName || '',
        park: a.park || '',
        zone: a.zone || '',
      });
    });
  }, []);

  const save = async (e) => {
    e.preventDefault();
    const res = await Api.patch('/api/agents/me', {
      park: form.park,
      zone: form.zone,
      bankAccount: {
        accountName: form.accountName,
        accountNumber: form.accountNumber,
        bankName: form.bankName,
      },
    });
    if (res.error) setMsg(res.error);
    else {
      setMsg('Saved');
      const a = res.data?.data?.agent;
      if (a) setAgent(a);
    }
  };

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="agent-card p-4">
        <p className="text-xs text-gray-500">Signed in as</p>
        <p className="font-medium">{agent.name || 'Agent'}</p>
        <p className="text-sm text-gray-500">{agent.phone || agent.email}</p>
        {agent.referral_code && (
          <p className="mt-2 text-sm">Referral code: <span className="font-semibold tracking-wide">{agent.referral_code}</span></p>
        )}
      </div>
      <input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} placeholder="Zone" className="w-full rounded-xl border border-gray-200 px-4 py-3" />
      <input value={form.park} onChange={(e) => setForm({ ...form, park: e.target.value })} placeholder="Park" className="w-full rounded-xl border border-gray-200 px-4 py-3" />
      <input value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} placeholder="Account name" className="w-full rounded-xl border border-gray-200 px-4 py-3" />
      <input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} placeholder="Account number" inputMode="numeric" className="w-full rounded-xl border border-gray-200 px-4 py-3" />
      <input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="Bank name" className="w-full rounded-xl border border-gray-200 px-4 py-3" />
      {msg && <p className="text-sm text-gray-600">{msg}</p>}
      <button type="submit" className="keke-btn w-full py-3 rounded-xl font-medium">Save</button>
      <button type="button" onClick={onLogout} className="w-full py-3 rounded-xl border border-gray-200 text-red-600">Log out</button>
    </form>
  );
}

function Shell({ onLogout }) {
  const [page, setPage] = useState('home');
  const [driverId, setDriverId] = useState(null);
  const agent = Auth.getAgent() || {};
  const go = (next, id) => {
    setPage(next);
    setDriverId(id || null);
  };
  const titles = { home: 'My drivers', register: 'Register a driver', drivers: 'My drivers', driver: 'Driver', profile: 'Profile' };
  const nav = [
    { id: 'home', label: 'Home' },
    { id: 'register', label: 'Register' },
    { id: 'drivers', label: 'Drivers' },
    { id: 'profile', label: 'Profile' },
  ];
  return (
    <div className="min-h-full flex flex-col">
      <header className="px-5 pt-6 pb-3">
        <p className="text-xs text-gray-500">{agent.name || 'Agent'}</p>
        <h1 className="text-xl font-semibold">{titles[page]}</h1>
      </header>
      <main className="flex-1 px-5 nav-safe">
        {page === 'home' && <Overview go={go} />}
        {page === 'register' && <Register onDone={() => go('drivers')} />}
        {page === 'drivers' && <Drivers go={go} />}
        {page === 'driver' && <DriverDetail id={driverId} onBack={() => go('drivers')} />}
        {page === 'profile' && <Profile onLogout={onLogout} />}
      </main>
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 grid grid-cols-4" style={{ paddingBottom: 'var(--safe-bottom)' }}>
        {nav.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => go(item.id)}
            className={`py-3 text-xs font-medium ${page === item.id ? 'text-[#3C8F7C]' : 'text-gray-400'}`}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function App() {
  const [authed, setAuthed] = useState(Auth.isAuthenticated());
  useEffect(() => {
    window.onAgentUnauthorized = () => setAuthed(false);
    return () => { window.onAgentUnauthorized = null; };
  }, []);
  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />;
  return <Shell onLogout={() => { Auth.clearSession(); setAuthed(false); }} />;
}

function init() {
  const root = document.getElementById('root');
  if (root && ReactDOM.createRoot) ReactDOM.createRoot(root).render(React.createElement(App));
  else ReactDOM.render(React.createElement(App), root);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
