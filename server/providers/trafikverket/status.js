import { getTrafikverketClient } from './client.js';
/** Read-only diagnostics; never accepts raw upstream queries or credentials. */
export function createTrafikverketStatusMiddleware({
  getClient = getTrafikverketClient,
} = {}) {
  return (req, res, next) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname !== '/status') {
      next();
      return;
    }
    const send = (status, body) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...(status === 405 ? { Allow: 'GET' } : {}),
      });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'GET') {
      send(405, { error: 'method_not_allowed' });
      return;
    }
    if (url.search) {
      send(400, { error: 'unsupported_parameters' });
      return;
    }
    try {
      send(200, getClient().getStatus());
    } catch {
      send(503, { error: 'client_unavailable' });
    }
  };
}
