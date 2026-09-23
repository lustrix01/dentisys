export function isTransportOrBiometricUnavailable(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (obj.status === 0 || obj.status === 503) return true;
    if (obj.code === 'biometric_service_unavailable') return true;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes('unable to connect') ||
      msg.includes('network') ||
      msg.includes('connection') ||
      msg.includes('temporarily unavailable') ||
      msg.includes('service unavailable') ||
      msg.includes('timeout')
    ) {
      return true;
    }
  }
  return false;
}
