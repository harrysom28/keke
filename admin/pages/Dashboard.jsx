const { useState, useEffect, useRef } = React;
const Api = window.AdminApi;
const Utils = window.AdminUtils;
const C = window.AdminComponents;

function DashboardPage({ onNavigate, headerRange, setHeaderRange, dashboardExportRef }) {
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [live, setLive] = useState(null);
  const [pendingDriversList, setPendingDriversList] = useState([]);
  const [openTicketsList, setOpenTicketsList] = useState([]);
  const [revenueStats, setRevenueStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const range = headerRange !== undefined ? headerRange : '30d';
  const setRange = setHeaderRange || (() => {});
  const [activeRidesCount, setActiveRidesCount] = useState(null);
  const pollRef = useRef(null);

  const exportCSV = () => {
    if (!stats) return;
    const rows = [
      { metric: 'Total Users', value: stats.overview?.total_users ?? '' },
      { metric: 'Total Drivers', value: stats.overview?.total_drivers ?? '' },
      { metric: 'Total Rides', value: stats.overview?.total_rides ?? '' },
      { metric: 'Total Revenue', value: stats.overview?.total_revenue ?? '' },
      { metric: 'Active Rides', value: stats.overview?.active_rides ?? '' },
      { metric: 'Pending Drivers', value: stats.overview?.pending_drivers ?? '' },
      { metric: 'Open Tickets', value: stats.overview?.open_tickets ?? '' },
    ];
    Utils.exportToCSV(rows, 'dashboard-stats.csv');
  };
  useEffect(() => {
    if (dashboardExportRef) dashboardExportRef.current = exportCSV;
    return () => { if (dashboardExportRef) dashboardExportRef.current = null; };
  }, [dashboardExportRef, stats]);

  const fetchStats = async () => {
    const res = await Api.get('/api/admin/dashboard/stats');
    if (res.error) { setError(res.error); setStats(null); return; }
    setStats(res.data?.data || res.data);
    setError(null);
  };

  const fetchAnalytics = async () => {
    const period = range === 'today' ? '7d' : range;
    const res = await Api.get(`/api/admin/analytics?period=${period}`);
    if (res.error) { setAnalytics(null); return; }
    setAnalytics(res.data?.data || res.data);
  };

  const fetchLive = async () => {
    const res = await Api.get('/api/admin/dashboard/live');
    if (res.error) return;
    setLive(res.data?.data || res.data);
  };

  const fetchPendingDrivers = async () => {
    const res = await Api.get('/api/admin/drivers?verificationStatus=pending&limit=5');
    if (!res.error) setPendingDriversList(res.data?.data?.drivers || res.data?.drivers || []);
  };

  const fetchOpenTickets = async () => {
    const res = await Api.get('/api/admin/support-tickets?limit=10');
    if (!res.error) {
      const tickets = res.data?.data?.tickets || res.data?.tickets || [];
      setOpenTicketsList(tickets.filter((t) => t.status === 'open' || t.status === 'in_progress'));
    }
  };

  const fetchRevenueStats = async () => {
    const period = range === 'today' ? '7d' : range;
    const res = await Api.get('/api/admin/revenue?period=' + period);
    if (!res.error) setRevenueStats(res.data?.data || res.data);
  };

  const fetchActiveRides = async () => {
    const res = await Api.get('/api/admin/dashboard/live');
    if (!res.error && res.data?.data?.active_rides) setActiveRidesCount(res.data.data.active_rides.length);
    else if (stats?.overview?.active_rides != null) setActiveRidesCount(stats.overview.active_rides);
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchStats(), fetchAnalytics(), fetchLive(), fetchPendingDrivers(), fetchOpenTickets(), fetchRevenueStats()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchAnalytics(); fetchRevenueStats(); }, [range]);

  useEffect(() => {
    fetchActiveRides();
    fetchLive();
    fetchPendingDrivers();
    fetchOpenTickets();
    pollRef.current = setInterval(() => {
      fetchActiveRides();
      fetchLive();
      fetchPendingDrivers();
      fetchOpenTickets();
    }, 15000);
    return () => clearInterval(pollRef.current);
  }, [stats]);

  const { trendValues, sparklineSeries } = computeTrendAndSparklines(analytics, range);

  if (loading && !stats) return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-2 border-gray-200 dark:border-gray-700" style={{ borderTopColor: 'var(--keke-primary-hex)' }} /></div>;
  if (error) return <C.ErrorState message={error} onRetry={() => { setLoading(true); fetchStats().then(() => Promise.all([fetchAnalytics(), fetchLive()])).finally(() => setLoading(false)); }} />;

  const o = stats?.overview || {};
  const ridesWaiting = live?.rides_waiting_over_5min ?? 0;
  const pendingDrivers = o.pending_drivers ?? 0;
  const openTickets = o.open_tickets ?? 0;
  const activeRides = (live?.active_rides?.length ?? activeRidesCount ?? o.active_rides ?? 0);
  const hasAlerts = ridesWaiting > 0 || pendingDrivers > 0 || openTickets > 0;

  return (
    <div className="space-y-6">
      {hasAlerts && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-400 rounded-r-lg p-4">
          <p className="font-medium text-amber-800 dark:text-amber-200 mb-2">Actions needed</p>
          <div className="flex flex-wrap items-center gap-3">
            {pendingDrivers > 0 && (
              <button type="button" onClick={() => onNavigate && onNavigate('drivers')} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-100 dark:bg-amber-800/50 text-amber-900 dark:text-amber-100 hover:bg-amber-200 dark:hover:bg-amber-800 text-sm font-medium transition-colors">
                <span aria-hidden="true">⚠️</span> {pendingDrivers} driver{pendingDrivers !== 1 ? 's' : ''} need approval
              </button>
            )}
            {openTickets > 0 && (
              <button type="button" onClick={() => onNavigate && onNavigate('support')} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-100 dark:bg-amber-800/50 text-amber-900 dark:text-amber-100 hover:bg-amber-200 dark:hover:bg-amber-800 text-sm font-medium transition-colors">
                <span aria-hidden="true">🎫</span> {openTickets} unresolved ticket{openTickets !== 1 ? 's' : ''}
              </button>
            )}
            {ridesWaiting > 0 && (
              <button type="button" onClick={() => onNavigate && onNavigate('rides')} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-100 dark:bg-amber-800/50 text-amber-900 dark:text-amber-100 hover:bg-amber-200 dark:hover:bg-amber-800 text-sm font-medium transition-colors">
                <span aria-hidden="true">🚨</span> {ridesWaiting} ride{ridesWaiting !== 1 ? 's' : ''} waiting &gt;5 min
              </button>
            )}
          </div>
        </div>
      )}

      <section className="space-y-4" aria-labelledby="dashboard-kpis">
        <h2 id="dashboard-kpis" className="admin-section-title">Key metrics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="admin-kpi-card"><C.StatsCard title="Total Users" value={o.total_users ?? 0} icon="👥" color="brand" change={trendValues.users} trend={trendValues.users ? (String(trendValues.users).startsWith('+') ? 'up' : 'down') : null} compareText="vs previous period" sparklineData={sparklineSeries.users} /></div>
          <div className="admin-kpi-card"><C.StatsCard title="Active Drivers" value={o.total_drivers ?? 0} icon="🚗" color="green" change={trendValues.drivers} compareText="vs previous period" sparklineData={sparklineSeries.drivers} /></div>
          <div className="admin-kpi-card"><C.StatsCard title="Total Rides" value={o.total_rides ?? 0} icon="🗺️" color="purple" change={trendValues.rides} trend={trendValues.rides ? (String(trendValues.rides).startsWith('+') ? 'up' : 'down') : null} compareText="vs previous period" sparklineData={sparklineSeries.rides} progress={typeof (o.total_rides ?? 0) === 'number' ? Math.min(1, (o.total_rides ?? 0) / 100) : undefined} /></div>
          <div className="admin-kpi-card"><EnhancedRevenueCard totalRevenue={o.total_revenue} trend={trendValues.revenue} sparklineData={sparklineSeries.revenue} revenueByMethod={revenueStats?.revenue_by_method} formatCurrency={Utils.formatCurrency} /></div>
          <div className="admin-kpi-card"><C.StatsCard title="Active Rides (live)" value={activeRides} icon="🔄" color="green" /></div>
          <div className="admin-kpi-card"><C.StatsCard title="Pending Drivers" value={o.pending_drivers ?? 0} icon="⏳" color="yellow" /></div>
          <div className="admin-kpi-card"><C.StatsCard title="Open Tickets" value={o.open_tickets ?? 0} icon="🎫" color="red" /></div>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="dashboard-revenue">
        <h2 id="dashboard-revenue" className="admin-section-title">Revenue & ride status</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="admin-kpi-card">
            <C.ChartCard title="Revenue over time">
              <div className="w-full" style={{ position: 'relative', height: 240 }}>
                <ChartArea id="chart-revenue" data={getRevenueChartData(analytics, range)} />
              </div>
            </C.ChartCard>
          </div>
          <div className="admin-kpi-card">
            <C.ChartCard title="Rides by status">
              <div className="w-full" style={{ position: 'relative', height: 240 }}>
                <ChartPie id="chart-status" data={getRidesByStatusChartData(analytics)} />
              </div>
            </C.ChartCard>
          </div>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="dashboard-live">
        <h2 id="dashboard-live" className="admin-section-title">Live operations</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 admin-kpi-card">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Active rides</h3>
            <LiveMapSection rides={live?.active_rides || []} />
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 admin-kpi-card">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Pending ride queue</h3>
            <PendingQueue rides={live?.pending_rides || []} />
          </div>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="dashboard-management">
        <h2 id="dashboard-management" className="admin-section-title">Management</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 admin-kpi-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Driver management</h3>
              {onNavigate && <button type="button" onClick={() => onNavigate('drivers')} className="text-sm keke-text-primary hover:underline">View all →</button>}
            </div>
            <DashboardDriverSection pendingDrivers={pendingDriversList} pendingCount={o.pending_drivers ?? 0} onNavigate={onNavigate} />
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 admin-kpi-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Support tickets</h3>
              {onNavigate && <button type="button" onClick={() => onNavigate('support')} className="text-sm keke-text-primary hover:underline">View all →</button>}
            </div>
            <DashboardSupportSection openTickets={openTicketsList} openCount={o.open_tickets ?? 0} onNavigate={onNavigate} formatDate={Utils.formatDate} />
          </div>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="dashboard-activity">
        <h2 id="dashboard-activity" className="admin-section-title">Recent activity</h2>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 admin-kpi-card">
          <RecentActivity items={live?.recent_activity || []} formatDate={Utils.formatDate} timeAgo={Utils.timeAgo} />
        </div>
      </section>
    </div>
  );
}

function EnhancedRevenueCard({ totalRevenue, trend, sparklineData, revenueByMethod, formatCurrency }) {
  const total = totalRevenue ?? 0;
  const trendUp = trend && String(trend).startsWith('+');
  const trendDown = trend && String(trend).startsWith('-');
  const methods = revenueByMethod && typeof revenueByMethod === 'object' ? Object.entries(revenueByMethod) : [];
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 h-full">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Revenue</p>
          <p className="font-bold text-gray-900 dark:text-white mt-1 tracking-tight" style={{ fontSize: '1.875rem', lineHeight: 1.2 }}>{formatCurrency(total)}</p>
          {trend && (
            <p className={`text-sm mt-1 ${trendUp ? 'text-green-600 dark:text-green-400' : trendDown ? 'text-red-600 dark:text-red-400' : 'text-gray-500'}`}>
              {trendUp ? '↑' : trendDown ? '↓' : ''} {trend} vs previous period
            </p>
          )}
          {sparklineData && sparklineData.length > 0 && (
            <div className="mt-2 h-8">
              <C.Sparkline data={sparklineData} color="yellow" />
            </div>
          )}
        </div>
        <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-2xl flex-shrink-0">💰</div>
      </div>
      {methods.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">By method</p>
          <div className="space-y-1">
            {methods.slice(0, 3).map(([method, data]) => (
              <div key={method} className="flex justify-between text-xs">
                <span className="capitalize text-gray-600 dark:text-gray-300">{method}</span>
                <span>{formatCurrency(data.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getRevenueChartData(analytics, range) {
  if (analytics?.revenue_by_day?.length > 0) return analytics.revenue_by_day;
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
  const out = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    out.push({ date: d.toISOString().slice(0, 10), revenue: 0 });
  }
  return out;
}

function getRidesByStatusChartData(analytics) {
  if (analytics?.rides_by_status && Object.keys(analytics.rides_by_status).length > 0) return analytics.rides_by_status;
  return { 'No rides yet': 1 };
}

function computeTrendAndSparklines(analytics, range) {
  const trendValues = {};
  const sparklineSeries = {};
  if (!analytics) return { trendValues, sparklineSeries };

  const periodDays = range === '7d' ? 7 : range === '90d' ? 90 : 30;
  const half = Math.floor(periodDays / 2);

  if (analytics.revenue_by_day?.length) {
    const rev = analytics.revenue_by_day;
    const current = rev.slice(-half).reduce((s, d) => s + (d.revenue || 0), 0);
    const previous = rev.slice(0, rev.length - half).slice(-half).reduce((s, d) => s + (d.revenue || 0), 0);
    trendValues.revenue = previous ? `${((current - previous) / previous * 100).toFixed(1)}%` : null;
    sparklineSeries.revenue = rev.map((d) => d.revenue || 0);
  }
  if (analytics.rides_by_day?.length) {
    const rides = analytics.rides_by_day;
    const current = rides.slice(-half).reduce((s, d) => s + (d.count || 0), 0);
    const previous = rides.slice(0, rides.length - half).slice(-half).reduce((s, d) => s + (d.count || 0), 0);
    trendValues.rides = previous ? `${((current - previous) / previous * 100).toFixed(1)}%` : (current ? '+0%' : null);
    sparklineSeries.rides = rides.map((d) => d.count || 0);
  }
  if (analytics.users_by_day?.length) {
    const users = analytics.users_by_day;
    const current = users.slice(-half).reduce((s, d) => s + (d.count || 0), 0);
    const previous = users.slice(0, users.length - half).slice(-half).reduce((s, d) => s + (d.count || 0), 0);
    trendValues.users = previous ? `${((current - previous) / previous * 100).toFixed(1)}%` : (current ? '+0%' : null);
    sparklineSeries.users = users.map((d) => d.count || 0);
  }
  sparklineSeries.drivers = sparklineSeries.rides; // reuse rides as proxy when we don't have drivers-by-day
  return { trendValues, sparklineSeries };
}

function LiveMapSection({ rides }) {
  const mapRef = React.useRef(null);
  const mapInstanceRef = React.useRef(null);
  const hasCoords = rides.some((r) => r.pickup?.lat != null && r.pickup?.lng != null);
  const L = typeof window !== 'undefined' ? window.L : null;

  React.useEffect(() => {
    if (!L || !mapRef.current || !hasCoords) return;
    const first = rides.find((r) => r.pickup?.lat != null && r.pickup?.lng != null);
    const center = first ? [first.pickup.lat, first.pickup.lng] : [6.4541, 3.3947];
    if (mapInstanceRef.current) mapInstanceRef.current.remove();
    const map = L.map(mapRef.current).setView(center, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    rides.forEach((r) => {
      if (r.pickup?.lat != null && r.pickup?.lng != null) {
        L.marker([r.pickup.lat, r.pickup.lng]).addTo(map).bindPopup(r.rider_name || 'Pickup');
      }
      if (r.driver_location?.lat != null && r.driver_location?.lng != null) {
        L.marker([r.driver_location.lat, r.driver_location.lng], { icon: L.divIcon({ className: 'driver-marker', html: '<span style="background:#22c55e;width:12px;height:12px;border-radius:50%;display:block;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></span>' }) }).addTo(map).bindPopup(r.driver_name || 'Driver');
      }
    });
    mapInstanceRef.current = map;
    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
  }, [rides.length, hasCoords, L]);

  if (!rides.length) return <div className="h-64 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">No active rides. Map will show drivers and pickups when available.</div>;
  if (!hasCoords) {
    return (
      <div className="space-y-2">
        <div className="h-48 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">Waiting for location data…</div>
        <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
          {rides.slice(0, 5).map((r) => (
            <li key={r.ride_id}>• {r.rider_name} – {r.status} {r.pickup?.address ? `@ ${(r.pickup.address || '').slice(0, 35)}…` : ''}</li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div ref={mapRef} className="h-64 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700" style={{ minHeight: 256 }} />
      <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1 mt-2">
        {rides.slice(0, 5).map((r) => (
          <li key={r.ride_id}>• {r.rider_name} – {r.status}</li>
        ))}
      </ul>
    </div>
  );
}

function PendingQueue({ rides }) {
  if (!rides.length) return <div className="text-gray-500 dark:text-gray-400 text-sm">No pending ride requests.</div>;
  return (
    <ul className="space-y-3">
      {rides.map((r) => (
        <li key={r.ride_id} className="flex justify-between items-start gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">{r.rider_name || 'Rider'}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{r.pickup_address || '—'}</p>
            <p className="text-xs text-gray-500 dark:text-gray-500">Waiting {r.waiting_mins} min</p>
          </div>
          <span className="text-xs text-amber-600 dark:text-amber-400">{r.vehicle_type || '—'}</span>
        </li>
      ))}
    </ul>
  );
}

function DashboardDriverSection({ pendingDrivers, pendingCount, onNavigate }) {
  const list = pendingDrivers || [];
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        <strong className="text-amber-600 dark:text-amber-400">{pendingCount}</strong> driver(s) awaiting approval
      </p>
      {list.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">No pending approvals. All drivers are processed.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((d) => (
            <li key={d.driver_id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{d.user?.name || 'Driver'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{d.user?.email || ''}</p>
              </div>
              <button type="button" onClick={() => onNavigate && onNavigate('driver-detail', d.driver_id)} className="text-sm text-blue-600 hover:underline">Review →</button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400">Onboarding status, verify documents and approve or reject from Drivers.</p>
    </div>
  );
}

function DashboardSupportSection({ openTickets, openCount, onNavigate, formatDate }) {
  const list = openTickets || [];
  const byCategory = list.reduce((acc, t) => { acc[t.category || 'other'] = (acc[t.category || 'other'] || 0) + 1; return acc; }, {});
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        <strong className="text-red-600 dark:text-red-400">{openCount}</strong> open or in-progress ticket(s)
      </p>
      {Object.keys(byCategory).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(byCategory).map(([cat, count]) => (
            <span key={cat} className="px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-xs">{cat}: {count}</span>
          ))}
        </div>
      )}
      {list.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">No open tickets.</p>
      ) : (
        <ul className="space-y-2">
          {list.slice(0, 5).map((t) => (
            <li key={t.ticket_id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 dark:text-white truncate">{t.subject}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t.priority} · {t.status} · {formatDate(t.created_at)}</p>
              </div>
              <button type="button" onClick={() => onNavigate && onNavigate('ticket-detail', t.ticket_id)} className="text-sm text-blue-600 hover:underline shrink-0">View →</button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400">Assign, respond and resolve from Support.</p>
    </div>
  );
}

function RecentActivity({ items, formatDate, timeAgo }) {
  const getIcon = (type) => {
    if (type === 'ride_completed') return '🚗';
    if (type === 'user_signup') return '👤';
    if (type === 'driver_signup') return '🚙';
    if (type === 'ticket_opened') return '🎫';
    return '•';
  };
  if (!items.length) return <div className="text-gray-500 dark:text-gray-400 text-sm">No recent activity.</div>;
  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-700">
      {items.slice(0, 10).map((a, i) => (
        <div key={a.id || i} className="flex items-start gap-3 py-3 first:pt-0">
          <span className="text-xl shrink-0 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center" aria-hidden="true">{getIcon(a.type)}</span>
          <div className="min-w-0 flex-1">
            <p className="text-gray-900 dark:text-white font-medium">{a.message}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {a.sub && <span className="text-amber-600 dark:text-amber-400 font-medium">{a.sub}</span>}
              <span className="text-gray-500 dark:text-gray-400 text-sm">{timeAgo ? timeAgo(a.at) : formatDate(a.at)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const CHART_BRAND = '#3C8F7C';
const CHART_GRADIENT_TOP = 'rgba(60, 143, 124, 0.4)';
const CHART_GRADIENT_BOTTOM = 'rgba(60, 143, 124, 0.06)';

function ChartArea({ id, data }) {
  const canvasRef = React.useRef(null);
  const chartRef = React.useRef(null);
  React.useEffect(() => {
    if (!window.Chart || !data?.length || !canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();
    const ctx = canvasRef.current.getContext('2d');
    const chartHeight = 240;
    const gradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
    gradient.addColorStop(0, CHART_GRADIENT_TOP);
    gradient.addColorStop(1, CHART_GRADIENT_BOTTOM);
    chartRef.current = new window.Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: data.map((d) => d.date),
        datasets: [{
          label: 'Revenue',
          data: data.map((d) => d.revenue),
          borderColor: CHART_BRAND,
          backgroundColor: gradient,
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointBackgroundColor: CHART_BRAND,
          pointBorderColor: '#fff',
          pointBorderWidth: 1,
          pointRadius: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          tooltip: { backgroundColor: 'rgba(0,0,0,0.8)', padding: 10 },
          legend: { display: false },
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 45 } },
          y: { beginAtZero: true, suggestedMax: Math.max(1, (Math.max(...data.map((d) => d.revenue || 0)) || 0) * 1.1), grid: { color: 'rgba(0,0,0,0.06)' } },
        },
      },
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [id, data]);
  return <canvas ref={canvasRef} style={{ display: 'block' }} />;
}

const STATUS_COLORS = {
  completed: '#22c55e',
  completed_rides: '#22c55e',
  active: '#eab308',
  in_progress: '#eab308',
  pending: '#8b5cf6',
  cancelled: '#ef4444',
  cancelled_rides: '#ef4444',
  failed: '#ef4444',
  'No rides yet': '#94a3b8',
};
function getStatusColor(label, index) {
  const key = String(label).toLowerCase().replace(/\s+/g, '_');
  return STATUS_COLORS[key] || STATUS_COLORS[Object.keys(STATUS_COLORS)[index % Object.keys(STATUS_COLORS).length]] || CHART_BRAND;
}

function ChartPie({ id, data }) {
  const canvasRef = React.useRef(null);
  const chartRef = React.useRef(null);
  React.useEffect(() => {
    if (!window.Chart || !data || !canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();
    const labels = Object.keys(data);
    const colors = labels.map((l, i) => getStatusColor(l, i));
    chartRef.current = new window.Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: labels.map((k) => data[k]), backgroundColor: colors, borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: { backgroundColor: 'rgba(0,0,0,0.8)', padding: 10 },
          legend: { position: 'bottom' },
        },
      },
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [id, data]);
  return <canvas ref={canvasRef} />;
}

window.AdminPages = window.AdminPages || {};
window.AdminPages.Dashboard = DashboardPage;
