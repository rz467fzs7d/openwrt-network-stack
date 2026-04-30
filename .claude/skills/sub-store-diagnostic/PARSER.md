# Sub-Store Parser.js 诊断手册

> 基于 2026-04-30 调试经验总结

## 快速入口

```bash
# 查看 parser.js 日志（带 [PARSER] 前缀）
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker logs --tail 100 sub-store 2>&1 | grep -E '\[PARSER\]'"

# 查看所有 collection 的 parser.js 配置
python3 .claude/skills/ssh-tools/scripts/exec.py nas 'echo "const fs=require(\"fs\");const d=JSON.parse(fs.readFileSync(\"/opt/app/data/sub-store.json\",\"utf8\"));const c=d.collections||[];c.forEach(x=>{(x.process||[]).forEach(p=>{if(p.type&&p.type.includes(\"Script\")&&p.args&&p.args.content&&p.args.content.includes(\"parser.js\")){console.log(\"=== collection:\",x.name);console.log(\"content:\",p.args.content);console.log(\"fragment:\",(p.args.content||\"\").split(\"#\")[1]||\"\");console.log();}});});" | docker exec -i sub-store node'

# 运行单元测试
cd sub-store/scripts && node parser.test.js
```

## 一、Sub-Store 参数体系

### 1.1 两套参数系统

Sub-Store Script Operator 的配置包含两个独立的参数区域：

```
{
  "type": "Script Operator",
  "args": {
    "content": "parser.js#c=-&cache=false&f={region}",   ← URL fragment
    "arguments": { "c": "-", "cache": "false", ... }   ← arguments JSON
  }
}
```

| 区域 | 传给脚本的方式 | 脚本读取位置 |
|---|---|---|
| URL fragment（`#` 后） | `$arguments` | ✅ 生效 |
| arguments JSON | ❌ 不传给脚本 | ❌ 无效 |

**核心结论：`cache=false` 必须放在 URL fragment 里，放在 arguments JSON 里脚本读不到。**

### 1.2 collection vs subscription

Sub-Store 有两个层级：

- **subscription（订阅）**：单个订阅源 URL（普通订阅或组合订阅）
- **collection（集合）**：包含多个 subscription，配置 Script Operator 的层级

```
collection (Script Operator: parser.js)
  └── subscription: riolu-1 (Script Operator: usage.js)
  └── subscription: riolu-2 (Script Operator: usage.js)
  └── subscription: riolu-3 (Script Operator: usage.js)
```

**`cache=false` 是在 collection 层配置的**，由 parser.js 读取并控制缓存行为。

## 二、cache 控制机制

### 2.1 缓存逻辑

```javascript
// parser.js 中的实现
const useCache = ($arguments.cache === undefined) || ($arguments.cache === 'true');
const noCache = !useCache || !scriptCache;
```

| 参数 | scriptCache 存在 | noCache 结果 | 行为 |
|---|---|---|---|
| 不传 cache | ✅ | `false` | 使用缓存 |
| `cache=true` | ✅ | `false` | 使用缓存 |
| `cache=false` | ✅ | `true` | **跳过缓存，强制重新探测** |
| 不传 cache | ❌ | `true` | 无缓存可用，正常探测 |
| `cache=false` | ❌ | `true` | 正常探测 |

### 2.2 正确配置方式

在 Sub-Store Collection 的 Script Operator 配置中，URL 填写：

```
https://cdn.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@HEAD/sub-store/scripts/parser.js#c=-&cache=false&f={region}{i:2d}&s=latency ASC&l=100
```

> ⚠️ URL 中 `#` 只应出现一次，`cache=false` 在 fragment 中，不要被 URL 编码内容截断。

## 三、子订阅失败导致的假阳性

### 3.1 现象

日志中出现大量 `502 Bad Gateway` 或 `timeout`，parser.js 从未被执行，日志中无 `[PARSER]` 输出。

### 3.2 原因

```
riolu API 全 502
  → 子订阅全部失败
  → collection 认为无节点
  → 跳过 parser.js
  → 直接返回空结果
```

### 3.3 解决

在 Sub-Store 中找到该 collection 的配置，将子订阅的失败处理改为 **"失败时作为 empty 处理"**（而非默认的整体失败）。

同时配置 `ignoreFailedRemoteSub: true`（如果选项存在）。

## 四、ipinfo.io API Token

### 4.1 为什么换 ipinfo.io

`ip-api.com` 免费版限制 **45 requests/min**，并发 10 随便触发 429。

ipinfo.io 免费版 **50,000 requests/month**，足够个人使用。

### 4.2 配置方式（二选一）

**方式 1：环境变量（推荐，重启容器后永久生效）**

```yaml
# docker-compose.yml
environment:
  - IPINFO_API_TOKEN=your_token_here
```

**方式 2：脚本参数（Sub-Store arguments JSON）**

```json
{ "ipinfo_api_token": "your_token_here" }
```

### 4.3 脚本内读取顺序

```javascript
const api_token = $arguments.ipinfo_api_token
    ?? (typeof process !== 'undefined' ? process.env.IPINFO_API_TOKEN : null)
    ?? '';
// 优先级：脚本参数 > 环境变量
```

### 4.4 响应格式差异

| 字段 | ip-api.com | ipinfo.io |
|---|---|---|
| 国家码 | `countryCode: "CN"` | `country_code: "CN"` |
| ISP | `isp: "China Mobile"` | `as_name: "China Mobile"` |

parser.js 已内置自动映射，无需额外配置。

## 五、单元测试

28 个测试用例覆盖所有核心逻辑：

```bash
cd sub-store/scripts && node parser.test.js
```

```
[测试 1] cache 逻辑
  ✅ 不传 cache，应 noCache=false
  ✅ cache=false，应 noCache=true
  ✅ cache=true，应 noCache=false
  ✅ cache=false 但无 scriptCache，应 noCache=true
  ✅ 无 cache 且无 scriptCache，应 noCache=true

[测试 2] api_token 读取
  ✅ 脚本参数优先，应返回 arg-token
  ✅ 无脚本参数，应返回 env-token
  ✅ 脚本参数为空，不 fallback 到 env
  ✅ 参数为 undefined，应 fallback 到 env

[测试 3] ipinfo.io 响应映射
  ✅ country_code → countryCode
  ✅ as_name → isp
  ✅ 已有字段不被覆盖

[测试 5] URL fragment 解析
  ✅ cache=false 解析为字符串 "false"
  ✅ "false" === "false" 在 JS 中为 true

==================================================
结果: 28 通过, 0 失败
==================================================
```

## 六、排查流程

```
Step 1: 抓日志
  docker logs --tail 100 sub-store | grep PARSER

Step 2: 无 [PARSER] 输出
  → 子订阅全失败（502/超时）
  → 检查 riolu API 状态
  → 开启"失败作为 empty"选项

Step 3: 有 [PARSER] 但 cache=undefined
  → parser.js URL 不是最新 commit
  → cache=false 不在 URL fragment 中

Step 4: cache=false 已生效
  → noCache=true → 跳过缓存
  → 查看 META 探测日志
  → 验证 ipinfo.io 响应格式

Step 5: 真实探测延迟验证
  → 对比 ipinfo.io latency 与客户端延迟
  → 检查 countryCode 匹配
```

## 七、相关文件

| 文件 | 说明 |
|---|---|
| `sub-store/scripts/parser.js` | 主脚本，探测+重命名+排序 |
| `sub-store/scripts/parser.test.js` | 单元测试 |
| `sub-store/scripts/usage.js` | 流量统计脚本（与 parser.js 无关） |
| `.claude/skills/sub-store-diagnostic/PARSER.md` | 本文档 |

## 八、当前 CDN 地址

```
https://cdn.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@HEAD/sub-store/scripts/parser.js
```

当前 commit: `57bb40b`
