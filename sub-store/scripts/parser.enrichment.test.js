const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/parser.js`, 'utf8');
function harness(args = {}) {
    const calls = [], cache = new Map();
    const ctx = { $arguments: { f: '{region}', ...args },
        require: name => name === 'dns' ? { promises: { lookup: async () => ({ address: '8.8.8.8' }) } } : require(name),
        ProxyUtils: { produce: p => p.map(x => ({ ...x })) },
        scriptResourceCache: { get: k => cache.get(k), set: (k, v) => cache.set(k, v) },
        $substore: { info() {}, error() {}, wait: async () => {}, http: {
            get: async o => { calls.push(o); if (o.url.includes('chat.openai.com')) return { status: 403, body: '{"error":{"code":"unauthorized"}}' }; if (o.url.includes('ip-api.com/json/')) return { status: 200, body: '{"status":"success","query":"8.8.8.8","countryCode":"US","isp":"Example","as":"AS15169 Example"}' }; return { status: 204, body: '' }; },
            post: async o => { calls.push(o); if (o.url.endsWith('/start')) return { body: JSON.stringify({ pid: 42, ports: JSON.parse(o.body).proxies.map((_, i) => 10000 + i) }) }; return { status: 200, body: '{}' }; }
        } } };
    vm.createContext(ctx); vm.runInContext(source, ctx); return { ctx, calls, cache };
}
const nodes = () => [{ name: 'HK-01', type: 'ss', server: 'node.example', port: 443 }, { name: 'JP-01', type: 'ss', server: '192.168.1.1', port: 443 }];
test('new checks are off by default', async () => { const h = harness(); const result = await h.ctx.operator(nodes()); assert.equal(h.calls.length, 0); assert.ok(result.every(p => !p._entrance && !p._capabilityCheck)); });
test('GPT and HTTP are scoped independently and record latency', async () => {
    const h = harness({ check: 'gpt,http', options: { gpt: { scope: 'HK' }, http: { scope: 'JP', samples: 2 } } });
    const r = await h.ctx.operator(nodes());
    assert.equal(r[0]._capabilityCheck.gpt.status, 'reachable'); assert.equal(r[0]._capabilityCheck.http, undefined);
    assert.equal(r[1]._capabilityCheck.http.success, 2); assert.equal(typeof r[1]._capabilityCheck.http.averageLatencyMs, 'number'); assert.equal(r[1]._capabilityCheck.gpt, undefined);
    await h.ctx.operator(nodes()); assert.equal(h.calls.filter(c => c.url.includes('chat.openai.com')).length, 1);
});
test('entrance resolves and deduplicates hosts, skips private addresses', async () => {
    const h = harness({ check: 'entrance' }); const n = nodes(); n.push({ ...n[0], name: 'HK-02' });
    const r = await h.ctx.operator(n); assert.equal(r[0]._entrance.countryCode, 'US'); assert.equal(r[0].server, 'node.example');
    assert.equal(r[1]._entrance.status, 'unknown'); assert.equal(r[1]._entrance.reason, 'non_public_address');
    assert.equal(h.calls.filter(c => c.url.includes('ip-api.com/json/')).length, 1); assert.equal(r[2]._entrance.ip, '8.8.8.8');
});
test('GPT cannot treat unexpected 403 as positive, and unknown preserves node', () => {
    const h = harness(); assert.equal(h.ctx.parseGptResponse(403, '{"error":{"code":"unsupported_country"}}').status, 'unsupported');
    assert.equal(h.ctx.parseGptResponse(403, 'cloudflare blocked').status, 'unknown');
    assert.equal(h.ctx.parseGptResponse(200, 'hello').status, 'unknown');
});
test('fake IP and documentation ranges are not treated as public entrances', () => {
    const h = harness(); const net = require('net');
    for (const ip of ['198.18.1.2', '198.19.1.2', '192.0.2.1', '198.51.100.1', '203.0.113.1', '127.0.0.1']) assert.equal(h.ctx.isPublicEntranceAddress(ip, net), false);
    assert.equal(h.ctx.isPublicEntranceAddress('8.8.8.8', net), true);
});
