const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/parser.js`, 'utf8');
function harness(args = {}) {
  const calls = [];
  const ctx = { $arguments: { f:'{region}{i:2d}', ...args }, require,
    ProxyUtils: { produce:p=>p.map(x=>({...x})) },
    $substore: { info(){},error(){},wait:async()=>{},http:{
      get:async o=>{calls.push(o);if(o.url.includes('api6.ipify.org'))return {status:200,body:'2001:4860:4860::8888'};if(o.url.includes('__down'))return {status:200,headers:{'content-length':'1024'},body:'x'.repeat(1024)};return {status:204,body:''}},
      post:async o=>{calls.push(o);return o.url.endsWith('/start')?{body:JSON.stringify({pid:7,ports:JSON.parse(o.body).proxies.map((_,i)=>10000+i)})}:{status:200,body:'{}'}}
    }} };
  vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,calls};
}
const nodes=()=>[{name:'HK-01',type:'ss',server:'example.com',port:1},{name:'JP-01',type:'ss',server:'example.com',port:2}];
test('speed and IPv6 are opt-in, independent and preserve nodes',async()=>{
  const h=harness({detect:'ipv6,speed',options:{ipv6:{scope:'HK'},speed:{scope:'JP',bytes:1024}}});const r=await h.ctx.operator(nodes());
  assert.equal(r.length,2);assert.equal(r[0]._capabilityCheck.ipv6.status,'ok');assert.equal(r[0]._capabilityCheck.speed,undefined);
  assert.equal(r[1]._capabilityCheck.speed.status,'ok');assert.ok(r[1]._capabilityCheck.speed.mbps>0);assert.equal(r[1]._capabilityCheck.ipv6,undefined);
});
test('latency sorting keeps missing results last in both directions',()=>{
  const h=harness();const a=[{name:'missing'},{name:'fast',_capabilityCheck:{http:{averageLatencyMs:20}}},{name:'slow',_capabilityCheck:{http:{averageLatencyMs:100}}}];
  assert.deepEqual(Array.from(h.ctx.applySort(a,h.ctx.parseSortRules('http_latency:asc')),p=>p.name),['fast','slow','missing']);
  assert.deepEqual(Array.from(h.ctx.applySort(a,h.ctx.parseSortRules('http_latency:desc')),p=>p.name),['slow','fast','missing']);
});
test('threshold filtering is opt-in and preserves untested nodes', async () => {
  const h=harness({detect:'http',options:{http:{scope:'HK',max_failure_rate:0}}});
  h.ctx.$substore.http.get=async()=>({status:500,body:''});
  const r=await h.ctx.operator(nodes());assert.deepEqual(Array.from(r,p=>p.name),['JP-01']);
});
test('dedupe is opt-in and compares complete connection config', async () => {
  const input=[{name:'HK A',type:'ss',server:'example.com',port:443,password:'a'},{name:'HK B',type:'ss',server:'example.com',port:443,password:'a'},{name:'HK C',type:'ss',server:'example.com',port:443,password:'b'}];
  assert.equal((await harness().ctx.operator(structuredClone(input))).length,3);
  assert.equal((await harness({dedupe:true}).ctx.operator(structuredClone(input))).length,2);
});
