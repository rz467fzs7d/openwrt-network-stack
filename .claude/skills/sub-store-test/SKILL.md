---
name: sub-store-test
description: Sub-Store 测试环境管理。当需要启动/停止 Sub-Store 容器、在容器内测试单个 proxy、通过 META 探测节点 geo 时使用此 skill。
allowed-tools:
  - Bash(docker *)
  - Bash(docker exec *)
  - Bash(docker cp *)
---

# Sub-Store 测试环境

## 启动 Sub-Store

```bash
docker stop sub-store && docker rm sub-store 2>/dev/null
docker run -d --name sub-store -p 3000:3000 -p 3001:3001 xream/sub-store:http-meta
```

## 测试单个 Proxy

在容器内执行 Node.js 脚本测试：

```bash
cat > /tmp/test_proxy.js << 'EOF'
const http = require('http');

const proxy = {
    name: '测试节点',
    type: 'vmess',
    server: '93.179.103.179',
    port: 10038,
    uuid: 'b4d3be5d-b4e2-4daf-8878-6ba9889b1461',
    alterId: 0,
    network: 'tcp'
};

function post(url, body) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = http.request({
            hostname: u.hostname, port: u.port,
            path: u.pathname, method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, res => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { resolve({ error: data }); }
            });
        });
        req.on('error', reject);
        req.write(JSON.stringify(body));
        req.end();
    });
}

async function test() {
    console.log('启动 META...');
    const start = await post('http://127.0.0.1:9876/start', { proxies: [proxy], timeout: 15000 });
    console.log('结果:', JSON.stringify(start));

    if (!start.pid || !start.ports) {
        console.log('启动失败!');
        return;
    }

    const port = start.ports[0];
    console.log('分配端口:', port, '- 等待 5 秒...');

    await new Promise(r => setTimeout(r, 5000));

    console.log('发送测试请求...');
    const result = await new Promise((resolve) => {
        const req = http.request({
            hostname: '127.0.0.1', port,
            path: '/', method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        }, res => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', e => resolve({ error: e.message }));
        req.end();
    });

    console.log('状态:', result.status);
    console.log('响应:', result.body ? result.body.substring(0, 300) : result.error);
}

test().catch(e => console.error('错误:', e.message));
EOF

docker cp /tmp/test_proxy.js sub-store:/tmp/test_proxy.js
docker exec sub-store node /tmp/test_proxy.js
```

修改 `proxy` 对象内容测试不同节点。

## 常用测试节点

- SS: `{"type":"ss","server":"67.209.184.142","port":10038,"cipher":"aes-256-gcm","password":"xWsZferpKq7DX9Nx"}`
- VMess: `{"type":"vmess","server":"93.179.103.179","port":10038,"uuid":"b4d3be5d-b4e2-4daf-8878-6ba9889b1461","alterId":0,"network":"tcp"}`

## 快速测试 META

```bash
# 启动 META
docker exec sub-store curl -X POST http://127.0.0.1:9876/start \
  -H 'Content-Type: application/json' \
  -d '{"proxies":[{"type":"vmess","server":"93.179.103.179","port":10038,"uuid":"xxx","alterId":0}],"timeout":15000}'

# 测试代理端口
docker exec sub-store sh -c "curl -s --proxy http://127.0.0.1:65534 'http://ip-api.com/json?lang=zh-CN' --max-time 8000"

# 查看 META 日志
docker exec sub-store cat /tmp/http-meta.*.log 2>/dev/null | tail -20
```

## 停止服务

```bash
docker stop sub-store && docker rm sub-store
```