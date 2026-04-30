---
name: sub-store-diagnostic
description: Sub-Store 诊断 Skill。通过 ssh-tools 连接 NAS 上的 Sub-Store Docker 容器进行诊断：查看日志、检查节点、探测 geo、测试代理延迟。当需要诊断 Sub-Store 节点问题、分析订阅解析、分析代理连通性时调用此 Skill。
allowed-tools:
  - Bash(.claude/skills/ssh-tools/scripts/exec.py nas *)
---

# Sub-Store 诊断

通过 NAS 上的 Docker 容器诊断 Sub-Store。

## 入口

```bash
# 快捷方式
python3 .claude/skills/ssh-tools/scripts/exec.py nas "<command>"
```

## 容器状态

```bash
# 查看容器运行状态
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker ps -a --filter name=sub-store --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

# 实时资源占用
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker stats sub-store --no-stream --format 'cpu={{.CPUPerc}} mem={{.MemUsage}} net={{.NetIO}}'"
```

## 日志诊断

```bash
# 实时跟踪日志（最新 50 行）
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker logs --tail 50 sub-store 2>&1"

# 错误级别日志
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker logs --tail 100 --since 30m sub-store 2>&1 | grep -iE 'error|fail|warn'"

# 指定时间范围日志
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker logs --since '2026-04-30T10:00:00' sub-store 2>&1 | tail -100"
```

## 节点 & 订阅诊断

```bash
# 查看容器内 Sub-Store 数据目录
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker exec sub-store ls -la /app/data/"

# 查看订阅文件
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker exec sub-store find /app/data/subscriptions -type f | head -20"

# 查看解析后的代理节点数
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker exec sub-store find /app/data/proxies -type f | wc -l"
```

## META 代理测试

```bash
# 测试指定节点（替换 proxy json）
python3 .claude/skills/ssh-tools/scripts/exec.py nas 'docker exec sub-store sh -c "curl -X POST http://127.0.0.1:9876/start -H '\''Content-Type: application/json'\'' -d '\''{\"proxies\":[{\"type\":\"vmess\",\"server\":\"93.179.103.179\",\"port\":10038,\"uuid\":\"b4d3be5d-b4e2-4daf-8878-6ba9889b1461\",\"alterId\":0}],\"timeout\":15000}'\''"'

# 通过 META 代理请求目标站，检测 geo 出口
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker exec sub-store sh -c \"curl -s --proxy http://127.0.0.1:65534 'http://ip-api.com/json?lang=zh-CN' --max-time 8000\""

# 查看 META 进程日志
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker exec sub-store cat /tmp/http-meta.*.log 2>/dev/null | tail -30"
```

## 常用测试节点

- VMess: `{"type":"vmess","server":"93.179.103.179","port":10038,"uuid":"b4d3be5d-b4e2-4daf-8878-6ba9889b1461","alterId":0}`
- SS: `{"type":"ss","server":"67.209.184.142","port":10038,"cipher":"aes-256-gcm","password":"xWsZferpKq7DX9Nx"}`

## 网络连通性

```bash
# 在容器内测试 DNS 解析
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker exec sub-store nslookup sub.store 8.8.8.8"

# 测试到目标站点的 TCP 连通性
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker exec sub-store sh -c \"nc -zv host 443 -w 5 && echo OK || echo FAIL\""
```

## 容器内文件操作

```bash
# 上传测试脚本到容器
python3 .claude/skills/ssh-tools/scripts/copy.py nas /tmp/test.js /tmp/test.js
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker cp /tmp/test.js sub-store:/tmp/test.js"

# 从容器下载文件
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker cp sub-store:/app/data/export.json /tmp/sub_store_export.json"
```

## 依赖此 Skill 的 Skills

- （后续按需添加）

---

# Sub-Store + Parser.js 诊断手册

> 2026-04-30 经验总结

## 诊断入口

```bash
# 查看 Sub-Store 日志（推荐）
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker logs --tail 100 sub-store 2>&1"

# 查看 parser.js 日志（带 [PARSER] 前缀）
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker logs --tail 100 sub-store 2>&1 | grep -E '\[PARSER\]'"

# 实时跟踪（中断用 Ctrl+C）
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker logs -f sub-store 2>&1 | grep -E '\[PARSER\]'"
```

## parser.js 当前 CDN 地址

```
https://cdn.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@HEAD/sub-store/scripts/parser.js
```

当前 commit: `e8e5cb9`

## 查看各 Collection 的 Script Operator 配置

```bash
# 列出所有用 parser.js 的 collection 及其参数
python3 .claude/skills/ssh-tools/scripts/exec.py nas 'echo "const fs=require(\"fs\");const d=JSON.parse(fs.readFileSync(\"/opt/app/data/sub-store.json\",\"utf8\"));const c=d.collections||[];c.forEach(x=>{(x.process||[]).forEach(p=>{if(p.type&&p.type.includes(\"Script\")&&p.args&&p.args.content&&p.args.content.includes(\"parser.js\")){console.log(\"=== collection:\",x.name);console.log(\"content:\",p.args.content);console.log(\"fragment:\",(p.args.content||\"\").split(\"#\")[1]||\"\");console.log(\"arguments:\",JSON.stringify(p.args.arguments));console.log();}});});" | docker exec -i sub-store node'

# 查找独立（非 riolu）用 parser.js 的 collection
python3 .claude/skills/ssh-tools/scripts/exec.py nas 'echo "const fs=require(\"fs\");const d=JSON.parse(fs.readFileSync(\"/opt/app/data/sub-store.json\",\"utf8\"));const c=d.collections||[];c.forEach(x=>{if(x.name&&!x.name.includes(\"riolu\")){(x.process||[]).forEach(p=>{if(p.type&&p.type.includes(\"Script\")&&p.args&&p.args.content&&p.args.content.includes(\"parser.js\")){console.log(\"=== collection:\",x.name);console.log(\"content:\",p.args.content);}});}});" | docker exec -i sub-store node'
```

## 关键发现

### $arguments 与 arguments JSON 是两套参数

Sub-Store 里 Script Operator 的配置结构：

```json
{
  "type": "Script Operator",
  "args": {
    "content": "parser.js#c=-&cache=false&f={region}{i:2d}",
    "arguments": { "c": "-", "cache": "false", ... }
  }
}
```

- **URL fragment**（`#` 后面的参数）→ 传给脚本的 `$arguments`
- **arguments JSON**（单独字段）→ 不传给 `$arguments`

**结论：`cache=false` 必须放在 URL fragment 里**，放在 arguments JSON 里脚本读不到。

### collection 与 subscription 的关系

- **collection**：Sub-Store 中的订阅集合（可能包含多个 subscription）
- **subscription**：单个订阅源（可以是普通订阅或组合订阅）
- **parser.js** 配置在 **collection** 层（Script Operator），非 subscription 层
- 子订阅（riolu-1 等）是 **subscription**，它们的 Script Operator 是独立的脚本（usage.js）

### 子订阅失败导致 collection 不走 parser

```
子订阅 502/超时 → collection 认为无节点 → 跳过 parser.js → 直接返回空
```

解决：把子订阅的"失败时作为 empty 处理"选项打开。

### ignoreFailedRemoteSub 配置

- `ignoreFailedRemoteSub: false` → 任一子订阅失败，整体失败
- `ignoreFailedRemoteSub: true` → 子订阅失败不影响整体

## cache 控制

### 参数来源优先级

```
$arguments.cache（URL fragment）
  ↑
  脚本参数: ipinfo_api_token（arguments JSON 或 URL fragment）
  ↑
  环境变量: IPINFO_API_TOKEN（docker-compose.yml）
```

### cache 逻辑（已单元测试）

```javascript
const useCache = ($arguments.cache === undefined) || ($arguments.cache === 'true');
const noCache = !useCache || !scriptCache;
// cache=false  → noCache=true → 跳过缓存强制重新探测
// 不传 cache  → noCache=false → 使用缓存
```

### cache=false 正确配置方式

在 Sub-Store Collection 的 Script Operator URL 中：

```
parser.js#c=-&cache=false&f={region}{i:2d}&s=latency ASC&l=100
```

> 注意：URL 中 `#` 只出现一次，`cache=false` 在 fragment 中，不要被 URL 编码内容截断。

### 单元测试

```bash
cd sub-store/scripts && node parser.test.js
# 28 cases, 0 failures
```

## ipinfo.io API Token

### 配置方式（二选一）

**方式 1：环境变量（推荐，重启容器生效）**

```yaml
# docker-compose.yml
environment:
  - IPINFO_API_TOKEN=your_token_here
```

**方式 2：脚本参数（Sub-Store arguments JSON）**

```json
{ "ipinfo_api_token": "your_token_here" }
```

### 脚本内读取顺序

```javascript
const api_token = $arguments.ipinfo_api_token
    ?? (typeof process !== 'undefined' ? process.env.IPINFO_API_TOKEN : null)
    ?? '';
```

### ipinfo.io vs ip-api.com 响应差异

| 字段 | ip-api.com | ipinfo.io |
|---|---|---|
| 国家码 | `countryCode: "CN"` | `country_code: "CN"` |
| ISP | `isp: "China Mobile"` | `as_name: "China Mobile"` |

parser.js 已内置映射：`country_code → countryCode`，`as_name → isp`

## 常见故障排查

### 1. 日志无 [PARSER] 输出

原因：子订阅全部失败，collection 直接返回空，跳过 parser.js

检查：
```bash
# 看是否有 502/超时错误
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker logs --tail 50 sub-store 2>&1 | grep -E '502|timeout|fail'"
```

解决：把子订阅的"失败时作为 empty"选项打开

### 2. cache=false 不生效

检查步骤：
1. URL 是否为最新 commit：`grep parser.js sub-store.json | grep fe80566`
2. cache 参数是否在 URL fragment 里：`#c=-&cache=false&...`
3. 触发一个有可用节点的 collection（非全 502）

### 3. API 限速（429）

`ip-api.com` 免费版 45 req/min，容易触发限速。

解决：换 ipinfo.io（免费版 50k req/month），配置 `IPINFO_API_TOKEN` 环境变量。

### 4. riolu API 全 502

riolu 订阅提供商的 API 不稳定，此时组合订阅无法工作。

临时方案：在 collection 中删除或禁用有问题的 riolu 子订阅。

## 快速诊断流程

```
1. 抓日志：docker logs --tail 100 sub-store | grep PARSER
2. 无 PARSER → 子订阅全失败 → 查 502/超时
3. 有 PARSER 但 cache=undefined → URL 未更新或 cache 参数位置错误
4. cache=false → noCache=true → 缓存跳过成功
5. 有真实探测结果 → 验证 ipinfo.io 响应格式
```
