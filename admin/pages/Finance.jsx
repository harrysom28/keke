const { useState, useEffect } = React;
const Api = window.AdminApi;
const Utils = window.AdminUtils;
const C = window.AdminComponents;

function FinancePage({ showToast }) {
  const [tab, setTab] = useState('payments');
  const [payments, setPayments] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
  const [withdrawals, setWithdrawals] = useState([]);
  const [withdrawalPagination, setWithdrawalPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
  const [revenue, setRevenue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refundModal, setRefundModal] = useState({ open: false, id: null, amount: '', reason: '', paymentAmount: null });
  const [period, setPeriod] = useState('30d');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    if (tab === 'payments') {
      const params = new URLSearchParams({ page: pagination.page, limit: pagination.limit });
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (statusFilter) params.set('status', statusFilter);
      if (methodFilter) params.set('method', methodFilter);
      Api.get('/api/admin/payments?' + params).then((res) => {
        if (res.error) { showToast(res.error, 'error'); setPayments([]); setPagination((p) => ({ ...p, pages: 1 })); return; }
        const d = res.data?.data || res.data;
        setPayments(d.payments || []);
        setPagination((p) => ({ ...p, total: d.pagination?.total ?? 0, pages: d.pagination?.pages ?? 1 }));
      }).finally(() => setLoading(false));
    } else if (tab === 'withdrawals') {
      const params = new URLSearchParams({ page: withdrawalPagination.page, limit: withdrawalPagination.limit });
      Api.get('/api/admin/withdrawals?' + params).then((res) => {
        if (res.error) {
          showToast(res.error, 'error');
          setWithdrawals([]);
          setWithdrawalPagination((p) => ({ ...p, total: 0, pages: 1 }));
        } else {
          const d = res.data?.data || res.data;
          setWithdrawals((d.withdrawals || []) || []);
          setWithdrawalPagination((p) => ({ ...p, total: d.pagination?.total ?? 0, pages: d.pagination?.pages ?? 1 }));
        }
      }).finally(() => setLoading(false));
    } else {
      Api.get('/api/admin/revenue?period=' + period).then((res) => {
        if (res.error) showToast(res.error, 'error');
        else setRevenue(res.data?.data || res.data);
      }).finally(() => setLoading(false));
    }
  }, [tab, pagination.page, withdrawalPagination.page, dateFrom, dateTo, statusFilter, methodFilter, period]);

  const approveWithdrawal = (id) => {
    Api.patch('/api/admin/withdrawals/' + id + '/approve').then((r) => {
      if (r.error) showToast(r.error, 'error');
      else { showToast('Withdrawal approved'); setWithdrawals((list) => list.filter((w) => (w.withdrawal_id || w._id) !== id)); }
    });
  };

  const rejectWithdrawal = (id) => {
    Api.patch('/api/admin/withdrawals/' + id + '/reject').then((r) => {
      if (r.error) showToast(r.error, 'error');
      else { showToast('Withdrawal rejected'); setWithdrawals((list) => list.filter((w) => (w.withdrawal_id || w._id) !== id)); }
    });
  };

  const doRefund = () => {
    if (!refundModal.id) return;
    const raw = refundModal.amount ? parseFloat(refundModal.amount) : refundModal.paymentAmount;
    const amount = raw != null ? (typeof raw === 'number' ? raw : parseFloat(raw)) : null;
    if (amount == null || isNaN(amount) || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
    Api.post('/api/admin/payments/' + refundModal.id + '/refund', { amount, reason: refundModal.reason || 'Admin refund' }).then((r) => {
      if (r.error) showToast(r.error, 'error');
      else { showToast('Refund processed'); setRefundModal({ open: false, id: null, amount: '', reason: '', paymentAmount: null }); setPayments((list) => list.map((p) => ((p.payment_id || p._id) === refundModal.id ? { ...p, status: 'refunded' } : p))); }
    });
  };

  const paymentColumns = [
    { key: 'payment_id', label: 'ID', render: (v) => (v || '').slice(-8) },
    { key: 'amount', label: 'Amount', render: (v) => Utils.formatCurrency(v) },
    { key: 'method', label: 'Method' },
    { key: 'status', label: 'Status' },
    { key: 'created_at', label: 'Date', render: (v) => Utils.formatDate(v) },
    { key: 'payment_id', label: 'Action', render: (v, row) => row.status === 'completed' ? <button type="button" onClick={(e) => { e.stopPropagation(); setRefundModal({ open: true, id: v, amount: String(row.amount ?? ''), reason: '', paymentAmount: row.amount }); }} className="text-amber-600 hover:underline text-sm">Refund</button> : '—' },
  ];
  const withdrawalColumns = [
    { key: 'withdrawal_id', label: 'ID', render: (v) => (v || '').slice(-8) },
    { key: 'amount', label: 'Amount', render: (v, row) => Utils.formatCurrency(row.amount != null ? Math.abs(row.amount) : row.amount) },
    { key: 'status', label: 'Status' },
    { key: 'created_at', label: 'Date', render: (v) => Utils.formatDate(v) },
    {
      key: 'withdrawal_id',
      label: 'Action',
      render: (v, row) => row.status === 'pending' ? (
        <div className="flex gap-3">
          <button type="button" onClick={() => approveWithdrawal(v)} className="text-green-600 hover:underline">Approve</button>
          <button type="button" onClick={() => rejectWithdrawal(v)} className="text-red-600 hover:underline">Reject</button>
        </div>
      ) : '—',
    },
  ];

  return (
    <div className="space-y-4">
      <C.Breadcrumb items={[{ label: 'Finance' }]} />
      <div className="flex flex-wrap gap-2">
        {['payments', 'withdrawals', 'revenue'].map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg capitalize ${tab === t ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 dark:text-gray-200'}`}>{t}</button>
        ))}
      </div>

      {tab === 'payments' && (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600" title="From date" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600" title="To date" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600">
              <option value="">All status</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
            <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600">
              <option value="">All methods</option>
              <option value="card">Card</option>
              <option value="wallet">Wallet</option>
              <option value="cash">Cash</option>
              <option value="stripe">Stripe</option>
            </select>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <C.DataTable columns={paymentColumns} rows={payments} keyField="payment_id" loading={loading} emptyMessage="No payments" />
            <div className="px-4 py-2 border-t dark:border-gray-700 flex justify-between items-center">
              <button type="button" onClick={() => Utils.exportToCSV(payments.map((p) => ({ id: p.payment_id, amount: p.amount, method: p.method, status: p.status, date: p.created_at })), 'payments.csv')} className="text-sm text-blue-600 hover:underline">Export CSV</button>
              <C.Pagination page={pagination.page} totalPages={pagination.pages} onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))} />
            </div>
          </div>
        </>
      )}

      {tab === 'withdrawals' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <C.DataTable columns={withdrawalColumns} rows={withdrawals} keyField="withdrawal_id" loading={loading} emptyMessage="No withdrawals" />
          <div className="px-4 py-2 border-t dark:border-gray-700 flex justify-between items-center">
            <button type="button" onClick={() => Utils.exportToCSV(withdrawals, 'withdrawals.csv')} className="text-sm text-blue-600 hover:underline">Export CSV</button>
            <C.Pagination page={withdrawalPagination.page} totalPages={withdrawalPagination.pages} onPageChange={(p) => setWithdrawalPagination((prev) => ({ ...prev, page: p }))} />
          </div>
        </div>
      )}

      {tab === 'revenue' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-6">
          <div className="flex gap-2">
            {['7d', '30d', '90d', '1y'].map((p) => (
              <button key={p} type="button" onClick={() => setPeriod(p)} className={`px-3 py-1.5 rounded-lg ${period === p ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 dark:text-gray-200'}`}>{p}</button>
            ))}
          </div>
          {loading ? <C.Skeleton className="h-20 w-full" /> : revenue ? (
            <>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">Total revenue: {Utils.formatCurrency(revenue.total_revenue ?? revenue.total ?? revenue.totalRevenue ?? 0)}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Transactions: {revenue.total_transactions ?? revenue.total_transactions ?? 0}</p>
              {revenue.revenue_by_method && Object.keys(revenue.revenue_by_method).length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Revenue by category (payment method)</h4>
                  <ul className="space-y-1">
                    {Object.entries(revenue.revenue_by_method).map(([method, data]) => (
                      <li key={method} className="flex justify-between text-sm">
                        <span className="capitalize text-gray-700 dark:text-gray-300">{method}</span>
                        <span>{Utils.formatCurrency(data.total)} ({data.count} txns)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : <C.EmptyState title="No data" message="Revenue stats not available" />}
        </div>
      )}

      <C.Modal open={refundModal.open} onClose={() => setRefundModal({ open: false })} title="Refund payment">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Amount (pre-filled for full refund).</p>
        <input type="number" step="0.01" placeholder="Amount" value={refundModal.amount} onChange={(e) => setRefundModal((m) => ({ ...m, amount: e.target.value }))} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 mb-2" />
        <input type="text" placeholder="Reason (optional)" value={refundModal.reason} onChange={(e) => setRefundModal((m) => ({ ...m, reason: e.target.value }))} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 mb-2" />
        <button type="button" onClick={doRefund} className="mt-2 px-3 py-1.5 bg-red-600 text-white rounded-lg">Process refund</button>
      </C.Modal>
    </div>
  );
}

window.AdminPages = window.AdminPages || {};
window.AdminPages.Finance = FinancePage;
