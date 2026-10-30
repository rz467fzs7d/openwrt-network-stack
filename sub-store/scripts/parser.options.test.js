const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/parser.js`, 'utf8');
function harness(args) {
  const calls = [];
  const c = { $arguments: args, ProxyUtils: { produce: p => p.map(x => ({ ...x })) },
    $substore: { info() {}, error() {}, wait: async () => {}, http: {
      get: async o => { calls.push(o); return o.url.includes('policies.google.com') ? { status: 200, body: '<a data-name="country-version">Country version:</a> China</p>' } : { status: 204, body: '' }; },
      post: async o => { calls.push(o); if (o.url.endsWith('/start')) return { body: JSON.stringify({ pid: 3, ports: JSON.parse(o.body).proxies.map((_, i) => 10000+i) }) }; if (o.url.endsWith('/udp')) return { status: 200, body: '{"result":"ok"}' }; return { status: 200, body: '{}' }; }
    } } };
  vm.createContext(c); vm.runInContext(source, c); return { c, calls };
}
const input = () => [{name:'HK-01',type:'ss',server:'a.example',port:1},{name:'JP-01',type:'ss',server:'b.example',port:2}];
test('exit runs without region* and region* combines with check', async () => {
  const h = harness({ f:'{region}', check:'exit', options:'{"exit":{"scope":"HK"}}' });
  const r = await h.c.operator(input()); assert.equal(r[0]._googleCheck.terms.status, 'cn'); assert.equal(r[1]._googleCheck, undefined);
  const h2 = harness({ f:'{region*}', check:'udp', options:{exit:{scope:'HK'},udp:{scope:'JP'}} });
  const r2 = await h2.c.operator(input()); assert.equal(r2[0]._googleCheck.terms.status, 'cn'); assert.equal(r2[1]._capabilityCheck.udp.status, 'ok'); assert.equal(r2[0]._capabilityCheck, undefined);
});
test('per-service scope and samples', async () => {
  const h = harness({ f:'{region}', check:'udp,http', options:JSON.stringify({udp:{scope:'HK',ntp:'ntp.example'},http:{scope:'JP',samples:3}}) });
  const r = await h.c.operator(input()); assert.equal(r[0]._capabilityCheck.udp.status, 'ok'); assert.equal(r[0]._capabilityCheck.http, undefined);
  assert.equal(r[1]._capabilityCheck.http.success, 3); assert.equal(r[1]._capabilityCheck.udp, undefined);
  assert.equal(h.calls.filter(x => x.url.endsWith('/udp')).length, 1);
});
test('invalid checks and options rejected without network', async () => {
  for (const args of [{check:'unknown'}, {check:'http',options:'{'}, {check:'udp',options:'{"udp":{"bogus":1}}'}, {check:'exit',options:'{"exit":{"source":"play"}}'}]) {
    const h = harness(args); await assert.rejects(h.c.operator(input())); assert.equal(h.calls.length, 0);
  }
});
test('explicit check controls legacy UDP and HTTP, but cannot cancel region*', async () => {
  const h = harness({f:'{region*}',check:'',check_udp:true}); const r = await h.c.operator(input());
  assert.ok(r.every(p => p._googleCheck)); assert.ok(r.every(p => !p._capabilityCheck));
});
test('detect takes precedence over check and legacy flags, including empty detect', async () => {
  const h = harness({ f:'{region}', detect:'http', check:'udp', check_udp:true });
  const r = await h.c.operator(input()); assert.ok(r.every(p => p._capabilityCheck.http)); assert.ok(r.every(p => !p._capabilityCheck.udp));
  const empty = harness({ f:'{region*}', detect:'', check:'udp', check_udp:true });
  const result = await empty.c.operator(input()); assert.ok(result.every(p => p._googleCheck)); assert.ok(result.every(p => !p._capabilityCheck));
});
test('detect rejects invalid values even with valid legacy check', async () => {
  const h = harness({ detect:'bad', check:'http' }); await assert.rejects(h.c.operator(input()), /Invalid detect/); assert.equal(h.calls.length, 0);
});
