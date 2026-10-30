const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/parser.js`, 'utf8');

function setup(args = {}, fail = false) {
  const calls = [], cache = new Map();
  const c = { $arguments: { f: '{region}', ...args },
    ProxyUtils: { produce: p => p.map(x => ({ ...x })) },
    scriptResourceCache: { get: k => cache.get(k), set: (k, v) => cache.set(k, v) },
    $substore: { info() {}, error() {}, wait: async () => {}, http: {
      get: async o => { calls.push(o); if (fail) throw Error('timeout'); return { status: 204, body: '' }; },
      post: async o => { calls.push(o); if (o.url.endsWith('/start')) return { body: JSON.stringify({ pid: 7, ports: JSON.parse(o.body).proxies.map((_, i) => 10000+i) }) }; if (o.url.endsWith('/udp')) return { status: 200, body: JSON.stringify({ result: 'ok' }) }; return { status: 200, body: '{}' }; }
    } } };
  vm.createContext(c); vm.runInContext(source, c); return { c, calls, cache };
}
const input = () => [{ name: 'HK-01', type: 'ss', server: 'example.com', port: 443, udp: true }];

test('new checks default off', async () => {
  const h = setup(); const out = await h.c.operator(input());
  assert.equal(h.calls.length, 0); assert.equal(out[0]._capabilityCheck, undefined);
});
test('opt-in UDP and HTTP samples are bounded, cached and preserve nodes', async () => {
  const h = setup({ check_udp: true, check_http: true, check_samples: 3, check_ntp: 'ntp.example' });
  const out = await h.c.operator(input()); const result = out[0]._capabilityCheck;
  assert.equal(out.length, 1); assert.equal(result.udp.status, 'ok');
  assert.equal(result.http.success, 3); assert.equal(result.http.failures, 0); assert.equal(result.http.failureRate, 0);
  assert.equal(h.calls.filter(x => x.url.endsWith('/udp')).length, 1);
  assert.equal(JSON.parse(h.calls.find(x => x.url.endsWith('/udp')).body).ntp, 'ntp.example');
  assert.equal(h.calls.filter(x => x.method === 'get').length, 3);
  await h.c.operator(input()); assert.equal(h.calls.filter(x => x.method === 'get').length, 3);
});
test('timeouts remain unknown/failed, never remove nodes or set _failed', async () => {
  const h = setup({ check_http: true, check_samples: 2 }, true); const out = await h.c.operator(input());
  assert.equal(out.length, 1); assert.equal(out[0]._failed, undefined);
  assert.equal(out[0]._capabilityCheck.http.failures, 2); assert.equal(out[0]._capabilityCheck.http.failureRate, 100);
});
test('scope filters original names and invalid patterns fail before starting META', async () => {
  const h = setup({ check_http: true, check_scope: '^JP' }); await h.c.operator(input()); assert.equal(h.calls.length, 0);
  const bad = setup({ check_udp: true, check_scope: '[' }); await assert.rejects(bad.c.operator(input()), /check_scope/); assert.equal(bad.calls.length, 0);
});
test('different endpoints produced by flat do not inherit capability results', async () => {
  const h = setup({ check_udp: true, flat: '{example.com:192.0.2.1}' }); const out = await h.c.operator(input());
  assert.equal(out.length, 2); assert.equal(out[0]._capabilityCheck.udp.status, 'ok');
  assert.equal(out[1]._capabilityCheck, undefined);
});
test('HTTP META plain timeout is reported as unknown UDP', async () => {
  const h = setup({ check_udp: true }); const original = h.c.$substore.http.post;
  h.c.$substore.http.post = async o => o.url.endsWith('/udp') ? { status: 200, body: 'timeout' } : original(o);
  const out = await h.c.operator(input());
  assert.equal(out[0]._capabilityCheck.udp.status, 'unknown');
  assert.equal(out[0]._capabilityCheck.udp.reason, 'timeout');
});
test('capability placeholders are optional and do not change default names', async () => {
  const h = setup({ f: '{region}{udp_status}{http_failure_rate}', check_udp: true, check_http: true, check_samples: 2 });
  const out = await h.c.operator(input()); assert.equal(out[0].name, 'HK-ok-0');
  const off = setup({ f: '{region}{udp_status}{http_failure_rate}' });
  assert.equal((await off.c.operator(input()))[0].name, 'HK');
});
