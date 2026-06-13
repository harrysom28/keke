const { useState, useEffect } = React;
const Api = window.AdminApi;
const Utils = window.AdminUtils;
const C = window.AdminComponents;

const FINANCE_TABS = [
  { id: 'payments', label: 'Payments' },
  { id: 'withdrawals', label: 'Withdrawals' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'wallet-topups', label: 'Wallet top-ups' },
  { id: 'payouts', label: 'Payout requests' },
  { id: 'platform', label: 'Platform summary' },
];

function FinancePage({ showToast }) {
  const [tab, setTab] = useState('payments');
  const [payments, setPayments] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
  const [withdrawals, setWithdrawals] = useState([]);
  const [withdrawalPagination, setWithdrawalPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [walletPagination, setWalletPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
  const [walletSummary, setWalletSummary] = useState(null);
  const [payoutRequests, setPayoutRequests] = useState([]);
  const [payoutPagination, setPayoutPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
  const [payoutStatusFilter, setPayoutStatusFilter] = useState('pending');
  const [platformSummary, setPlatformSummary] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refundModal, setRefundModal] = useState({ open: false, id: null, amount: '', reason: '', paymentAmount: null });
  const [rejectPayoutModal, setRejectPayoutModal] = useState({ open: false, id: null, reason: '' });
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
    } else if (tab === 'revenue') {
      Api.get('/api/admin/revenue?period=' + period).then((res) => {
        if (res.error) showToast(res.error, 'error');
        else setRevenue(res.data?.data || res.data);
      }).finally(() => setLoading(false));
    } else if (tab === 'wallet-topups') {
      const params = new URLSearchParams({ page: walletPagination.page, limit: walletPagination.limit });
      Promise.all([
        Api.get('/api/admin/wallet-summary'),
        Api.get('/api/admin/wallet-transactions?' + params),
      ]).then(([summaryRes, txRes]) => {
        if (summaryRes.error) showToast(summaryRes.error, 'error');
        else setWalletSummary(summaryRes.data?.data || summaryRes.data);
        if (txRes.error) {
          showToast(txRes.error, 'error');
          setWalletTransactions([]);
          setWalletPagination((p) => ({ ...p, total: 0, pages: 1 }));
        } else {
          const d = txRes.data?.data || txRes.data;
          setWalletTransactions(d.wallet_transactions || []);
          setWalletPagination((p) => ({ ...p, total: d.pagination?.total ?? 0, pages: d.pagination?.pages ?? 1 }));
        }
      }).finally(() => setLoading(false));
    } else if (tab === 'payouts') {
      const params = new URLSearchParams({ page: payoutPagination.page, limit: payoutPagination.limit });
      if (payoutStatusFilter) params.set('status', payoutStatusFilter);
      Api.get('/api/admin/payout-requests?' + params).then((res) => {
        if (res.error) {
          showToast(res.error, 'error');
          setPayoutRequests([]);
          setPayoutPagination((p) => ({ ...p, total: 0, pages: 1 }));
        } else {
          const d = res.data?.data || res.data;
          setPayoutRequests(d.payout_requests || []);
          setPayoutPagination((p) => ({ ...p, total: d.pagination?.total ?? 0, pages: d.pagination?.pages ?? 1 }));
        }
      }).finally(() => setLoading(false));
    } else if (tab === 'platform') {
      Api.get('/api/admin/financial-summary').then((res) => {
        if (res.error) showToast(res.error, 'error');
        else setPlatformSummary(res.data?.data || res.data);
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [tab, pagination.page, withdrawalPagination.page, walletPagination.page, payoutPagination.page, payoutStatusFilter, dateFrom, dateTo, statusFilter, methodFilter, period]);

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

  const approvePayout = (id) => {
    Api.patch('/api/admin/payout-requests/' + id + '/approve').then((r) => {
      if (r.error) showToast(r.error, 'error');
      else {
        showToast('Payout approved');
        setPayoutRequests((list) => list.filter((p) => (p.payout_request_id || p._id) !== id));
      }
    });
  };

  const rejectPayout = () => {
    if (!rejectPayoutModal.id) return;
    Api.patch('/api/admin/payout-requests/' + rejectPayoutModal.id + '/reject', {
      reason: rejectPayoutModal.reason || 'Rejected by admin',
    }).then((r) => {
      if (r.error) showToast(r.error, 'error');
      else {
        showToast('Payout rejected');
        setRejectPayoutModal({ open: false, id: null, reason: '' });
        setPayoutRequests((list) => list.filter((p) => (p.payout_request_id || p._id) !== rejectPayoutModal.id));
      }
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
  ].map((col, idx) => (col.label === 'Action' ? { ...col, key: 'payment_action_' + idx } : col));

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

  const walletColumns = [
    { key: 'reference', label: 'Reference', render: (v) => (v || '').slice(-12) },
    { key: 'user_email', label: 'User' },
    { key: 'type', label: 'Type' },
    { key: 'amount', label: 'Amount', render: (v) => Utils.formatCurrency(v) },
    { key: 'balance_after', label: 'Balance after', render: (v) => Utils.formatCurrency(v) },
    { key: 'created_at', label: 'Date', render: (v) => Utils.formatDate(v) },
  ];

  const payoutColumns = [
    { key: 'payout_request_id', label: 'ID', render: (v) => (v || '').slice(-8) },
    { key: 'driver_name', label: 'Driver' },
    { key: 'amount', label: 'Amount', render: (v) => Utils.formatCurrency(v) },
    { key: 'status', label: 'Status' },
    { key: 'requested_at', label: 'Requested', render: (v) => Utils.formatDate(v) },
    {
      key: 'payout_request_id',
      label: 'Action',
      render: (v, row) => row.status === 'pending' ? (
        <div className="flex gap-3">
          <button type="button" onClick={() => approvePayout(v)} className="text-green-600 hover:underline">Approve</button>
          <button type="button" onClick={() => setRejectPayoutModal({ open: true, id: v, reason: '' })} className="text-red-600 hover:underline">Reject</button>
        </div>
      ) : '—',
    },
  ];

  const platformRows = platformSummary ? [
    { label: 'Total platform revenue', value: Utils.formatCurrency(platformSummary.total_platform_revenue ?? 0) },
    { label: 'Total driver payouts', value: Utils.formatCurrency(platformSummary.total_driver_payouts ?? 0) },
    { label: 'Outstanding liabilities', value: Utils.formatCurrency(platformSummary.outstanding_liabilities ?? 0) },
    { label: 'Available driver balances', value: Utils.formatCurrency(platformSummary.available_balances_total ?? 0) },
    { label: 'Pending driver balances', value: Utils.formatCurrency(platformSummary.pending_balances_total ?? 0) },
    { label: 'Pending payout requests', value: `${platformSummary.pending_payout_requests_count ?? 0} (${Utils.formatCurrency(platformSummary.pending_payout_requests_amount ?? 0)})` },
  ] : [];

  return (
    <div className="space-y-4">
      <C.Breadcrumb items={[{ label: 'Finance' }]} />
      <div className="flex flex-wrap gap-2">
        {FINANCE_TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`px-3 py-1.5 rounded-lg ${tab === t.id ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 dark:text-gray-200'}`}>{t.label}</button>
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

      {tab === 'wallet-topups' && (
        <div className="space-y-4">
          {walletSummary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">Total funded</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">{Utils.formatCurrency(walletSummary.total_funded ?? 0)}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">Total refunded</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">{Utils.formatCurrency(walletSummary.total_refunded ?? 0)}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">Pending funding</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">{walletSummary.pending_funding_count ?? 0} · {Utils.formatCurrency(walletSummary.pending_funding_amount ?? 0)}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">Failed</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">{walletSummary.failed_count ?? 0} · {Utils.formatCurrency(walletSummary.failed_amount ?? 0)}</p>
              </div>
            </div>
          )}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <C.DataTable columns={walletColumns} rows={walletTransactions} keyField="reference" loading={loading} emptyMessage="No wallet transactions" />
            <div className="px-4 py-2 border-t dark:border-gray-700 flex justify-end">
              <C.Pagination page={walletPagination.page} totalPages={walletPagination.pages} onPageChange={(p) => setWalletPagination((prev) => ({ ...prev, page: p }))} />
            </div>
          </div>
        </div>
      )}

      {tab === 'payouts' && (
        <>
          <select value={payoutStatusFilter} onChange={(e) => { setPayoutStatusFilter(e.target.value); setPayoutPagination((p) => ({ ...p, page: 1 })); }} className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600">
            <option value="">All status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <C.DataTable columns={payoutColumns} rows={payoutRequests} keyField="payout_request_id" loading={loading} emptyMessage="No payout requests" />
            <div className="px-4 py-2 border-t dark:border-gray-700 flex justify-end">
              <C.Pagination page={payoutPagination.page} totalPages={payoutPagination.pages} onPageChange={(p) => setPayoutPagination((prev) => ({ ...prev, page: p }))} />
            </div>
          </div>
        </>
      )}

      {tab === 'platform' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          {loading ? <C.Skeleton className="h-40 w-full" /> : platformSummary ? (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {platformRows.map((row) => (
                <div key={row.label} className="border dark:border-gray-700 rounded-lg p-4">
                  <dt className="text-sm text-gray-500 dark:text-gray-400">{row.label}</dt>
                  <dd className="text-lg font-semibold text-gray-900 dark:text-white mt-1">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : <C.EmptyState title="No data" message="Platform summary not available" />}
        </div>
      )}

      <C.Modal open={refundModal.open} onClose={() => setRefundModal({ open: false })} title="Refund payment">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Amount (pre-filled for full refund).</p>
        <input type="number" step="0.01" placeholder="Amount" value={refundModal.amount} onChange={(e) => setRefundModal((m) => ({ ...m, amount: e.target.value }))} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 mb-2" />
        <input type="text" placeholder="Reason (optional)" value={refundModal.reason} onChange={(e) => setRefundModal((m) => ({ ...m, reason: e.target.value }))} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 mb-2" />
        <button type="button" onClick={doRefund} className="mt-2 px-3 py-1.5 bg-red-600 text-white rounded-lg">Process refund</button>
      </C.Modal>

      <C.Modal open={rejectPayoutModal.open} onClose={() => setRejectPayoutModal({ open: false, id: null, reason: '' })} title="Reject payout request">
        <input type="text" placeholder="Reason (optional)" value={rejectPayoutModal.reason} onChange={(e) => setRejectPayoutModal((m) => ({ ...m, reason: e.target.value }))} className="w-full px-3 py-2 border rounded dark:bg-gray-800 dark:border-gray-600 mb-2" />
        <button type="button" onClick={rejectPayout} className="mt-2 px-3 py-1.5 bg-red-600 text-white rounded-lg">Reject payout</button>
      </C.Modal>
    </div>
  );
}

window.AdminPages = window.AdminPages || {};
window.AdminPages.Finance = FinancePage;
