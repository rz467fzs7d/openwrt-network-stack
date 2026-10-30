const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/parser.js`, 'utf8');
function harness(args = {}, lookup = () => 'US') {
 const calls=[], store=new Map();
 const c={ $arguments:{f:'{region}',probe_all:true,probe_lookup:'mmdb',...args},
   ProxyUtils:{produce:p=>p.map(x=>({...x})),MMDB:class{geoip(ip){return lookup(ip)} ipaso(){return 'TEST ASN'}}},
   scriptResourceCache:{get:k=>store.get(k),set:(k,v)=>store.set(k,v)},
   $substore:{info(){},error(){},wait:async()=>{},http:{
    get:async o=>{calls.push(o);return {status:200,body:'8.8.8.8'}},
    post:async o=>{calls.push(o);return o.url.endsWith('/start')?{body:JSON.stringify({pid:1,ports:[12345]})}:{body:'{}'}}
   }} };
 vm.createContext(c);vm.runInContext(source,c);return {c,calls,store};
}
const input=()=>[{name:'HK-01',type:'ss',server:'8.8.4.4',port:443}];
test('MMDB mode fetches exit IP through node and looks up local country and ASN',async()=>{
 const h=harness();const r=await h.c.operator(input());assert.equal(r[0]._geo.countryCode,'US');assert.equal(r[0]._geo.isp,'TEST ASN');assert.equal(r[0]._geo.query,'8.8.8.8');
 const request=h.calls.find(o=>o.url.includes('ipify'));assert.equal(request.proxy,'http://127.0.0.1:12345');
 assert.ok([...h.store.keys()].some(k=>k.includes(':mmdb:')));await h.c.operator(input());assert.equal(h.calls.filter(o=>o.url.includes('ipify')).length,1);
});
test('MMDB lookup failures do not fallback to entrance or stale identity',async()=>{
 const h=harness({ipinfo_token:'test'},()=>null);const r=await h.c.operator(input());assert.equal(r[0]._geo,undefined);assert.equal(r[0]._failed,true);assert.ok(!h.calls.some(o=>o.url.includes('ipinfo.io')));
});
test('MMDB uses only valid IP response; invalid mode rejects',async()=>{
 const h=harness();h.c.$substore.http.get=async o=>{h.calls.push(o);return {status:200,body:'bad'}};const r=await h.c.operator(input());assert.equal(r[0]._geo,undefined);assert.equal(r[0]._failed,true);
 const invalid=harness({probe_lookup:'invalid'});await assert.rejects(invalid.c.operator(input()),/probe_lookup/);assert.equal(invalid.calls.length,0);
});
