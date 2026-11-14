// Server validation errors as { field: message }; accepts both the [{field, message}] list and the { field: message } map.
export function apiFieldErrors(err: unknown): Record<string, string> {
  const raw = err && typeof err === 'object' ? (err as { errors?: unknown }).errors : null;
  const out: Record<string, string> = {};
  if (Array.isArray(raw)) {
    for (const item of raw) if (item && typeof item.field === 'string' && typeof item.message === 'string') out[item.field] = item.message;
  } else if (raw && typeof raw === 'object') {
    for (const [field, message] of Object.entries(raw)) if (typeof message === 'string') out[field] = message;
  }
  return out;
}
