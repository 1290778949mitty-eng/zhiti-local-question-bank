// Work around a known wrangler dev / workerd local-proxy race that can turn
// otherwise valid non-GET requests into a synthetic 503 such as
// "Your worker restarted mid-request" / "Network connection lost".
//
// This preload is test-only. It never retries application 503 responses: the
// response body must match Wrangler's proxy failure and the target must be a
// loopback URL. Production fetch behavior is unchanged.
const nativeFetch = globalThis.fetch;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);
const WRANGLER_PROXY_FAILURE = /(?:worker restarted mid-request|network connection lost)/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function requestUrl(input) {
  try {
    if (typeof input === 'string' || input instanceof URL) return new URL(input);
    if (input && typeof input.url === 'string') return new URL(input.url);
  } catch { /* Let native fetch report malformed input. */ }
  return null;
}

function requestMethod(input, init) {
  return String(init?.method ?? (input && typeof input.method === 'string' ? input.method : 'GET')).toUpperCase();
}

function replayable(input, init) {
  const url = requestUrl(input);
  if (!url || !LOOPBACK.has(url.hostname)) return false;
  const method = requestMethod(input, init);
  if (method === 'GET' || method === 'HEAD') return false;
  // Tests call fetch with URL + buffered/string bodies. Avoid replaying a
  // consumed Request or streaming body if a future test starts using one.
  if (typeof Request !== 'undefined' && input instanceof Request) return false;
  if (typeof ReadableStream !== 'undefined' && init?.body instanceof ReadableStream) return false;
  return true;
}

globalThis.fetch = async function fetchWithLocalWranglerRetry(input, init) {
  const response = await nativeFetch(input, init);
  if (response.status !== 503 || !replayable(input, init)) return response;

  let body = '';
  try { body = await response.clone().text(); } catch { return response; }
  if (!WRANGLER_PROXY_FAILURE.test(body)) return response;

  // A small offset also avoids re-entering the local proxy's 5s keep-alive
  // boundary on the exact same millisecond.
  await sleep(75);
  return nativeFetch(input, init);
};
