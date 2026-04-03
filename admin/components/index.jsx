/**
 * Keke Admin - Reusable UI components (JSX)
 * Load with type="text/babel"
 */
const { useState, useEffect, useRef } = React;

function Toast({ id, message, type, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, []);
  const bg = type === 'error' ? 'bg-red-600' : type === 'warning' ? 'bg-amber-600' : 'bg-green-600';
  return (
    <div className={`${bg} text-white px-4 py-3 rounded-lg shadow-lg flex items-center justify-between min-w-[280px] max-w-md`}>
      <span>{message}</span>
      <button type="button" onClick={onDismiss} className="ml-2 text-white/90 hover:text-white">×</button>
    </div>
  );
}

function ToastContainer({ toasts, dismiss }) {
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map((t) => (
        <Toast key={t.id} {...t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function Modal({ open, onClose, title, children, width = 'max-w-lg' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className={`relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full ${width} max-h-[90vh] overflow-auto`}>
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">×</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger }) {
  if (!open) return null;
  const btnClass = danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
        <p className="mt-2 text-gray-600 dark:text-gray-300">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border dark:border-gray-600 text-gray-700 dark:text-gray-300">Cancel</button>
          <button type="button" onClick={() => { onConfirm(); onClose(); }} className={`px-3 py-1.5 rounded-lg text-white ${btnClass}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  const pages = [];
  for (let i = 1; i <= Math.min(totalPages, 9); i++) pages.push(i);
  return (
    <div className="flex items-center gap-1 mt-4">
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="px-2 py-1 rounded border disabled:opacity-50 dark:border-gray-600">Prev</button>
      {pages.map((p) => (
        <button key={p} type="button" onClick={() => onPageChange(p)} className={`px-2 py-1 rounded border dark:border-gray-600 ${p === page ? 'bg-blue-600 text-white border-blue-600' : ''}`}>{p}</button>
      ))}
      <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="px-2 py-1 rounded border disabled:opacity-50 dark:border-gray-600">Next</button>
    </div>
  );
}

function StatsCard({ title, value, icon, color, change, trend, compareText, sparklineData, progress }) {
  const colors = { blue: 'bg-blue-500', green: 'bg-green-500', purple: 'bg-purple-500', yellow: 'bg-yellow-500', red: 'bg-red-500', orange: 'bg-orange-500', brand: 'bg-[#3C8F7C]' };
  const hasTrend = change != null || trend;
  const trendUp = trend === 'up' || (typeof change === 'string' && change.startsWith('+'));
  const trendDown = trend === 'down' || (typeof change === 'string' && change.startsWith('-'));
  const trendColor = trendUp ? 'text-green-600 dark:text-green-400' : trendDown ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400';
  const pct = progress != null && typeof progress === 'number' ? Math.min(1, Math.max(0, progress)) : null;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 h-full">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</p>
          <p className="mt-1 font-bold text-gray-900 dark:text-white tracking-tight" style={{ fontSize: '1.875rem', lineHeight: 1.2 }}>{value}</p>
          {hasTrend && (
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              {trend && (
                <span className={trendColor} aria-hidden="true">
                  {trendUp ? '\u2191' : trendDown ? '\u2193' : '\u2014'}
                </span>
              )}
              {change != null && <span className={`text-sm font-medium ${trendColor}`}>{change}</span>}
              {compareText && <span className="text-xs text-gray-500 dark:text-gray-400">{compareText}</span>}
            </div>
          )}
          {pct != null && (
            <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full transition-all duration-300" style={{ width: pct * 100 + '%', backgroundColor: 'var(--keke-primary-hex)' }} />
            </div>
          )}
          {sparklineData && sparklineData.length > 0 && (
            <div className="mt-2 h-8 flex items-end gap-0.5">
              <Sparkline data={sparklineData} color={color} />
            </div>
          )}
        </div>
        <div className={`${colors[color] || colors.blue} w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0`}>{icon}</div>
      </div>
    </div>
  );
}

function Sparkline({ data, color }) {
  const ref = React.useRef(null);
  const max = Math.max(...data, 1);
  const height = 32;
  const width = Math.min(data.length * 4, 120);
  React.useEffect(() => {
    if (!ref.current || !data.length) return;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const pad = 2;
    const w = (width - pad * 2) / data.length;
    const stroke = color === 'green' ? '#22c55e' : color === 'red' ? '#ef4444' : color === 'yellow' ? '#eab308' : color === 'purple' ? '#8b5cf6' : color === 'brand' ? '#3C8F7C' : '#3b82f6';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = pad + i * w + w / 2;
      const y = height - pad - (v / max) * (height - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [data, width, height, color]);
  return <canvas ref={ref} width={width} height={height} className="block" style={{ width, height }} aria-hidden="true" />;
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{title}</h3>
      {children}
    </div>
  );
}

function DataTable({ columns, rows, keyField = 'id', onRowClick, loading, emptyMessage = 'No data' }) {
  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700"><tr>{columns.map((c) => <th key={c.key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">{c.label}</th>)}</tr></thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {[1,2,3,4,5].map((i) => (
              <tr key={i}><td colSpan={columns.length} className="px-6 py-4"><div className="h-5 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" /></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-700">
          <tr>{columns.map((c) => <th key={c.key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">{c.label}</th>)}</tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">{emptyMessage}</td></tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row[keyField] || row._id || row.user_id || row.driver_id || row.ride_id || Math.random()}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700' : ''}
              >
                {columns.map((c) => (
                  <td key={c.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">
                    {typeof c.render === 'function' ? c.render(row[c.key], row) : (row[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Breadcrumb({ items }) {
  return (
    <nav className="flex text-sm text-gray-500 dark:text-gray-400 mb-4">
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-2">/</span>}
          {item.href ? <a href={item.href} className="hover:text-gray-700 dark:hover:text-gray-300">{item.label}</a> : <span className="text-gray-900 dark:text-white">{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

function EmptyState({ title, message, actionLabel, onAction }) {
  return (
    <div className="text-center py-12 px-4">
      <p className="text-lg font-medium text-gray-900 dark:text-white">{title}</p>
      <p className="mt-1 text-gray-500 dark:text-gray-400">{message}</p>
      {actionLabel && onAction && <button type="button" onClick={onAction} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">{actionLabel}</button>}
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="text-center py-12 px-4">
      <p className="text-red-600 dark:text-red-400">{message}</p>
      {onRetry && <button type="button" onClick={onRetry} className="mt-4 px-4 py-2 border rounded-lg dark:border-gray-600">Retry</button>}
    </div>
  );
}

function Skeleton({ className }) {
  return <div className={`animate-pulse bg-gray-200 dark:bg-gray-600 rounded ${className || 'h-5 w-full'}`} />;
}

window.AdminComponents = {
  Toast,
  ToastContainer,
  Modal,
  ConfirmDialog,
  Pagination,
  StatsCard,
  Sparkline,
  ChartCard,
  DataTable,
  Breadcrumb,
  EmptyState,
  ErrorState,
  Skeleton,
};
