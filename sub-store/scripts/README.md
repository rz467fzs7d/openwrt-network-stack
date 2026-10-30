# Sub-Store 节点格式化脚本

## parser.js

HTTP META 探测 + 重命名 + 排序 + 限流，一次完成。

> 完整参数说明见脚本头部的 JSDoc

### 快速开始

**mode: link**（推荐）：

```
https://fastly.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@b5191b1/sub-store/scripts/parser.js#f={region}{i:2d}{tag}&c=-&s={region}ASC
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

### 可选能力检测

UDP、HTTP、GPT、入口、出口、IPv6 和测速默认关闭；使用 `detect=udp,http,exit,gpt,entrance,ipv6,speed` 按需启用。模板含 `{region*}` 时仍会自动触发出口检测。默认不会删除节点或设置 `_failed`。

`options` 是 JSON 对象，按检测类型设置原始节点名的正则范围及选项，例如：

```json
{"exit":{"scope":"HK|MO|TW"},"udp":{"scope":"HK"},"http":{"scope":"JP","samples":3}}
```

各类型均支持 `scope`、`exclude`、`timeout`；`exit` 还支持 `source`、`concurrency`、`cache_ttl`，`udp` 支持 `ntp`，`http` 支持 `samples`、`url`、`status`，`gpt` 支持 `client`（`ios` 或 `android`）。`check` 为兼容别名，两者同时设置时以 `detect` 为准，即使 `detect` 为空；都不设置时才使用旧的 `check_udp` / `check_http`。`{region*}` 仍会独立触发出口检测。

`ipv6` 通过节点访问 IPv6 专用服务，成功时 `_capabilityCheck.ipv6` 返回出口 IPv6；失败是 `unknown`，不等于不支持。`speed` 从 Cloudflare 下载测试数据，`options.speed.bytes` 默认 1048576，最多 10485760 字节，单节点依次测速；记录 `_capabilityCheck.speed.mbps`，结果受测试目标和时间影响。测速消耗流量，默认关闭。

`sort=http_latency:asc` 或 `sort=speed:desc` 可按 HTTP 平均耗时、测速结果排序，没有结果的节点始终排在最后。显式配置 `options.http.max_latency`（毫秒）或 `options.http.max_failure_rate`（百分比）才按阈值剔除已有结果的节点；没有结果的节点保留。可通过 `{entrance_region}` / `{entrance_isp}` 和 `{exit_region}` / `{exit_isp}` 组合展示入口与落地；落地字段依赖实际地区探测，需要时设置 `probe_all=true`，不会把节点名称推断当作实测出口。

`dedupe=true` 可按完整连接配置去重，仅保留第一项，默认关闭；密码、SNI 等连接配置不同不会合并。节点名不同但连接配置相同的节点会合并。

`gpt` 仅探测对应客户端入口，返回 `_capabilityCheck.gpt`：`reachable` 表示收到可识别的未认证响应，`unsupported` 表示地区不支持，其他结果为 `unknown`，不保证登录或对话成功。`entrance` 解析服务器域名后查询公开 IP 的国家和运营商，结果写入 `_entrance`，不更改服务器地址；会将公网入口 IP 发送给 ip-api.com，内网地址不查询。DNS 和数据库结果可能与客户端实际连接路径不同。

HTTP 成功样本的平均耗时记录在 `_capabilityCheck.http.averageLatencyMs`；`{http_latency}`、`{gpt_status}`、`{entrance_region}`、`{entrance_isp}` 可用于格式模板。未指定 `format` 时，成功的检测结果自动追加到默认名称：UDP 为 `UDP`、GPT 入口为 `GPT`、入口为地区代码、HTTP 为毫秒数，确认送中则在地区后附加 `*`。未知或失败不显示；指定 `format` 后完全由模板控制。

以下旧参数仍可使用：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `check_udp` | `false` | 经节点通过 HTTP META 测试 NTP UDP |
| `check_http` | `false` | 经节点测试 HTTP 请求 |
| `check_samples` | `1` | HTTP 请求次数，最大 20；多次时计算请求失败率 |
| `check_scope` / `check_exclude` | `.*` / 空 | 检测范围 / 排除规则 |
| `check_timeout` / `check_concurrency` | `5000` / `2` | 单请求毫秒 / 并发节点数 |
| `check_ntp` | `time.apple.com` | NTP 目标 |
| `check_url` / `check_status` | Cloudflare 204 / `204` | HTTP 目标及预期状态码 |
| `check_cache_ttl` | `21600000` | 成功缓存毫秒；不完整结果最多缓存 10 分钟，`cache=false` 关闭 |

结果在 `_capabilityCheck.udp` 与 `_capabilityCheck.http`：UDP 为 `ok` / `unknown`；HTTP 包含状态、成功数、失败数、采样次数及 `failureRate`。该百分比是对指定 URL 的**请求失败率**，不是网络层丢包率。`{udp_status}`、`{http_status}`、`{http_failure_rate}` 可选用于命名；未检测时为空。flat 派生的新地址不继承结果。

例如：`check_udp=true&check_http=true&check_scope=HK&check_samples=3`。结果依赖测试时间、目标及路径；UDP 失败不能证明所有 UDP 不可用。HTTP META UDP 接口参考 [上游脚本](https://github.com/xream/scripts/blob/main/surge/modules/sub-store-scripts/check/http_meta_udp.js)，NTP 参数独立读取 `check_ntp`。

### Google / YouTube 送中检测（可选）

当重命名模板 `f` / `format` 包含 `{region*}` 或 `detect` 包含 `exit` 时执行检测及读取检测缓存。
仅使用 `{region}`、未设置模板或仅使用 `{exit_is_cn}` 均不触发检测；范围参数仅在启用后生效。

检测方法移植自 RegionRestrictionCheck，来源与许可证见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。不使用普通 GeoIP 国家推断 Google 地区。

| 参数 | 说明 | 默认值 |
| --- | --- | --- |
| `exit_is_cn_check` | 默认按现有名称地区识别检测亚洲地区（含港澳台）；可覆盖为原始节点名正则，忽略大小写；显式空值关闭，`.*` 全量 | 亚洲 |
| `exit_is_cn_check_exclude` | 排除节点名正则，优先于包含范围 | 空 |
| `exit_is_cn_check_timeout` | 每个请求超时，毫秒 | `5000` |
| `exit_is_cn_check_concurrency` | 同时检测的节点数 | `2` |
| `exit_is_cn_check_cache_ttl` | 每项明确结果独立缓存时长，毫秒；该项未知时最长 10 分钟，META 启动失败最长 1 分钟 | `21600000`（6 小时） |

例如参数：

```text
exit_is_cn_check=JP|日本&exit_is_cn_check_exclude=Office|Local
```

不传 `exit_is_cn_check` 时默认检测亚洲地区（含港澳台、中亚、中东），复用现有名称地区识别（代码、中文名称、旗帜等）。
范围代码见 `GOOGLE_CHECK_ASIA_REGIONS`；不包含俄罗斯、澳大利亚、新西兰、欧洲和美洲地区。
显式传 `exit_is_cn_check=` 关闭；传自定义正则覆盖默认范围，而不是叠加。
匹配对象是进入 parser 的节点名，不是 `{region}` 格式化后的名字。
无匹配时不启动检测。名称已识别国家或已命中 GeoIP 缓存不会跳过该检测。
每个待测节点通过自己的 HTTP META 代理端口访问 Google 条款页面，提取英文地区版本；`China` 标记为 `cn`。
设置 `options={"exit":{"source":"youtube"}}` 可切换至 YouTube Premium；默认值为 `terms`。
Google Play 检测及 `{google_play_region}` 已移除。
不会切换 OpenClash 的在用节点。默认每个待测节点仅增加一次请求。

结果按来源保存在 `_googleCheck.terms` 或 `_googleCheck.youtube`，包含 `status`、`region`、
`reason`；并输出 `[PARSER][GOOGLE]` 日志、缓存来源与检测时间。
条款地区状态为 `cn`、`available` 或 `unknown`；YouTube 还可能是 `unavailable`。
两种来源使用独立缓存，切换来源不会复用旧结果。日志包含来源和待请求数量；`cache=false` 可绕过缓存。

同次执行中，只有名称或内部元数据不同、其余连接配置完全一致的待测节点，共用临时核心端口及服务请求；输出节点、名称与检测范围仍各自保留。密码、协议、SNI、嵌套选项及数组顺序均参与比较，不按服务器 IP 简单合并。缓存仍按各节点原有键保存，不跨调用共享进行中的请求；GeoIP 身份兜底逻辑不变。

YouTube 请求不携带固定 Cookie，避免会话偏好掩盖地区特征。此修复使用新的检测缓存版本，不复用旧 Cookie 检测结果；其他缓存与 TTL 不变。
保留上游语义：页面包含 `www.google.cn` 标记为 `cn`；Premium 不支持不等于 CN；
无地区但存在上游可用标记时地区为 `UNKNOWN`。HTTP 错误、超时、无有效页面为未知。
条款地区原样返回页面地区文字，不强制换算国家码；两种来源的结果互不混用。

不会改写原来的节点地区、设置 `_failed` 或删除节点。可选模板占位符：
`{youtube_region}`、`{youtube_status}`、`{terms_region}`。
未启用或未命中范围时这些占位符为空；默认模板不变。
缓存按节点配置隔离，不使用地区探测的身份兜底缓存；`cache=false` 也关闭这项缓存。
`flat` 派生的其他服务器地址不继承 Google 检测结果或计算出的星号；模板中的字面量星号保留。

`{region*}` 返回带送中标记的地区字段：仅当选定来源的结果为 `cn` 时输出 `HK*` 等，
否则仍为 `HK`。作为一个字段正常参与 connector 拼接，
不改变原始 `region_code` 或地区分组编号。例如：

```text
f={prefix:ENET}{region*}{i:2d}{tag:Home=家宽|home}
```

输出 `ENET-HK*-01` 或 `ENET-HK*-01-Home`；未标记节点仍为 `ENET-HK-01`。
使用 `{region*}` 后不应再追加 `{exit_is_cn}`，否则会重复标记。

`{exit_is_cn}` 保留兼容：仅当选定来源的结果为 `cn` 时输出 `*`，
贴附前一个非空命名字段，不额外添加连接符。Premium 页面中的 `ad-free` 文案不是实际无广告验证。
例如 `f={prefix:ENET}{region}{i:2d}{tag:Home=家宽|home}{exit_is_cn}` 输出
`ENET-HK-02*`；正常、未知或未检测时名称不变。此为已有结果的展示，不新增网络检测方法。

测试：`node --test sub-store/scripts/parser.google.test.js`。

### 名称识别缓存

名称到地区的缓存最多保留 10,000 条，超过时按插入顺序淘汰最早条目；命中不会重排或单独触发持久化写入。加载旧缓存时会自动收敛到该上限。淘汰只会使名称下次重新识别，不改变识别规则或输出；原有缓存有效期不变。

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
