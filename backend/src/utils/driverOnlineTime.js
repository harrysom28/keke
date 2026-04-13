/**
 * Online duration label for drivers (second precision).
 * @param {number} ms
 * @returns {string} e.g. "00h 01m 05s"
 */
export function formatOnlineDurationMs(ms) {
  const n = Math.max(0, Number(ms) || 0);
  const totalS = Math.floor(n / 1000);
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  const pad = (v) => String(v).padStart(2, '0');
  return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}
