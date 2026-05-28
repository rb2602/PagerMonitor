// SQLite datetime('now') returns 'YYYY-MM-DD HH:MM:SS' with no timezone marker.
// Without 'Z', JS parses it as local time instead of UTC — shift the display.
// Normalize any such string to a proper UTC ISO string before passing to Date().
export function normTs(ts) {
  if (!ts) return ts;
  if (!ts.includes('T') && !ts.endsWith('Z')) return ts.replace(' ', 'T') + 'Z';
  return ts;
}
