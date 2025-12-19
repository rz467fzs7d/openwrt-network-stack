# Clash/Mihomo 配置模板

完整的 Mihomo (Clash Meta) 配置模板，适用于 OpenWrt 路由器网关场景。

## 📁 文件说明

- `config/config-mihomo.yaml.example` - 配置模板文件（包含代码折叠标记）
- `rules/direct.yaml` - 直连规则
- `rules/proxy.yaml` - 代理规则

## ✨ 特性

### 1. 模块化设计（YAML 锚点）

使用 YAML 锚点实现配置复用，便于维护：

```yaml
# 定义模板
x-templates:
  proxy-group: &PROXY_GROUP_BASE
    type: select
    interval: 60
    lazy: true
    # ...

# 复用模板
proxy-groups:
  - { name: Hong Kong, <<: *PROXY_GROUP_BASE, filter: "香港|HK" }
```

### 2. 智能路由策略

**Smart Group**（智能选择组）：
- 基于机器学习自动选择最优节点
- 考虑延迟、稳定性、ASN 质量
- 支持权重优先级配置

```yaml
- name: Smart
  type: smart
  proxies: [Hong Kong, Taiwan, Japan, United States, Singapore, Others]
  policy-priority: "Hong Kong:1.5;Others:0.5"  # 香港权重 1.5，其他 0.5
  prefer-asn: true      # 优先选择 ASN 质量好的节点
  uselightgbm: true     # 使用 LightGBM 模型
  collectdata: true     # 收集性能数据用于训练
```

### 3. 代码折叠

配置文件使用 `# region` / `# endregion` 标记实现代码折叠，方便在编辑器中管理：

- `# region YAML 锚点（可复用模板）`
- `# region 核心配置`
- `# region DNS 配置`
- `# region TUN/TAP 和流量嗅探`
- `# region GeoIP/GeoSite 数据源`
- `# region 代理配置`
- `# region 路由规则`

支持 VS Code、JetBrains IDE 等主流编辑器的代码折叠功能。

### 4. 地区节点自动选择

**URL Test 组**（基于延迟）：
- 自动测试所有节点延迟
- 选择延迟最低的节点
- 支持容差避免频繁切换

**Fallback 组**（故障转移）：
- 主节点失败时自动切换备用节点
- 配置健康检查机制
- 适合 IPLC 等稳定性要求高的场景

### 5. 分应用代理策略

按应用类型分组，精细控制流量走向：

| 代理组 | 默认策略 | 适用场�� |
|--------|---------|---------|
| AI Services | Smart 优先 | OpenAI、Claude、Gemini 等 |
| YouTube | Smart 优先 | YouTube 流媒体 |
| Netflix | Smart 优先 | Netflix 流媒体 |
| GitHub | Smart 优先 | 代码托管 |
| Google | Smart 优先 | 搜索引擎 |
| Apple Services | DIRECT 优先 | App Store、iCloud 等 |

### 6. 完善的 DNS 配置

**三层 DNS 架构**：

1. **引导 DNS**（解析 DoH 服务器域名）：
   - 223.5.5.5、223.6.6.6（阿里 DNS）
   - 119.29.29.29（腾讯 DNS）

2. **主 DNS**（DoH 加密）：
   - https://dns.alidns.com/dns-query
   - https://1.12.12.12/dns-query
   - https://doh.pub/dns-query

3. **备用 DNS**（防污染）：
   - https://8.8.8.8/dns-query（Google DoH）

**Fake-IP 模式**：
- 加快 DNS 解析速度
- 减少 DNS 泄漏
- 支持按域名过滤

### 7. 流量嗅探

- 自动识别 TLS、HTTP、QUIC 协议
- 强制嗅探流媒体域名
- 跳过特定应用（Apple、小米智能家居等）

## 🔧 使用方法

### 1. 准备工作

确保 OpenWrt 已安装 Mihomo：

```bash
# 通过 opkg 安装
opkg update
opkg install mihomo

# 或者从 GitHub 下载最新版
wget https://github.com/MetaCubeX/mihomo/releases/download/latest/mihomo-linux-armv8.gz
gunzip mihomo-linux-armv8.gz
chmod +x mihomo-linux-armv8
mv mihomo-linux-armv8 /usr/bin/mihomo
```

### 2. 配置文件

```bash
# 复制模板
cp config-mihomo.yaml.example /etc/mihomo/config.yaml

# 编辑配置
vi /etc/mihomo/config.yaml
```

### 3. 必须修改的部分

#### （1）代理订阅 URL

```yaml
proxy-providers:
  Provider1:
    url: "http://127.0.0.1:3001/backend/download/Sub%2001"  # 修改为你的订阅 URL
    path: ./proxy-providers/provider1.yaml
```

**推荐方式**：使用 Sub Store 管理订阅
- Sub Store 监听在 `127.0.0.1:3001`
- 提供节点过滤、脚本处理等功能
- 参考本项目的 `sub-store/` 目录

#### （2）内网 IP 段（可选）

如果需要通过特定节点访问公司内网：

```yaml
rules:
  - IP-CIDR,192.168.x.0/24,Office,no-resolve  # 修改为实际内网段
```

#### （3）内网域名（可选）

```yaml
rules:
  # 公司内网服务
  - DOMAIN-SUFFIX,company.internal,Office
  - DOMAIN-SUFFIX,git.company.com,Office
  - DOMAIN-KEYWORD,internal-service,Office

sniffer:
  skip-domain:
    # 跳过内网域名嗅探
    - "company.internal"
    - "intranet.company.com"
```

#### （4）自定义规则（可选）

本项目提供了两个自定义规则文件，可直接使用：

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
```

或者 Fork 本仓库后修改为你自己的规则：

```yaml
rule-providers:
  CUSTOM-DIRECT:
    url: "https://cdn.jsdelivr.net/gh/YOUR_USERNAME/openwrt-network-stack@main/clash/rules/direct.yaml"
  CUSTOM-PROXY:
    url: "https://cdn.jsdelivr.net/gh/YOUR_USERNAME/openwrt-network-stack@main/clash/rules/proxy.yaml"
```

规则文件说明参见 [rules/README.md](rules/README.md)

### 4. 验证配置

```bash
# 测试配置文件语法
mihomo -t -d /etc/mihomo

# 如果输出 "configuration file xxx test is successful"，说明配置正确
```

### 5. 启动服务

```bash
# 启动 Mihomo
/etc/init.d/mihomo start

# 设置开机自启
/etc/init.d/mihomo enable

# 查看运行状态
/etc/init.d/mihomo status
```

### 6. 访问控制面板

打开浏览器访问：http://192.168.1.1:9090/ui

（将 IP 替换为你的 OpenWrt 路由器地址）

## ⚙️ 进阶配置

### 调整超时参数

配置中所有超时参数默认为 300ms，可能过于严格。根据网络情况调整：

```yaml
# Proxy Provider 健康检查
proxy-provider: &PROXY_PROVIDER_BASE
  health-check:
    timeout: 5000  # 改为 5 秒（适合 Sub Store）

# URL Test 组
url-test-group: &URL_TEST_GROUP_BASE
  timeout: 3000  # 改为 3 秒（远距离节点）

# Fallback 组
fallback-group: &FALLBACK_GROUP_BASE
  fallback-filter:
    timeout: 2000  # 改为 2 秒（避免频繁切换）
    health-check:
      http:
        - timeout: 3000  # 改为 3 秒
```

### 添加新的地区节点组

```yaml
# 1. 定义关键词
x-keywords:
  korea: &KOREA_KEYWORDS "韩国|KR|korea|seoul"

# 2. 添加代理组
proxy-groups:
  - { name: Korea, <<: *URL_TEST_GROUP_BASE, filter: *KOREA_KEYWORDS }

# 3. 添加到 Smart 组
  - name: Smart
    proxies: [Hong Kong, Taiwan, Japan, Korea, ...]  # 加入 Korea
```

### 添加新的应用策略

```yaml
# 1. 添加规则提供者（如果需要）
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

如果不想使用智能选择（机器学习需要收集数据），可以：

```yaml
# 方式 1：将应用策略改为 Hong Kong 优先
application-policy: &APPLICATION_POLICY_BASE
  proxies:
    - Hong Kong      # 改为 Hong Kong
    - Taiwan
    - Japan
    # ...

# 方式 2：删除 Smart 组相关配置
```

## 📊 节点筛选关键词

支持的筛选关键词（不区分大小写）：

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
| 其他 | 排除以上地区的所有节点 |

**特殊用途**：

| 类型 | 关键词 |
|------|--------|
| IPLC | IPLC |
| 游戏 | game、Game、游戏 |
| 办公 | Office |

## 🔍 故障排查

### 1. 配置文件语法错误

```bash
mihomo -t -d /etc/mihomo
```

常见错误：
- YAML 缩进错误（必须使用空格，不能用 Tab）
- 锚点引用错误
- 引号不匹配

### 2. 订阅无法更新

检查 Sub Store 是否正常运行：

```bash
curl http://127.0.0.1:3001/api/health
```

### 3. 节点无法连接

- 检查防火墙规则
- 查看 Mihomo 日志：`logcat -f | grep mihomo`
- 测试单个节点连接

### 4. DNS 解析异常

检查 DNS 配置：

```bash
# 测试 DoH 连接
curl -H 'accept: application/dns-json' 'https://dns.alidns.com/resolve?name=google.com'

# 查看 Mihomo DNS 缓存
curl http://127.0.0.1:9090/dns/cache
```

## 📚 参考资料

- [Mihomo 官方文档](https://wiki.metacubex.one/)
- [Clash 规则集项目](https://github.com/blackmatrix7/ios_rule_script)
- [GeoIP 数据源](https://github.com/MetaCubeX/meta-rules-dat)
- [Smart Group 说明](https://wiki.metacubex.one/config/proxy-groups/smart/)

## 🤔 常见问题

**Q: 为什么选择 Mihomo 而不是 Clash？**

A: Mihomo (Clash Meta) 是 Clash 的增强版本，提供更多功能：
- Smart Group（智能选择）
- 更强大的规则引擎
- 更好的性能优化
- 持续更新维护

**Q: 如何更新规则集？**

A: 规则集会根据 `interval` 自动更新（默认 24 小时）。手动更新：

```bash
# 删除缓存
rm -rf /etc/mihomo/rule-providers/*

# 重启服务
/etc/init.d/mihomo restart
```

**Q: Sub Store 是必需的吗？**

A: 不是必需的。你也可以：
1. 直接使用订阅 URL
2. 使用静态节点配置

但 Sub Store 提供了更强大的节点管理功能（过滤、脚本处理等）。

**Q: 配置占用多少资源？**

A: 在 OpenWrt 上：
- 内存：约 50-100MB
- CPU：空闲时 < 1%，转发流量时 5-15%
- 推荐路由器：至少 256MB RAM
