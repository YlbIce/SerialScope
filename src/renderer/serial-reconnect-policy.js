(function exposeSerialReconnectPolicy(root, factory) {
  const api = factory();
  root.SerialReconnectPolicy = api;
  if (typeof module !== 'undefined') module.exports = api;
}(globalThis, () => {
  const maxAttempts = 8;
  const baseDelayMs = 600;
  const maxDelayMs = 8000;
  const delayForAttempt = (attempt) => Math.min(maxDelayMs, baseDelayMs * (2 ** Math.max(0, attempt)));
  const canRetry = (enabled, attempt, manuallyClosed) => Boolean(enabled) && !manuallyClosed && Number(attempt) < maxAttempts;
  return { maxAttempts, baseDelayMs, maxDelayMs, delayForAttempt, canRetry };
}));
