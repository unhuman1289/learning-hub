// Hub automation v2 client for the family Mac. Credentials stay in this process; engines never see them.
const jobId = /^job_[a-f0-9]{20}$/;

export class HubError extends Error {
  constructor(status, body) {
    super('Hub API ' + status + (body?.errors ? ' (' + body.errors.map((e) => e.code).join(',') + ')' : ''));
    this.status = status;
    this.body = body;
  }
}

export function createHub({ baseUrl, bearer, accessClientId, accessClientSecret, fetcher = fetch, timeoutMs = 60000 }) {
  const url = new URL(baseUrl);
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw Error('Hub URL must use HTTPS (or http://localhost for development).');
  if (!/^lhk_[A-Za-z0-9-]{3,64}_[A-Za-z0-9._~-]{32,256}$/.test(bearer ?? '')) throw Error('HUB_BEARER is missing or malformed.');
  if (!local && (!accessClientId || !accessClientSecret)) throw Error('Cloudflare Access service token is required for a remote Hub.');
  const headers = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + bearer,
    ...(accessClientId ? { 'CF-Access-Client-Id': accessClientId, 'CF-Access-Client-Secret': accessClientSecret } : {}),
  };
  async function call(path, { method = 'GET', body, lease, raw = false } = {}) {
    const response = await fetcher(url.origin + '/api/automation/v2' + path, {
      method,
      headers: { ...headers, ...(lease ? { 'X-Lease-Token': lease } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (raw && response.ok) return response;
    const value = await response.json().catch(() => null);
    if (!response.ok && response.status !== 422) throw new HubError(response.status, value);
    return { status: response.status, body: value };
  }
  const job = (id) => {
    if (!jobId.test(id)) throw Error('Unexpected job id from Hub.');
    return '/jobs/' + id;
  };
  return {
    async lease(input) {
      return (await call('/jobs/lease', { method: 'POST', body: input })).body.jobs;
    },
    async context(lease) {
      return (await call(job(lease.jobId) + '/context', { lease: lease.leaseToken })).body;
    },
    async attachment(lease, attachmentId) {
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(attachmentId)) throw Error('Unexpected attachment id.');
      const response = await call(job(lease.jobId) + '/attachments/' + attachmentId, { lease: lease.leaseToken, raw: true });
      return { mime: response.headers.get('Content-Type'), bytes: Buffer.from(await response.arrayBuffer()) };
    },
    async heartbeat(lease) {
      return (await call(job(lease.jobId) + '/heartbeat', { method: 'POST', body: {}, lease: lease.leaseToken })).body;
    },
    /** Returns {status, body}; 422 is a normal answer carrying validation errors. */
    async result(lease, result, dryRun) {
      return call(job(lease.jobId) + '/result' + (dryRun ? '?dryRun=1' : ''), { method: 'POST', body: result, lease: lease.leaseToken });
    },
    async fail(lease, error, retryable) {
      return (
        await call(job(lease.jobId) + '/fail', { method: 'POST', body: { error: String(error).slice(0, 1000), retryable }, lease: lease.leaseToken })
      ).body;
    },
    /** Markdown history of one profile; needs the history:read scope and the profile in the client's learnerIds. */
    async history(learnerId) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(learnerId)) throw Error('Unexpected profile id.');
      const response = await call('/history/' + learnerId, { raw: true });
      return response.text();
    },
    async state(id) {
      return (await call(job(id))).body;
    },
  };
}
