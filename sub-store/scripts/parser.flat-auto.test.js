const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/parser.js`, 'utf8');
function harness(args = {}, resolve = async () => ({answers:[{type:'A',data:'8.8.8.8'},{type:'A',data:'1.1.1.1'},{type:'A',data:'8.8.8.8'}]})) {
 const calls=[]; const c={ $arguments:{f:'{region}{i:2d}', ...args}, require,
   ProxyUtils:{produce:p=>p.map(x=>({...x})),doh:async o=>{calls.push(o);return resolve(o)}},
   $substore:{info(){},error(){},wait:async()=>{},http:{get:async()=>({status:200,body:''}),post:async()=>({body:'{}'})}} };
 vm.createContext(c);vm.runInContext(source,c);return {c,calls};
}
const node=()=>({name:'HK-01',type:'trojan',server:'node.example.com',port:443,password:'x',tls:true});
test('automatic DNS fission is opt-in and retains original TLS identity',async()=>{
 const off=harness();assert.equal((await off.c.operator([node()])).length,1);assert.equal(off.calls.length,0);
 const h=harness({flat:'auto'});const r=await h.c.operator([node()]);assert.equal(r.length,3);assert.equal(r[0].server,'node.example.com');
 assert.equal(r[1].server,'8.8.8.8');assert.equal(r[1].sni,'node.example.com');assert.equal(r[1].servername,'node.example.com');
 assert.equal(r[2].server,'1.1.1.1');assert.equal(h.calls.length,1);
});
test('existing SNI is preserved and DNS failure leaves only original',async()=>{
 const h=harness({flat:'auto'});const n={...node(),sni:'explicit.example',servername:'explicit.example'};
 const r=await h.c.operator([n]);assert.equal(r[1].sni,'explicit.example');assert.equal(r[1].servername,'explicit.example');
 const bad=harness({flat:'auto'},async()=>{throw Error('timeout')});assert.equal((await bad.c.operator([node()])).length,1);
});
test('private and fake DNS results do not create derived nodes',async()=>{
 const h=harness({flat:'auto'},async()=>({answers:[{type:'A',data:'198.18.1.2'},{type:'A',data:'192.168.1.2'}]}));
 assert.equal((await h.c.operator([node()])).length,1);
});
test('websocket host is retained and unsupported transports are not resolved',async()=>{
 const h=harness({flat:'auto'});const ws={...node(),network:'ws','ws-opts':{path:'/ws'}};
 const r=await h.c.operator([ws]);assert.equal(r[1]['ws-opts'].headers.Host,'node.example.com');
 const h2=harness({flat:'auto'});const grpc={...node(),network:'grpc'};
 assert.equal((await h2.c.operator([grpc])).length,1);assert.equal(h2.calls.length,0);
});
test('DNS timeout keeps original node',async()=>{
 const h=harness({flat:'auto',flat_dns_timeout:5},()=>new Promise(()=>{}));
 assert.equal((await h.c.operator([node()])).length,1);
});
