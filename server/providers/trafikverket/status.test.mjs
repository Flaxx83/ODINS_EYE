import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrafikverketStatusMiddleware } from './status.js';
import { createTrafikverketClient } from './client.js';
function invoke(middleware, method = 'GET', url = '/status') {
  let result = {},
    next = false;
  middleware(
    { method, url },
    {
      writeHead(status, headers) {
        result.status = status;
        result.headers = headers;
      },
      end(body) {
        result.body = JSON.parse(body);
      },
    },
    () => {
      next = true;
    },
  );
  return { ...result, next };
}
test('status is read-only and cannot trigger upstream work or disclose a configured key', () => {
  let calls = 0;
  const key = 'fixture-status-secret';
  const client = createTrafikverketClient({
    getApiKey: () => key,
    fetchImpl: () => {
      calls++;
      throw Error('unexpected');
    },
  });
  const middleware = createTrafikverketStatusMiddleware({
    getClient: () => client,
  });
  const r = invoke(middleware);
  assert.equal(r.status, 200);
  assert.equal(r.body.configured, true);
  assert.equal(r.headers['Cache-Control'], 'no-store');
  assert.ok(!JSON.stringify(r.body).includes(key));
  assert.equal(calls, 0);
  assert.equal(invoke(middleware, 'POST').status, 405);
  assert.equal(invoke(middleware, 'GET', '/status?xml=secret').status, 400);
  assert.equal(calls, 0);
  assert.equal(invoke(middleware, 'GET', '/query').next, true);
});
test('status hides internal configuration errors and does not expose their contents', () => {
  const middleware = createTrafikverketStatusMiddleware({
    getClient: () => {
      throw Error('fixture-secret');
    },
  });
  const r = invoke(middleware);
  assert.equal(r.status, 503);
  assert.deepEqual(r.body, { error: 'client_unavailable' });
});
