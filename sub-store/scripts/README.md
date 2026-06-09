# Sub-Store 节点格式化脚本

## node-formater.js

HTTP META 探测 + 重命名 + 排序 + 限流，一次完成。

> 完整参数说明见脚本头部的 JSDoc

### 快速开始

**mode: link**（推荐）：

```
https://fastly.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@16fc05c/sub-store/scripts/node-formater.js#f={region}{i:2d}{tag}&c=-&s={region}ASC&l=20
```

参数含义：

| 参数 | 缩写 | 说明 | 默认值 |
|------|------|------|--------|
| `format` | `f` | 格式化模板 | `{region_code}` |
| `connector` | `c` | 占位符连接符 | `-` |
| `sort` | `s` | 排序规则 | 无 |
| `limit` | `l` | 限制返回数量 | `0` (不限制) |
| `remove_failed` | - | 移除探测失败的节点 | `true` |
| `concurrency` | - | 探测并发数 | `10` |
| `probe_retries` | - | META geo 探测重试次数 | `2` |
| `probe_retry_delay` | - | META geo 探测重试间隔(ms) | `1000` |

### 占位符

| 占位符 | 说明 |
|--------|------|
| `{region}` / `{region_code}` | 地区代码，如 HK、TW、JP |
| `{region_flag}` | 国旗 emoji，如 🇭🇰 |
| `{region_name}` / `{region_name_cn}` | 英文/中文地区名 |
| `{tag}` | 自动检测的标签（IPLC、UDPN、HOME） |
| `{tag:XXX}` | 动态检测，名称含 XXX 时输出 XXX |
| `{tag:输出=关键词1\|关键词2}` | 自定义匹配规则，命中后输出指定内容 |
| `{index:2d}` / `{i:2d}` | 地区内序号，补零格式化 |
| `{latency}` | 探测延迟 |
| `{original}` | 原始名称 |

### 格式化示例

```
f={region}{i:2d}{tag}&c=-   →  HK-01-IPLC, SG-02-UDPN
f={region_flag} {region}&c=  →  🇭🇰HK, 🇯🇵JP
f={region}-{i:02d}&c=-        →  HK-01, JP-02
f={region}{i:2d}{tag:Home=家宽|home}&c=-  →  JP-01-Home
```

### 排序示例

```
s=region:HK,SG,JP:asc|index:asc       指定地区优先顺序，再按序号
s=tag:Plus:desc|index:asc             原始名称含 Plus 的节点优先
s=has_tag:desc|index:asc              有主标签（IPLC/UDPN/HOME）的节点优先
s=region:HK,SG,JP:asc|tag:Plus:desc|index:asc
```

### 探测策略

- 能从节点名称识别地区时跳过 META 探测
- 名称无法识别地区时才进行 META 探测
- META geo 探测默认额外重试 2 次
- 探测失败节点默认移除；本轮探测未返回不作为延迟筛选条件
- 探测结果缓存由 Sub-Store 资源缓存控制

清除缓存：在 Sub-Store 设置中操作"刷新"（会调用 `revokeAll`）
