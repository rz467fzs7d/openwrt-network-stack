const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(`${__dirname}/enhancer.js`,'utf8');
function run(args,nodes){const c={$arguments:args,$substore:{info(){}}};vm.createContext(c);vm.runInContext(source,c);return c.operator(nodes);}
const nodes=()=>[
 {name:'HK VM',type:'vmess',server:'one.example',port:443,tls:true,network:'ws','ws-opts':{path:'/old',headers:{Host:'old.example'}}},
 {name:'JP SN',type:'snell',server:'two.example',port:443,'obfs-opts':{mode:'http',host:'old.example'}},
 {name:'HK TR',type:'trojan',server:'three.example',port:443,sni:'old.example'},
];
test('default is a no-op including original objects',()=>{const p=nodes();assert.deepEqual(JSON.parse(JSON.stringify(run({},p))),p)});
test('scoped VMess override updates only requested fields and keeps TLS verification',()=>{
 const p=nodes(),r=run({scope:'HK',type:'vmess',host:'new.example',sni:'tls.example',path:'/new',port:8443,suffix:'-test'},p);
 assert.equal(r[0]['ws-opts'].headers.Host,'new.example');assert.equal(r[0]['ws-opts'].path,'/new');assert.equal(r[0].servername,'tls.example');assert.equal(r[0].sni,'tls.example');assert.equal(r[0].port,8443);assert.equal(r[0].name,'HK VM-test');
 assert.equal(r[0]['skip-cert-verify'],undefined);assert.equal(p[0].port,443);assert.equal(r[1].port,443);assert.equal(r[2].port,443);
});
test('Snell host and Trojan SNI use protocol fields',()=>{const r=run({host:'obfs.example',sni:'tls.example'},nodes());assert.equal(r[1]['obfs-opts'].host,'obfs.example');assert.equal(r[2].sni,'tls.example');});
test('invalid input fails before modifying nodes',()=>{const p=nodes();assert.throws(()=>run({scope:'['},p));assert.throws(()=>run({port:70000},p));assert.equal(p[0].port,443)});
test('HTTP and H2 fields preserve array shape and no network defaults are invented',()=>{const p=[{name:'A',type:'vless',server:'x',network:'http','http-opts':{path:['/old'],headers:{Host:['old']}}},{name:'B',type:'vmess',server:'x'}];const r=run({host:'new',path:'/next',method:'POST'},p);assert.deepEqual(JSON.parse(JSON.stringify(r[0]['http-opts'])),{path:['/next'],headers:{Host:['new']},method:'POST'});assert.equal(r[1].network,undefined)});
test('XHTTP download and main connection settings are independent',()=>{
 const p=[{name:'HK X',type:'vless',server:'x',network:'xhttp',tls:true,'xhttp-opts':{host:'main.old',path:'/main','headers':{Host:'main.old'},'download-settings':{host:'down.old',path:'/down',servername:'tls.old',headers:{Host:'down.old'},'skip-cert-verify':false}}}];
 const a=run({download_host:'down.new',download_path:'/new',download_sni:'tls.new'},p)[0];const d=a['xhttp-opts']['download-settings'];
 assert.equal(a['xhttp-opts'].host,'main.old');assert.equal(a['xhttp-opts'].path,'/main');assert.equal(d.host,'down.new');assert.equal(d.headers.Host,'down.new');assert.equal(d.path,'/new');assert.equal(d.servername,'tls.new');assert.equal(d['skip-cert-verify'],false);
 const b=run({host:'main.new'},p)[0];assert.equal(b['xhttp-opts'].host,'main.new');assert.equal(b['xhttp-opts'].headers.Host,'main.new');assert.equal(b['xhttp-opts']['download-settings'].host,'down.old');
 const noDownload={name:'X',type:'vless',network:'xhttp',server:'x'};assert.deepEqual(JSON.parse(JSON.stringify(run({download_host:'x'},[noDownload]))),[noDownload]);
 assert.throws(()=>run({download_path:'invalid'},p));
});
