# Sub-Store 节点格式化脚本

## parser.js

HTTP META 探测 + 重命名 + 排序 + 限流，一次完成。

> 完整参数说明见脚本头部的 JSDoc

### 快速开始

**mode: link**（推荐）：

```
https://fastly.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@0be4c6f/sub-store/scripts/parser.js#f={region}{i:2d}{tag}&c=-&s={region}ASC
```

参数命名规则：按功能分组加前缀（`meta_*` HTTP META 服务、`probe_*` 探测流程、`cache*` 缓存），常用的 `format`/`connector`/`sort`/`debug`/`env` 保留短别名。

常用参数：

| 参数 | 缩写 | 说明 | 默认值 |
|------|------|------|--------|
| `format` | `f` | 格式化模板 | `{region_code}` |
| `connector` | `c` | 占位符连接符 | `-` |
| `sort` | `s` | 排序规则 | 无 |
| `debug` | `d` | 调试日志 | `true` |
| `env` | `e` | 环境变量式注入，格式 `{IPINFO_API_TOKEN:xxx}` | 无 |
| `cache` | - | 使用 Sub-Store 脚本缓存 | `true` |
| `cache_fallback` | - | 探测失败时用节点身份兜底缓存 | `true` |
| `probe_all` | - | 强制对所有节点探测（默认名称可识别 region 时跳过） | `false` |
| `probe_concurrency` | - | 探测并发数 | `10` |
| `probe_retries` | - | 请求重试次数 | `1` |
| `probe_retry_delay` | - | 请求重试间隔(ms) | `1000` |

更多参数（`meta_host`/`meta_port`/`probe_api`/`ipinfo_url`/`ipinfo_token`/`flat`/`debug_node` 等）见脚本头部的 JSDoc。

### Google / YouTube 送中检测（可选）

仅当重命名模板 `f` / `format` 包含 `{region*}` 时执行检测及读取检测缓存。
使用 `{region}`、未设置模板或仅使用 `{exit_is_cn}` 均不触发检测；范围参数仅在启用后生效。

检测方法移植自 RegionRestrictionCheck，来源与许可证见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。不使用普通 GeoIP 国家推断 Google 地区。

| 参数 | 说明 | 默认值 |
| --- | --- | --- |
| `exit_is_cn_check` | 默认按现有名称地区识别检测亚洲地区（含港澳台）；可覆盖为原始节点名正则，忽略大小写；显式空值关闭，`.*` 全量 | 亚洲 |
| `exit_is_cn_check_exclude` | 排除节点名正则，优先于包含范围 | 空 |
| `exit_is_cn_check_timeout` | 每个请求超时，毫秒 | `5000` |
| `exit_is_cn_check_concurrency` | 同时检测的节点数 | `2` |
| `exit_is_cn_check_cache_ttl` | 明确结果缓存时长，毫秒；任一检测未知时最长缓存 10 分钟 | `21600000`（6 小时） |

例如参数：

```text
exit_is_cn_check=JP|日本&exit_is_cn_check_exclude=Office|Local
```

不传 `exit_is_cn_check` 时默认检测亚洲地区（含港澳台、中亚、中东），复用现有名称地区识别（代码、中文名称、旗帜等）。
范围代码见 `GOOGLE_CHECK_ASIA_REGIONS`；不包含俄罗斯、澳大利亚、新西兰、欧洲和美洲地区。
显式传 `exit_is_cn_check=` 关闭；传自定义正则覆盖默认范围，而不是叠加。
匹配对象是进入 parser 的节点名，不是 `{region}` 格式化后的名字。
无匹配时不启动检测。名称已识别国家或已命中 GeoIP 缓存不会跳过该检测。
每个待测节点通过自己的 HTTP META 代理端口访问 YouTube Premium 和 Google Play，
不会切换 OpenClash 的在用节点。额外两次请求可能增加冷缓存刷新耗时。

结果保存在 `_googleCheck.youtube` / `_googleCheck.play`，包含 `status`、`region`、
`reason`；并输出 `[PARSER][GOOGLE]` 日志、缓存来源与检测时间。
YouTube 状态为 `cn`、`available`、`unavailable`、`unknown`；Play 为 `detected` / `unknown`。
保留上游语义：页面包含 `www.google.cn` 标记为 `cn`；Premium 不支持不等于 CN；
无地区但存在上游可用标记时地区为 `UNKNOWN`。HTTP 错误、超时、无有效页面为未知。
Play 原样返回页面地区文字，不强制换算国家码；两者不合并成自行设计的判定。

不会改写原来的节点地区、设置 `_failed` 或删除节点。可选模板占位符：
`{youtube_region}`、`{youtube_status}`、`{google_play_region}`。
未启用或未命中范围时这些占位符为空；默认模板不变。
缓存按节点配置隔离，不使用地区探测的身份兜底缓存；`cache=false` 也关闭这项缓存。
`flat` 派生的其他服务器地址不继承 Google 检测结果。

`{region*}` 返回带送中标记的地区字段：仅当已有 YouTube 结果为 `cn` 时输出 `HK*` 等，
否则仍为 `HK`。Google Play 地区仅供独立诊断，不参与星号判定。作为一个字段正常参与 connector 拼接，
不改变原始 `region_code` 或地区分组编号。例如：

```text
f={prefix:ENET}{region*}{i:2d}{tag:Home=家宽|home}
```

输出 `ENET-HK*-01` 或 `ENET-HK*-01-Home`；未标记节点仍为 `ENET-HK-01`。
使用 `{region*}` 后不应再追加 `{exit_is_cn}`，否则会重复标记。

`{exit_is_cn}` 保留兼容：仅当已有 YouTube 结果为 `cn` 时输出 `*`，
贴附前一个非空命名字段，不额外添加连接符。Premium 页面中的 `ad-free` 文案不是实际无广告验证。
例如 `f={prefix:ENET}{region}{i:2d}{tag:Home=家宽|home}{exit_is_cn}` 输出
`ENET-HK-02*`；正常、未知或未检测时名称不变。此为已有结果的展示，不新增网络检测方法。

测试：`node --test sub-store/scripts/parser.google.test.js`。

### 命名占位符

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

- 名称可识别地区的节点默认跳过探测（`probe_all=true` 可强制全探）
- 探测成功结果会缓存，失败结果不缓存
- 探测失败的节点标记 `_failed=true`，本脚本不移除，交由下游环节处理

清除缓存：在 Sub-Store 设置中操作"刷新"（会调用 `revokeAll`）
