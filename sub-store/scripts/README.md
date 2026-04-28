# Sub-Store 节点格式化脚本

## node-formater.js

HTTP META 探测 + 重命名 + 排序 + 限流，一次完成。

> 完整参数说明见脚本头部的 JSDoc

### 快速开始

**mode: link**（推荐）：

```
https://fastly.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@16fc05c/sub-store/scripts/node-formater.js#f={region}{i:2d}{tag}&c=-&s={region}ASC&t=800&l=20
```

参数含义：

| 参数 | 缩写 | 说明 | 默认值 |
|------|------|------|--------|
| `format` | `f` | 格式化模板 | `{region_code} {isp_code}` |
| `connector` | `c` | 占位符连接符 | ` ` (空格) |
| `sort` | `s` | 排序规则 | 无 |
| `timeout` | `t` | 单节点超时(ms)，超过丢弃 | `1000` |
| `limit` | `l` | 限制返回数量 | `0` (不限制) |
| `remove_failed` | - | 移除探测失败的节点 | `true` |
| `concurrency` | - | 探测并发数 | `10` |

### 占位符

| 占位符 | 说明 |
|--------|------|
| `{region}` / `{region_code}` | 地区代码，如 HK、TW、JP |
| `{region_flag}` | 国旗 emoji，如 🇭🇰 |
| `{region_name}` / `{region_name_cn}` | 英文/中文地区名 |
| `{isp_code}` / `{isp_name}` | 运营商代码/名称 |
| `{tag}` | 自动检测的标签（IPLC、UDPN、HOME） |
| `{tag:XXX}` | 动态检测，名称含 XXX 时输出 XXX |
| `{index:2d}` / `{i:2d}` | 地区内序号，补零格式化 |
| `{latency}` | 探测延迟 |
| `{original}` | 原始名称 |

### 格式化示例

```
f={region}{i:2d}{tag}&c=-   →  HK-01-IPLC, SG-02-UDPN
f={region_flag} {region}&c=  →  🇭🇰HK, 🇯🇵JP
f={region}-{i:02d}&c=-        →  HK-01, JP-02
```

### 排序示例

```
s={region}ASC                        按地区升序（HK → JP → SG）
s={tag(IPLC)}DESC                     IPLC 节点优先
s={region}ASC,{tag(IPLC)}DESC,{i}ASC  地区 > 标签 > 序号
s={region}(HK,JP,SG)ASC,{i}ASC        指定地区优先顺序
```

### 缓存策略

- 探测结果缓存 **10 分钟**（由 Sub-Store 资源缓存控制）
- 缓存命中时，用当前 `timeout` 参数重新比较：
  - `latency <= timeout` → 通过
  - `latency > timeout` → 丢弃（不重新探测）

清除缓存：在 Sub-Store 设置中操作"刷新"（会调用 `revokeAll`）
