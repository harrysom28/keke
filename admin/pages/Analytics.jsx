const { useState, useEffect, useRef } = React;
const Api = window.AdminApi;
const Utils = window.AdminUtils;
const C = window.AdminComponents;

function AnalyticsPage({ showToast }) {
  const [period, setPeriod] = useState('30d');
  const [analytics, setAnalytics] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      Api.get('/api/admin/analytics?period=' + period),
      Api.get('/api/admin/revenue?period=' + period),
    ]).then(([aRes, rRes]) => {
      if (aRes.error) showToast(aRes.error, 'error');
      else setAnalytics(aRes.data?.data || aRes.data);
      if (rRes.error) showToast(rRes.error, 'error');
      else setRevenue(rRes.data?.data || rRes.data);
    }).finally(() => setLoading(false));
  }, [period]);

  if (loading && !analytics) return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>;

  const conv = analytics?.conversion || {};
  const hours = analytics?.rides_by_hour || [];
  const hoursByHour = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: hours.find((h) => h.hour === i)?.count || 0 }));

  return (
    <div className="space-y-6">
      <C.Breadcrumb items={[{ label: 'Analytics' }]} />
      <div className="flex gap-2">
        {['7d', '30d', '90d'].map((p) => (
          <button key={p} type="button" onClick={() => setPeriod(p)} className={`px-3 py-1.5 rounded-lg ${period === p ? 'text-white' : 'bg-gray-100 dark:bg-gray-700 dark:text-gray-200'}`} style={period === p ? { backgroundColor: 'var(--keke-primary-hex)' } : {}}>{p}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400">Conversion rate</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{conv.conversion_rate_percent ?? 0}%</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Booking → Completed (this period)</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400">Total rides (period)</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{conv.total ?? 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400">Completed</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{conv.completed ?? 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400">Cancelled</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{conv.cancelled ?? 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <C.ChartCard title="Peak hours (rides by hour of day)">
          <PeakHoursBarChart data={hoursByHour} />
        </C.ChartCard>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Earnings breakdown (revenue by method)</h3>
          {revenue?.revenue_by_method && Object.keys(revenue.revenue_by_method).length > 0 ? (
            <ul className="space-y-2">
              {Object.entries(revenue.revenue_by_method).map(([method, data]) => (
                <li key={method} className="flex justify-between text-sm">
                  <span className="capitalize text-gray-700 dark:text-gray-300">{method}</span>
                  <span className="font-medium">{Utils.formatCurrency(data.total)} ({data.count} txns)</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No revenue data for this period.</p>
          )}
          {revenue?.total_revenue != null && (
            <p className="mt-4 pt-4 border-t dark:border-gray-700 font-bold text-gray-900 dark:text-white">Total: {Utils.formatCurrency(revenue.total_revenue)}</p>
          )}
        </div>
      </div>

      {analytics?.rides_by_status && Object.keys(analytics.rides_by_status).length > 0 && (
        <C.ChartCard title="Rides by status (period)">
          <div className="flex flex-wrap gap-4">
            {Object.entries(analytics.rides_by_status).map(([status, count]) => (
              <span key={status} className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm">{status}: {count}</span>
            ))}
          </div>
        </C.ChartCard>
      )}
    </div>
  );
}

function PeakHoursBarChart({ data }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => {
    if (!window.Chart || !data?.length || !canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();
    const max = Math.max(...data.map((d) => d.count), 1);
    chartRef.current = new window.Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: data.map((d) => d.hour + ':00'),
        datasets: [{ label: 'Rides', data: data.map((d) => d.count), backgroundColor: 'rgba(60, 143, 124, 0.6)' }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 8, right: 8, bottom: 8, left: 8 } },
        scales: {
          y: { beginAtZero: true, max: max + 1 },
          x: { max: 24 },
        },
      },
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [data]);
  return (
    <div className="w-full" style={{ position: 'relative', height: 280 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

window.AdminPages = window.AdminPages || {};
window.AdminPages.Analytics = AnalyticsPage;
