# OpenWrt 网络栈完整部署方案

本文档描述基于 OpenWrt 的完整网络方案架构，从 DNS 解析到代理流量，再到订阅管理的全链路配置。

## 📐 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                         客户端设备                                │
│                    (手机、电脑、IoT 设备)                          │
└────────────────────────┬────────────────────────────────────────┘
                         │ DNS 查询 + 网络流量
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│                    OpenWrt 路由器                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  1. AdGuard Home (替代 dnsmasq)                            │ │
│  │     - 广告拦截                                              │ │
│  │     - DNS 缓存                                              │ │
│  │     - 上游: OpenClash (127.0.0.1:7874)                     │ │
│  └─────────────────┬──────────────────────────────────────────┘ │
│                    │ DNS 转发                                    │
│                    ↓                                             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  2. OpenClash / Mihomo                                     │ │
│  │     - DNS 服务 (监听 7874)                                 │ │
│  │     - 分流规则 (fake-ip 模式)                              │ │
│  │     - 不转发到上游 DNS (redir-host 关闭)                   │ │
│  │     - 代理节点负载均衡                                      │ │
│  └─────────────────┬──────────────────────────────────────────┘ │
│                    │ 代理流量                                    │
│                    ↓                                             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  3. Sub-Store (Docker 部署)                                │ │
│  │     - 订阅托管和转换                                        │ │
│  │     - 节点清洗和格式化 (node-renamer.js)                   │ │
│  │     - 统一节点命名: {countryCode} {index:2d} {tags}        │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────────┬────────────────────────────────────────┘
                         │ 出口流量
                         ↓
                   ┌─────────────┐
                   │  代理节点     │
                   │  / 直连      │
                   └─────────────┘
```

## 🔄 数据流详解

### DNS 解析流程

```
客户端发起 DNS 查询
    ↓
AdGuard Home (53 端口)
    ├─ 广告域名 → 拦截 (返回 0.0.0.0)
    └─ 正常域名 → 转发到 OpenClash (127.0.0.1:7874)
        ↓
OpenClash DNS 模块 (fake-ip 模式)
    ├─ 国内域名 → 返回真实 IP (通过国内 DNS)
    └─ 国外域名 → 返回 Fake IP (198.18.0.0/16)
        ↓
    客户端使用 Fake IP 发起连接
        ↓
    OpenClash 根据分流规则选择:
        ├─ DIRECT → 直连
        └─ PROXY → 代理节点
```

### 流量代理流程

```
客户端流量
    ↓
OpenClash 接管 (透明代理/TUN 模式)
    ↓
根据规则集判断:
    ├─ DIRECT 规则 (国内网站、局域网) → 直连
    ├─ PROXY 规则 (国外网站、被墙网站) → 代理节点
    └─ SMART 规则 (AI 服务等) → Smart 智能选择
        ↓
    代理节点池 (来自 Sub-Store)
        ├─ Hong Kong (HK 01, HK 02, HK 03 IPLC...)
        ├─ Taiwan (TW 01, TW 02 IPLC...)
        ├─ Japan (JP 01, JP 02 IPLC...)
        ├─ United States (US 01, US 02...)
        └─ Singapore (SG 01, SG 02...)
```

## 🚀 部署步骤

### 第一步：部署 Sub-Store (订阅管理)

#### 1.1 Docker 部署

```bash
# 方式1: 使用本仓库
cd /path/to/openwrt-network-stack/sub-store/docker
docker-compose up -d

# 方式2: 使用独立项目
git clone https://github.com/rz467fzs7d/sub-store-docker.git
cd sub-store-docker
docker-compose up -d
```

#### 1.2 配置订阅

1. 访问 Sub-Store: `http://OPENWRT_IP:3001`
2. 添加订阅源
3. 配置操作器 - 添加脚本操作器：
   ```
   https://cdn.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@main/sub-store/scripts/node-renamer.js
   ```
4. 配置参数：
   ```json
   {
     "format": "{countryCode} {index:2d} {iplc} {otherTags}",
     "connector": " "
   }
   ```
5. 节点将被格式化为：`HK 01`, `TW 02 IPLC`, `JP 03 Home`

#### 1.3 获取订阅链接

复制格式化后的订阅链接，供 OpenClash 使用。

**详细文档**: [sub-store/docker/OPENWRT-GUIDE.md](sub-store/docker/OPENWRT-GUIDE.md)

---

### 第二步：配置 OpenClash / Mihomo

#### 2.1 安装 OpenClash

```bash
# 在 OpenWrt TTYD 终端执行
opkg update
opkg install luci-app-openclash
```

或通过 Web 界面：系统 → 软件包 → 安装 `luci-app-openclash`

#### 2.2 配置 Mihomo

1. 下载配置模板：
   ```bash
   cd /etc/openclash
   wget https://cdn.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@main/clash/config/config-mihomo.yaml.example -O config.yaml
   ```

2. 修改订阅地址：
   ```yaml
   proxy-providers:
     My-Subscription:
       type: http
       url: "YOUR_SUBSTORE_URL"  # 替换为 Sub-Store 订阅链接
       interval: 600
       path: ./proxy-providers/my-subscription.yaml
   ```

3. 配置 DNS 不转发：
   ```yaml
   dns:
     enable: true
     listen: 127.0.0.1:7874  # OpenClash DNS 监听端口
     enhanced-mode: fake-ip
     fake-ip-range: 198.18.0.0/16
     fake-ip-filter:
       - "*.lan"
       - "*.localdomain"

     # 关键配置：不转发到上游
     use-hosts: true
     use-system-hosts: false

     nameserver:
       - https://dns.alidns.com/dns-query  # 国内 DoH
       - https://doh.pub/dns-query

     fallback:
       - https://8.8.8.8/dns-query  # 国外 DoH
       - https://1.1.1.1/dns-query

     fallback-filter:
       geoip: true
       geoip-code: CN
   ```

4. 验证配置：
   ```bash
   mihomo -t -d /etc/openclash
   ```

5. 重启服务：
   ```bash
   /etc/init.d/openclash restart
   ```

#### 2.3 配置绕过黑名单（可选）

如果启用了 OpenClash **"绕过中国大陆"** 功能，某些域名需要配置绕过黑名单以确保进入 Clash 内核进行规则匹配。

**适用场景**：
- Google Play 更新（绕过大陆后无法更新）
- 内网域名访问（需要通过 VPN/ZeroTier）
- AdGuard DNS（必须通过代理进行广告拦截）

**配置方法**：

1. 通过 OpenWrt UI 配置（推荐）：
   - 登录 OpenWrt
   - 进入 `OpenClash → 全局设置 → 流量控制`
   - 找到 `绕过指定区域 IPv4 黑名单`
   - 逐行添加域名（每行一个）
   - 保存并重启 OpenClash

2. 或通过 SSH 直接编辑：
   ```bash
   vi /etc/openclash/custom/openclash_custom_chnroute_pass.list

   # 重启 OpenClash 生效
   /etc/init.d/openclash restart
   ```

**示例配置**：
```
# Google Play 更新
services.googleapis.cn
googleapis.cn

# 内网办公域名（示例）
company.internal
git.company.com
192.168.x.0/24

# AdGuard DNS
adguard-dns.com
dns.adguard.com
```

**详细文档**: [OpenClash 绕过黑名单](clash/rules/README.md#-openclash-绕过黑名单bypass-blacklist)

---

**详细文档**: [clash/README.md](clash/README.md)

---

### 第三步：配置 AdGuard Home

> ⚠️ **关于 OpenClash "绕过中国大陆 IP" 功能的说明**：
>
> OpenClash 的"绕过中国大陆 IP"功能依赖 **dnsmasq + ipset + iptables** 三者配合实现：
> 1. **Dnsmasq** - 拦截国内域名查询，使用国内 DNS 解析，将解析结果动态添加到 ipset 集合 `China_ip_route_pass`
> 2. **IPset** - 维护大陆 IP 段集合 (`China_ip_route`) 和动态解析 IP 集合 (`China_ip_route_pass`)
> 3. **Iptables** - 防火墙规则检查目标 IP 是否在这两个集合中，如果是则绕过 Clash 内核直接走原始路由
>
> **本方案使用 AdGuard Home 替代了 dnsmasq 作为主 DNS 服务器，因此无法使用该功能**（无法动态维护 `China_ip_route_pass` ipset 集合）。
>
> 本方案的国内外分流完全依赖 **OpenClash/Mihomo 内核的规则集**（GeoIP、GeoSite 等）实现，所有流量都进入 Clash 内核，由内核根据规则决定直连或代理。

#### 3.1 安装 AdGuard Home

```bash
# 方式1: 通过 Docker (推荐)
docker run -d \
  --name adguardhome \
  --restart unless-stopped \
  -p 53:53/tcp -p 53:53/udp \
  -p 3000:3000/tcp \
  -v /data/adguardhome/work:/opt/adguardhome/work \
  -v /data/adguardhome/conf:/opt/adguardhome/conf \
  adguard/adguardhome:latest

# 方式2: 原生安装
wget https://static.adguard.com/adguardhome/release/AdGuardHome_linux_arm64.tar.gz
tar -xvf AdGuardHome_linux_arm64.tar.gz
cd AdGuardHome
./AdGuardHome -s install
```

#### 3.2 配置上游 DNS

1. 访问 AdGuard Home: `http://OPENWRT_IP:3000`
2. 完成初始化设置
3. 进入 **设置 → DNS 设置**
4. 配置上游 DNS 服务器：
   ```
   127.0.0.1:7874
   ```
5. 启用 **并行请求** (可选)
6. 配置 Bootstrap DNS 服务器：
   ```
   223.5.5.5
   119.29.29.29
   ```

#### 3.3 禁用 dnsmasq

```bash
# 停止并禁用 dnsmasq
/etc/init.d/dnsmasq stop
/etc/init.d/dnsmasq disable

# 或者修改 dnsmasq 监听端口，避免与 AdGuard Home 冲突
uci set dhcp.@dnsmasq[0].port='0'  # 禁用 DNS 功能，仅保留 DHCP
uci commit dhcp
/etc/init.d/dnsmasq restart
```

#### 3.4 配置 DHCP 服务器

在 OpenWrt Web 界面：
1. 网络 → 接口 → LAN → 编辑
2. DHCP 服务器 → 高级设置
3. DHCP 选项添加：
   ```
   6,OPENWRT_IP  # 设置 AdGuard Home 为 DNS 服务器
   ```

或通过命令行：
```bash
uci add_list dhcp.lan.dhcp_option="6,192.168.1.1"  # 替换为你的 OpenWrt IP
uci commit dhcp
/etc/init.d/dnsmasq restart
```

---

### 第四步：验证和测试

#### 4.1 DNS 解析测试

```bash
# 测试 AdGuard Home
nslookup google.com 127.0.0.1

# 测试 OpenClash DNS
nslookup google.com 127.0.0.1:7874

# 客户端测试 (从 PC/Mac)
nslookup google.com
```

#### 4.2 广告拦截测试

访问: https://ads-blocker.com/testing/
应该看到广告被拦截。

#### 4.3 代理功能测试

```bash
# 测试 IP 归属
curl https://ip.sb
curl https://ipinfo.io

# 测试 OpenAI (应该通过代理)
curl https://api.openai.com

# 测试国内网站 (应该直连)
curl https://www.baidu.com
```

#### 4.4 Sub-Store 节点格式验证

在 OpenClash 面板查看节点名称，应该看到统一格式：
- `HK 01`
- `TW 02 IPLC`
- `JP 03 Home`
- `US 01 IPLC ATT`

---

## 🔧 配置文件关联

### 节点命名与筛选的关联

**Sub-Store 节点格式化** (node-renamer.js):
```json
{
  "format": "{countryCode} {index:2d} {iplc} {otherTags}",
  "connector": " "
}
```
↓ 输出节点名称
```
HK 01
TW 02 IPLC
JP 03 Home
US 01 IPLC ATT
```

**OpenClash 关键词匹配** (config-mihomo.yaml):
```yaml
x-keywords:
  hong-kong: &HONG_KONG_KEYWORDS "HK"
  taiwan: &TAIWAN_KEYWORDS "TW"
  japan: &JAPAN_KEYWORDS "JP"
  united-states: &UNITED_STATES_KEYWORDS "US"
  iplc: &IPLC_KEYWORDS "IPLC"
```

**代理组筛选**:
```yaml
proxy-groups:
  - name: Hong Kong
    type: url-test
    filter: *HONG_KONG_KEYWORDS  # 匹配 "HK"

  - name: IPLC
    type: select
    filter: *IPLC_KEYWORDS  # 匹配 "IPLC"
```

这种设计实现了：
- ✅ **统一格式**: Sub-Store 输出的节点名称格式固定
- ✅ **精确匹配**: OpenClash 用简单的国家代码即可筛选
- ✅ **易于维护**: 无需复杂的正则表达式
- ✅ **灵活扩展**: 可以轻松添加新的标签 (Home、Enterprise、5G 等)

---

## 📊 性能优化建议

### DNS 优化

1. **AdGuard Home 缓存配置**:
   - 缓存大小: 10MB
   - 缓存 TTL 最小值: 300s
   - 缓存 TTL 最大值: 86400s

2. **OpenClash DNS 优化**:
   ```yaml
   dns:
     cache-size: 4096
     enhanced-mode: fake-ip
   ```

### 代理节点优化

1. **Sub-Store 操作器链**:
   - Script Operator (node-renamer.js) - 格式化节点
   - Filter Operator - 按地区/标签筛选
   - Sort Operator - 按延迟排序

2. **OpenClash 健康检查**:
   ```yaml
   health-check:
     enable: true
     interval: 300  # 5 分钟
     timeout: 1000  # 1 秒
   ```

### 资源使用

| 组件 | CPU 使用 | 内存使用 | 备注 |
|------|---------|---------|------|
| AdGuard Home | < 5% | ~50MB | 取决于查询量 |
| OpenClash | 5-10% | ~100MB | 取决于规则数量 |
| Sub-Store (Docker) | < 2% | ~80MB | 仅在订阅更新时活跃 |

---

## ❓ 常见问题

### Q1: AdGuard Home 和 OpenClash DNS 的区别？

**AdGuard Home**:
- 广告拦截
- DNS 缓存
- 查询日志
- 家长控制

**OpenClash DNS**:
- 分流解析 (国内/国外)
- Fake IP 模式
- DNS 劫持防护
- 配合代理规则

### Q2: 为什么 OpenClash 不转发到上游 DNS？

因为 OpenClash 已经通过 `nameserver` 和 `fallback` 配置了完整的 DNS 解析，无需再转发。转发会导致：
- DNS 泄漏
- 解析速度变慢
- Fake IP 模式失效

### Q3: Sub-Store 的节点格式化有什么好处？

1. **统一命名**: 所有节点遵循相同格式
2. **易于筛选**: OpenClash 用简单关键词即可匹配
3. **信息提取**: 自动识别 IPLC、运营商、家宽等信息
4. **按地区索引**: 每个地区的节点自动编号 (01, 02, 03...)

### Q4: 如何添加自定义规则？

1. Fork 本仓库
2. 修改 `clash/rules/direct.yaml` (直连) 或 `clash/rules/proxy.yaml` (代理)
3. 在 OpenClash 配置中引用你的仓库 URL
4. 详见: [clash/rules/README.md](clash/rules/README.md)

---

## 🔗 相关文档

| 文档 | 说明 |
|------|------|
| [sub-store/README.md](sub-store/README.md) | Sub Store 完整方案索引 |
| [sub-store/docker/OPENWRT-GUIDE.md](sub-store/docker/OPENWRT-GUIDE.md) | Sub-Store Docker 部署指南 |
| [sub-store/scripts/README.md](sub-store/scripts/README.md) | node-renamer.js 详细文档 |
| [clash/README.md](clash/README.md) | Mihomo/Clash 配置说明 |
| [clash/rules/README.md](clash/rules/README.md) | 自定义规则集文档 |

---

## 📄 许可证

MIT License

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

如有问题或建议，请在 [GitHub Issues](https://github.com/rz467fzs7d/openwrt-network-stack/issues) 中反馈。
