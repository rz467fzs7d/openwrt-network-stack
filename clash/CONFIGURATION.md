# OpenClash / Mihomo 配置指南

Mihomo (Clash Meta) 配置模板的使用说明，包含代理组、DNS、规则等完整配置。

> 💡 **安装方法**: 查看 [INSTALLATION.md](INSTALLATION.md) 了解如何安装 OpenClash/Mihomo
> 💡 **部署流程**: 查看 [DEPLOYMENT-GUIDE.md](../DEPLOYMENT-GUIDE.md) 了解完整的网络栈集成

## 目录

- [配置文件说明](#配置文件说明)
- [配置模板特性](#配置模板特性)
- [必须修改的部分](#必须修改的部分)
- [进阶配置](#进阶配置)
- [节点筛选关键词](#节点筛选关键词)
- [故障排查](#故障排查)

---

## 配置文件说明

### 文件位置

- **OpenClash**: `/etc/openclash/config.yaml`
- **Mihomo**: `/etc/mihomo/config.yaml`

### 配置模板文件

- `config/config-mihomo.yaml.example` - 完整配置模板
- `rules/direct.yaml` - 自定义直连规则
- `rules/proxy.yaml` - 自定义代理规则

### 下载配置模板

```bash
# OpenClash
cd /etc/openclash
wget https://cdn.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@main/clash/config/config-mihomo.yaml.example -O config.yaml

# Mihomo
cd /etc/mihomo
wget https://cdn.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@main/clash/config/config-mihomo.yaml.example -O config.yaml
```

---

## 配置模板特性

### 1. 模块化设计（YAML 锚点）

使用 YAML 锚点实现配置复用：

```yaml
# 定义模板
x-templates:
  proxy-group: &PROXY_GROUP_BASE
    type: select
    interval: 60
    lazy: true

# 复用模板
proxy-groups:
  - { name: Hong Kong, <<: *PROXY_GROUP_BASE, filter: "HK" }
```

### 2. 智能路由策略 (Smart Group)

基于机器学习自动选择最优节点：

```yaml
- name: Smart
  type: smart
  proxies: [Hong Kong, Taiwan, Japan, United States, Singapore]
  policy-priority: "Hong Kong:1.5;Others:0.5"
  prefer-asn: true      # 优先 ASN 质量
  uselightgbm: true     # 使用 LightGBM 模型
  collectdata: true     # 收集性能数据
```

### 3. 地区节点自动选择

- **URL Test 组**: 基于延迟自动选择最快节点
- **Fallback 组**: 故障自动转移（适合 IPLC）

### 4. 分应用代理策略

| 应用 | 默认策略 | 适用场景 |
|------|---------|---------|
| AI Services | Smart | OpenAI, Claude, Gemini |
| YouTube | Smart | 流媒体 |
| GitHub | Smart | 代码托管 |
| Apple Services | DIRECT | App Store, iCloud |

### 5. 完善的 DNS 配置

- **Fake-IP 模式**: 加速解析，减少泄漏
- **DoH 加密**: 防 DNS 污染
- **分层架构**: 引导 DNS + 主 DNS + 备用 DNS

### 6. 代码折叠标记

使用 `# region` / `# endregion` 实现代码折叠：

```yaml
# region YAML 锚点
x-templates:
  ...
# endregion
```

支持 VS Code、JetBrains IDE 等编辑器。

---

## 必须修改的部分

### 1. 修改订阅地址

找到 `proxy-providers` 部分：

```yaml
proxy-providers:
  Provider1:
    type: http
    url: "http://127.0.0.1:3001/backend/download/Sub%2001"  # ← 修改这里
    interval: 600
    path: ./proxy-providers/provider1.yaml
    health-check:
      enable: true
      url: http://www.gstatic.com/generate_204
      interval: 300
```

**推荐**: 使用 Sub-Store 管理订阅
- Sub-Store 地址: `http://127.0.0.1:3001`
- 参考: [sub-store/README.md](../sub-store/README.md)

### 2. 内网 IP 段（可选）

如需通过特定节点访问内网：

```yaml
rules:
  # 内网 IP 段
  - IP-CIDR,10.0.0.0/8,Office,no-resolve
  - IP-CIDR,192.168.x.0/24,Office,no-resolve
```

### 3. 内网域名（可选）

```yaml
rules:
  # 内网域名
  - DOMAIN-SUFFIX,company.internal,Office
  - DOMAIN-SUFFIX,git.company.com,Office
  - DOMAIN-KEYWORD,internal-service,Office

sniffer:
  skip-domain:
    # 跳过内网域名嗅探
    - "company.internal"
    - "intranet.company.com"
```

### 4. 自定义规则（可选）

引用本项目的自定义规则：

```yaml
rule-providers:
  CUSTOM-DIRECT:
    <<: *RULE_PROVIDER_BASE
    url: "https://cdn.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@main/clash/rules/direct.yaml"
    path: ./rule-providers/custom-direct.yaml

  CUSTOM-PROXY:
    <<: *RULE_PROVIDER_BASE
    url: "https://cdn.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@main/clash/rules/proxy.yaml"
    path: ./rule-providers/custom-proxy.yaml

rules:
  - RULE-SET,CUSTOM-DIRECT,DIRECT
  - RULE-SET,CUSTOM-PROXY,PROXY
```

**自定义规则**: Fork 本仓库后修改 `clash/rules/*.yaml`，然后更新 URL。

详见: [rules/README.md](rules/README.md)

### 5. OpenClash 绕过黑名单（可选）

如果启用了 OpenClash "绕过中国大陆" 功能，需配置绕过黑名单。

**适用场景**:
- Google Play 更新
- 内网域名访问
- AdGuard DNS

**配置方法**:

1. OpenWrt UI: `OpenClash → 全局设置 → 流量控制 → 绕过指定区域 IPv4 黑名单`
2. 或 SSH 编辑: `/etc/openclash/custom/openclash_custom_chnroute_pass.list`

**示例**:
```
# Google Play
services.googleapis.cn
googleapis.cn

# 内网
company.internal
192.168.x.0/24

# AdGuard DNS
adguard-dns.com
dns.adguard.com
```

详见: [rules/README.md#openclash-绕过黑名单](rules/README.md#-openclash-绕过黑名单bypass-blacklist)

---

## 验证配置

### 检查语法

```bash
# OpenClash (通过 Web 界面)
# 服务 → OpenClash → 配置文件管理 → 配置文件检查

# Mihomo (命令行)
mihomo -t -d /etc/mihomo
```

成功输出: `configuration file test is successful`

### 常见错误

- YAML 缩进错误（必须用空格，不能用 Tab）
- 锚点引用错误
- 引号不匹配
- 订阅 URL 无效

---

## 进阶配置

### 调整超时参数

默认超时 300ms 可能过严，根据网络情况调整：

```yaml
# Proxy Provider 健康检查
proxy-providers:
  Provider1:
    health-check:
      timeout: 5000  # 改为 5 秒（适合 Sub-Store）

# URL Test 组
url-test-group: &URL_TEST_GROUP_BASE
  timeout: 3000  # 改为 3 秒

# Fallback 组
fallback-group: &FALLBACK_GROUP_BASE
  fallback-filter:
    timeout: 2000  # 改为 2 秒
```

### 添加新地区节点组

```yaml
# 1. 定义关键词
x-keywords:
  korea: &KOREA_KEYWORDS "韩国|KR|korea|seoul"

# 2. 添加代理组
proxy-groups:
  - { name: Korea, <<: *URL_TEST_GROUP_BASE, filter: *KOREA_KEYWORDS }

# 3. 添加到 Smart 组
  - name: Smart
    proxies: [Hong Kong, Taiwan, Japan, Korea, ...]
```

### 添加新应用策略

```yaml
# 1. 添加规则提供者
rule-providers:
  Reddit:
    <<: *RULE_PROVIDER_BASE
    url: "https://fastly.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/Reddit/Reddit.yaml"
    path: ./rule-providers/reddit.yaml

# 2. 添加代理组
proxy-groups:
  - { name: Reddit, <<: *APPLICATION_POLICY_BASE }

# 3. 添加路由规则
rules:
  - RULE-SET,Reddit,Reddit
```

### 禁用 Smart Group

如不想使用机器学习：

```yaml
# 方式 1: 改为 Hong Kong 优先
application-policy: &APPLICATION_POLICY_BASE
  proxies:
    - Hong Kong  # 改为固定地区
    - Taiwan
    - Japan

# 方式 2: 删除 Smart 组相关配置
```

---

## 节点筛选关键词

配置模板使用以下关键词筛选节点：

### 地区关键词

| 地区 | 关键词 |
|------|--------|
| 香港 | 香港、HK、hongkong、hong kong |
| 台湾 | 台湾、TW、taiwan |
| 日本 | 日本、JP、japan、tokyo、东京、osaka、大阪 |
| 美国 | 美国、US、unitedstates、united states、seattle、los angeles |
| 新加坡 | 新加坡、SG、singapore |
| 韩国 | 韩国、南韩、KR、korea、seoul、首尔 |
| 英国 | 英国、UK、GB、united kingdom、britain、london、伦敦 |
| 德国 | 德国、DE、germany、frankfurt、法兰克福 |

### 特殊用途关键词

| 类型 | 关键词 |
|------|--------|
| IPLC | IPLC |
| 游戏 | game、Game、游戏 |
| 办公 | Office |

### 使用示例

```yaml
proxy-groups:
  # 筛选香港节点
  - name: Hong Kong
    type: url-test
    filter: "香港|HK|hongkong|hong kong"

  # 筛选 IPLC 专线
  - name: IPLC
    type: select
    filter: "IPLC"
```

---

## 故障排查

### Q: 订阅无法更新

**检查 Sub-Store**:
```bash
curl http://127.0.0.1:3001/api/health
```

**检查订阅 URL**:
```bash
curl -I "your-subscription-url"
```

### Q: 节点无法连接

**检查日志**:
```bash
# OpenClash
logread | grep clash | tail -50

# Mihomo
journalctl -u mihomo -f
```

**常见原因**:
- 订阅链接过期
- 防火墙阻止
- 配置文件错误

### Q: DNS 解析异常

**测试 DoH**:
```bash
curl -H 'accept: application/dns-json' 'https://dns.alidns.com/resolve?name=google.com'
```

**查看 DNS 缓存**:
```bash
curl http://127.0.0.1:9090/dns/cache
```

### Q: 规则集无法更新

**手动更新**:
```bash
# 删除缓存
rm -rf /etc/mihomo/rule-providers/*

# 重启服务
/etc/init.d/openclash restart
# 或
/etc/init.d/mihomo restart
```

**检查规则集 URL**:
```bash
wget -O /dev/null "https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/China/China.yaml"
```

---

## 相关文档

- [INSTALLATION.md](INSTALLATION.md) - 安装指南
- [rules/README.md](rules/README.md) - 自定义规则说明
- [Mihomo 官方文档](https://wiki.metacubex.one/)
- [Clash 规则集项目](https://github.com/blackmatrix7/ios_rule_script)
- [GeoIP 数据源](https://github.com/MetaCubeX/meta-rules-dat)

---

## 常见问题

**Q: 为什么选择 Mihomo？**

A: Mihomo (Clash Meta) 是 Clash 的增强版本：
- Smart Group 智能选择
- 更强大的规则引擎
- 更好的性能优化
- 持续更新维护

**Q: 如何更新规则集？**

A: 规则集根据 `interval` 自动更新（默认 24 小时）。手动更新见上方故障排查。

**Q: Sub-Store 是必需的吗？**

A: 不是必需的，但推荐使用：
- 强大的节点过滤
- 节点重命名脚本
- 订阅转换

**Q: 配置占用多少资源？**

A: OpenWrt 上：
- 内存: 约 50-100MB
- CPU: 空闲 < 1%，转发流量 5-15%
- 推荐: 至少 256MB RAM

## DNS 配置详解

### DNS 架构设计

```
设备 → AdGuard Home (192.168.0.1:53) → OpenClash (127.0.0.1:7874) → 上游 DNS
         ↓
    广告拦截/过滤
         ↓
    转发到 OpenClash
```

### 核心配置

```yaml
dns:
  enable: true
  ipv6: true
  enhanced-mode: redir-host
  respect-rules: true
  cache: true
  cache-size: 4096

  # 引导 DNS（解析 DoH 服务器域名）
  default-nameserver:
    - 223.5.5.5
    - 119.29.29.29

  # 主 DNS - 国内域名用国内解析
  nameserver:
    - https://dns.alidns.com/dns-query
    - https://1.12.12.12/dns-query
    - https://doh.pub/dns-query

  # 域名级策略 - 强制指定 DNS
  nameserver-policy:
    "+.adguard-dns.com": https://dns.alidns.com/dns-query
    "+.dns.adguard.com": https://dns.alidns.com/dns-query

  # Fallback - 海外 DNS（解决污染）
  fallback:
    - tls://8.8.4.4:853
    - https://dns.adguard-dns.com/dns-query

  # Fallback 触发条件
  fallback-filter:
    geoip: true           # 开启检测
    geoip-code: CN        # 期望 CN IP
    geosite:
      - gfw              # GFW 列表域名
    ipcidr:
      - 240.0.0.0/4
      - 0.0.0.0/32
    domain:              # 强制走 Fallback 的域名
      - "+.google.com"
      - "+.facebook.com"
      - "+.twitter.com"
      - "+.youtube.com"
      - "+.docker.io"
```

### nameserver vs nameserver-policy

| 配置 | 作用 | 优先级 |
|------|------|--------|
| `nameserver` | 默认 DNS 服务器 | 中 |
| `nameserver-policy` | 特定域名强制使用指定 DNS | 高 |
| `fallback` | 备用 DNS（重试时使用） | 低 |

**示例：**
```yaml
nameserver:
  - https://dns.alidns.com/dns-query  # 默认用国内 DNS

nameserver-policy:
  "+.docker.io": https://8.8.4.4/dns-query  # Docker Hub 强制用海外 DNS
```

### fallback-filter 详解

```yaml
fallback-filter:
  geoip: true           # 检测返回 IP 是否属地 CN
  geoip-code: CN        # 期望 CN IP（不符合则触发 fallback）
  geosite:
    - gfw              # 域名在 GFW 列表时触发
  ipcidr:
    - 240.0.0.0/4     # 保留 IP 段
    - 0.0.0.0/32       # 特殊 IP
  domain:
    - "+.example.com" # 特定域名强制触发
```

**触发条件：**

| 条件 | 说明 | 触发 Fallback？ |
|------|------|----------------|
| `geoip: true` | 返回 IP 不属地 CN | ✅ |
| `geosite: gfw` | 域名在 GFW 列表 | ✅ |
| `ipcidr: ...` | IP 是保留/特殊地址 | ✅ |
| `domain: ...` | 特定域名 | ✅ |

### 常见污染域名处理

```yaml
nameserver-policy:
  # Docker Hub - 必须用海外 DNS
  "+.docker.io": https://8.8.4.4/dns-query
  "+.registry-1.docker.io": https://8.8.4.4/dns-query

  # GitHub - 国内 DNS 可能污染
  "+.github.com": https://8.8.4.4/dns-query
  "+.githubusercontent.com": https://8.8.4.4/dns-query
```

## DNS 故障排查

### 症状：域名解析返回错误 IP

**诊断流程：**
```bash
# 1. 测试不同 DNS 服务器
dig +short registry-1.docker.io @192.168.0.1    # AdGuard
dig +short registry-1.docker.io @192.168.0.2      # Clash
dig +short registry-1.docker.io @8.8.4.4         # Google

# 2. 验证 IP 属地
curl -s ipinfo.io/<IP> | grep country

# 3. 查看 AdGuard QueryLog
cat /tmp/adguardhome/data/querylog.json | grep docker.io

# 4. 检查 Clash 配置
grep -A 15 "fallback-filter:" /etc/openclash/config-mihomo-*.yaml
```

### 症状：Docker Hub 连接超时

**诊断：**
```bash
# DNS 解析测试
dig +short registry-1.docker.io @192.168.0.2

# 应该返回 AWS IP（正确），而不是 Facebook IP（错误）

# 代理节点测试
curl -s -o /dev/null -w "%{http_code}" https://registry-1.docker.io/v2/
```

### 症状：规则不生效

**诊断：**
```bash
# 检查规则匹配
logread | grep "match RuleSet"

# 检查规则文件
cat /etc/openclash/rule-providers/docker.yaml | head -20
```

## AdGuard Home 配置要点

```yaml
# /etc/adguardhome.yaml
dns:
  bind_hosts:
    - 0.0.0.0
  port: 53

  upstream_dns:
    - 127.0.0.1:7874    # OpenClash DNS 上游

  bootstrap_dns:
    - 192.168.0.1      # 路由器 IP

  all_servers: true     # 并行查询所有上游

  cache_size: 0        # 禁用缓存，由 Clash 处理
```

**关键点：**
- `upstream_dns` 指向 OpenClash (127.0.0.1:7874)
- `bootstrap_dns` 用于解析 `upstream_dns` 中的 DoH 域名
- `all_servers: true` 可能导致国内 DNS 先返回（通常更快）

---

**最后更新**: 2025-02-08
