# AdGuard Home 配置指南

本指南基于实际部署配置，详细说明 AdGuard Home 在旁路由模式下的完整设置。

## 目录

- [架构概览](#架构概览)
- [DNS 配置](#dns-配置)
- [过滤列表（黑名单）](#过滤列表黑名单)
- [白名单规则](#白名单规则)
- [家庭控制（Parental Control）](#家庭控制parental-control)
- [客户端配置](#客户端配置)
- [与 OpenClash 集成](#与-openclash-集成)
- [DNS 重写](#dns-重写)
- [故障排查](#故障排查)

---

## 架构概览

### 数据流向

```
客户端设备
  ↓ (查询 192.168.0.2:5553)
AdGuard Home (OpenWrt 旁路由)
  ├─ 过滤广告/跟踪器
  ├─ 应用白名单规则
  ├─ Safe Search（安全搜索）
  ├─ 服务拦截（Tumblr, OnlyFans）
  ↓ (转发到 127.0.0.1:7874)
OpenClash (Mihomo)
  ├─ 基于规则分流
  ├─ fake-ip 模式
  ↓
代理节点 或 直连
```

### 关键特性

- **旁路由模式**: OpenWrt 作为旁路由（192.168.0.2），不是主路由（192.168.0.1）
- **DNS 端口**: 5553（非标准 53 端口，避免与主路由冲突）
- **上游 DNS**: OpenClash (127.0.0.1:7874)
- **全局 Safe Search**: 对所有搜索引擎启用安全搜索
- **客户端级别控制**: 针对不同设备的差异化过滤策略
- **服务拦截**: 阻止特定在线服务（如社交媒体）

---

## DNS 配置

### 核心参数

```yaml
dns:
  bind_hosts:
    - 0.0.0.0          # 监听所有网络接口
  port: 5553           # 非标准端口（旁路由）

  # 上游 DNS 服务器
  upstream_dns:
    - 127.0.0.1:7874   # OpenClash (本地)

  # Bootstrap DNS（用于解析上游 DNS 的域名）
  bootstrap_dns:
    - 1.1.1.1          # Cloudflare DNS
    - 114.114.114.114  # 国内 DNS
    - 192.168.0.1      # 主路由

  # 备用 DNS（上游不可用时使用）
  fallback_dns:
    - 192.168.0.1      # 主路由

  # 负载均衡模式
  upstream_mode: load_balance

  # 缓存配置
  cache_size: 4194304        # 4MB 缓存
  cache_ttl_min: 600         # 最小 TTL: 10分钟
  cache_ttl_max: 3600        # 最大 TTL: 1小时
  cache_optimistic: true     # 乐观缓存

  # 性能优化
  ratelimit: 4194304         # 速率限制: 4MB/s
  max_goroutines: 300        # 最大并发协程数
  upstream_timeout: 10s      # ��游超时
```

### 为什么使用 5553 端口？

**旁路由场景下的端口选择**：
- **主路由**（192.168.0.1）占用标准 DNS 端口 **53**
- **旁路由**（192.168.0.2）使用 **5553** 避免冲突
- 客户端需手动配置 DNS 为 `192.168.0.2` + 端口 `5553`（或通过 DHCP Option 6 推送）

### Bootstrap DNS 的作用

Bootstrap DNS 用于解析上游 DNS 服务器的域名（如果上游使用域名而非 IP）。

**为什么需要多个 Bootstrap DNS**？
- **1.1.1.1**: 国际线路优先
- **114.114.114.114**: 国内线路备用
- **192.168.0.1**: 本地网络兜底

---

## 过滤列表（黑名单）

### 启用的过滤列表

| 名称 | 类型 | URL | 说明 |
|------|------|-----|------|
| AdGuard Simplified Domain Names filter | 综合 | https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt | AdGuard 官方维护的简化域名过滤器，涵盖广告、跟踪器、恶意软件 |
| StevenBlack - Basic | 广告 + 恶意软件 | http://sbc.io/hosts/hosts | 最流行的 hosts 文件，整合多个来源 |
| StevenBlack - Fakenews | 假新闻 | http://sbc.io/hosts/alternates/fakenews-only/hosts | 拦截虚假新闻和误导性信息网站 |
| StevenBlack - Gambling | 赌博 | http://sbc.io/hosts/alternates/gambling-only/hosts | 拦截在线赌博和博彩网站 |
| StevenBlack - Social | 社交媒体 | http://sbc.io/hosts/alternates/social-only/hosts | 拦截主流社交媒体平台 |
| Easylist China | 中国广告 | https://easylist-downloads.adblockplus.org/easylistchina.txt | 针对中文广告优化 |
| Easylist | 国际广告 | https://easylist-downloads.adblockplus.org/easylist.txt | 最流行的国际广告拦截列表 |
| Others - TV Box | 智能电视广告 | https://raw.githubusercontent.com/vokins/yhosts/master/data/tvbox.txt | 专门针对智能电视和电视盒子广告 |

**已禁用的列表**：
- StevenBlack - Porn（成人内容）: 未启用，通过 Safe Search 全局控制
- Others - AWAvenue: 未启用

### 添加自定义过滤列表

**方法 1: Web 界面**
1. 登录 AdGuard Home: `http://192.168.0.2:3000`
2. 进入 **过滤器 → DNS 黑名单**
3. 点击 **添加阻止列表 → 添加自定义列表**
4. 输入列表 URL 和名称
5. 点击 **保存**

**方法 2: 修改配置文件**
编辑 `/etc/AdGuardHome.yaml`：
```yaml
filters:
  - enabled: true
    url: https://example.com/filter.txt
    name: My Custom Filter
    id: 11  # 使用下一个可用 ID
```

---

## 白名单规则

### 白名单过滤列表

| 名称 | URL | 规则数 | 说明 |
|------|-----|--------|------|
| Whitelist: popular apps and services | https://raw.githubusercontent.com/swetoast/adguardhome-lists/main/whitelist.txt | 72 | 正则表达式格式，包含 Google APIs, NTP Pools, Flightradar24, API calls, OCSP 等常见服务 |

### 自定义白名单规则

```
@@||sdk.open.talk.getui.com^$client='Admin's iPhone'
@@||getui.com^$client='Admin's iPhone'
@@||metrics.icloud.com^$important
```

### 规则说明

| 规则 | 作用 | 说明 |
|------|------|------|
| `@@||sdk.open.talk.getui.com^$client='Admin's iPhone'` | 允许个推 SDK | 仅对 管理员的 iPhone 生效，用于应用推送服务 |
| `@@||getui.com^$client='Admin's iPhone'` | 允许个推主域名 | 同上，确保推送服务完整可用 |
| `@@||metrics.icloud.com^$important` | 允许 iCloud 指标上报 | 全局生效，标记为重要（优先级高） |

### 白名单语法

- `@@||domain.com^` - 允许该域名及其所有子域名
- `$client='设备名'` - 仅对特定客户端生效
- `$important` - 高优先级规则（覆盖黑名单）

### 添加白名单规则

**方法 1: Web 界面**
1. 进入 **过滤器 → DNS 白名单**
2. 点击 **添加白名单 → 添加自定义规则**
3. 输入规则（如 `@@||example.com^`）
4. 点击 **保存**

**方法 2: 查询日志快速添加**
1. 进入 **查询日志**
2. 找到被误拦截的域名（红色标记）
3. 点击域名旁的 **"+"** 按钮
4. 选择 **添加到白名单**

**方法 3: 修改配置文件**
编辑 `/etc/AdGuardHome.yaml`：
```yaml
user_rules:
  - '@@||example.com^'
  - '@@||another-domain.com^$client=''设备名'''
```

### 常见误拦截域名

参考 `whitelist.txt` 文件，包含常见服务的白名单规则：
- 微信、支付宝、淘宝、京东
- Microsoft、Apple、Google 核心服务
- GitHub、NPM、Docker Hub
- 游戏平台（Steam、PlayStation、Xbox）
- 流媒体（Netflix、YouTube、Spotify）

---

## 家庭控制（Parental Control）

### 全局 Safe Search 配置

```yaml
filtering:
  safe_search:
    enabled: true          # 全局启用安全搜索
    bing: true
    duckduckgo: true
    ecosia: true
    google: true
    pixabay: true
    yandex: true
    youtube: true
```

**效果**：
- 所有搜索引擎自动启用安全搜索模式
- 过滤成人内容、暴力内容、不适宜内容
- 对所有客户端生效（除非客户端级别覆盖）

### 服务拦截

```yaml
filtering:
  blocked_services:
    ids:
      - tumblr
      - onlyfans
```

**已拦截的服务**：
- **Tumblr**: 社交博客平台
- **OnlyFans**: 订阅内容平台

**支持拦截的服务类型**：
- 社交媒体（Facebook, Twitter, Instagram, TikTok 等）
- 视频平台（YouTube, Twitch 等）
- 游戏平台（Steam, Epic Games 等）
- 成人内容平台
- 购物网站
- 赌博网站

**添加更多服务拦截**：
1. Web 界面: **过滤器 → 服务拦截**
2. 从预定义列表中选择要拦截的服务
3. 点击 **保存**

### 客户端级别的差异化控制

#### 示例 1: Child's iPhone（儿童设备）

```yaml
- name: Child's iPhone
  ids:
    - 192.168.0.100
  tags:
    - device_phone
    - os_ios
    - user_child           # 标记为儿童用户
  filtering_enabled: true  # 启用过滤
  use_global_blocked_services: true  # 使用全局服务拦截
  safe_search:
    enabled: false         # 继承全局设置（实际生效）
```

**特点**：
- 启用广告/跟踪器过滤
- 继承全局 Safe Search
- 受全局服务拦截影响（Tumblr, OnlyFans）

#### 示例 2: Admin's iPhone（管理员设备）

```yaml
- name: Admin's iPhone
  ids:
    - 192.168.0.101
  tags:
    - device_phone
    - os_ios
    - user_admin           # 标记为管理员
  filtering_enabled: true
  safebrowsing_enabled: true  # 启用安全浏览（恶意软件防护）
  use_global_blocked_services: true
```

**特点**：
- 启用广告过滤 + 安全浏览（恶意软件防护）
- 继承全局 Safe Search
- 允许特定域名（通过白名单规则）

#### 示例 3: 基础设施设备（NAS, Home Assistant, OpenWrt）

```yaml
- name: NAS
  ids:
    - 172.16.0.10
    - 192.168.0.10
  tags:
    - device_nas
    - os_linux
  filtering_enabled: false           # 关闭过滤
  use_global_blocked_services: false # 不拦截服务
```

**特点**：
- 完全关闭过滤（避免影响系统服务）
- 不受 Safe Search 影响
- 不受服务拦截影响

### 家庭控制配置说明

#### 1. 使用标签（Tags）组织客户端

```yaml
tags:
  - device_phone    # 设备类型：手机
  - device_pc       # 设备类型：电脑
  - device_nas      # 设备类型：NAS
  - device_other    # 设备类型：其他
  - os_ios          # 操作��统：iOS
  - os_macos        # 操作系统：macOS
  - os_linux        # 操作系统：Linux
  - user_admin      # 用户角色：管理员
  - user_child      # 用户角色：儿童
```

**好处**：
- 批量管理相似设备
- 快速识别客户端类型
- 便于统计和日志分析

#### 2. 分级过滤策略

| 用户类型 | 广告过滤 | Safe Search | 服务拦截 | 安全浏览 |
|---------|---------|-------------|---------|---------|
| 儿童 | ✓ | ✓ | ✓ | ✓ |
| 成人 | ✓ | ✓ | ✓ | ✓ |
| 管理员 | ✓ | ✓ | ✓ | ✓ |
| 基础设施 | ✗ | ✗ | ✗ | ✗ |

#### 3. 客户端识别方式

**支持的标识符**：
- **IP 地址**: `192.168.0.100`
- **MAC 地址**: `26:a0:3c:07:8f:4f`
- **客户端 ID**: `01959375-c1f2-76b2-b284-1624fd386541`
- **主机名**: `localhost`

**配置说明**：
- 为关键设备配置静态 IP（通过主路由 DHCP 保留）
- 移动设备使用 IP + MAC 双重识别
- 基础设施设备使用多 IP（普通 + Zerotier）

#### 4. 添加新客户端

**Web 界面**：
1. 进入 **设置 → 客户端设置**
2. 点击 **添加客户端**
3. 填写：
   - **名称**: `设备名称`
   - **标识符**: `IP地址` 或 `MAC地址`
   - **标签**: 选择合适的标签
4. 配置过滤选项：
   - 启用过滤
   - 安全浏览
   - 服务拦截
   - Safe Search
5. 点击 **保存**

**配置文件**：
```yaml
clients:
  persistent:
    - name: 新设备名称
      ids:
        - 192.168.0.xxx
      tags:
        - device_phone
        - os_ios
        - user_child
      filtering_enabled: true
      safebrowsing_enabled: true
      use_global_blocked_services: true
```

---

## 客户端配置

### 已配置的客户端列表

| 设备名称 | IP 地址 | 标签 | 过滤 | Safe Browsing | 服务拦截 |
|---------|---------|------|------|--------------|---------|
| Child's iPhone | 192.168.0.100 | user_child | ✓ | ✗ | ✓ |
| Admin's iPhone | 192.168.0.101 | user_admin | ✓ | ✓ | ✓ |
| NAS (NAS) | 192.168.0.10<br>172.16.0.10 | device_nas | ✗ | ✗ | ✗ |
| Home Assistant | 192.168.0.20<br>172.16.0.20 | device_other | ✗ | ✗ | ✗ |
| M4 Mac mini | 192.168.0.30 | user_admin | ✗ | ✗ | ✗ |
| OpenWrt | 192.168.0.2<br>172.16.0.2<br>127.0.0.1<br>localhost | device_other | ✗ | ✗ | ✗ |
| TL-R489GP-AC | 192.168.0.1 | device_other | ✗ | ✗ | ✗ |

### 客户端自动发现

```yaml
clients:
  runtime_sources:
    whois: true        # 从 WHOIS 获取客户端信息
    arp: true          # 从 ARP 表获取客户端
    rdns: false        # 不使用反向 DNS
    dhcp: true         # 从 DHCP 租约获取客户端
    hosts: true        # 从 /etc/hosts 获取客户端名称
```

**自动发现的客户端会出现在查询日志中，但不会应用特定规则，除非手动添加为持久化客户端。**

---

## 与 OpenClash 集成

### DNS 转发链

```
客户端 → AdGuard Home (5553) → OpenClash (7874) → 上游 DNS / 代理节点
```

### AdGuard Home 配置

```yaml
dns:
  upstream_dns:
    - 127.0.0.1:7874   # 转发到 OpenClash
```

### OpenClash 配置（Mihomo）

在 `/path/to/config-mihomo.yaml` 中配置：

```yaml
dns:
  enable: true
  listen: 127.0.0.1:7874  # 监听本地 7874 端口
  ipv6: false
  enhanced-mode: fake-ip  # fake-ip 模式

  fake-ip-range: 198.18.0.1/16
  fake-ip-filter:
    - '+.lan'
    - '+.local'

  default-nameserver:
    - 223.5.5.5
    - 119.29.29.29
    - system

  nameserver:
    - https://223.5.5.5/dns-query
    - https://1.1.1.1/dns-query

  # AdGuard DNS 域名使用 DoH
  nameserver-policy:
    '+.adguard.com': https://dns.adguard-dns.com/dns-query
    '+.adguard-dns.com': https://dns.adguard-dns.com/dns-query
    '+.adguard-dns.io': https://dns.adguard-dns.com/dns-query

# 重要：不要让 OpenClash 转发回 AdGuard Home
# 避免 DNS 循环查询
```

### 关键配置说明

**1. fake-ip 模式**
- OpenClash 返回虚假 IP（198.18.x.x）给 AdGuard Home
- 根据域名规则决定代理或直连
- 避免 DNS 泄露

**2. nameserver-policy**
- 为 AdGuard DNS 相关域名指定专用 DNS
- 确保 AdGuard Home 自身可以正常更新过滤列表
- 使用 DoH 加密查询

**3. 避免 DNS 循环**
- OpenClash 的上游 DNS 不能指向 AdGuard Home (5553)
- AdGuard Home 的上游 DNS 指向 OpenClash (7874)
- 单向转发：AdGuard Home → OpenClash → 外部 DNS

### 验证集成

**测试 DNS 解析**：
```bash
# 测试通过 AdGuard Home 解析
nslookup google.com 192.168.0.2 -port=5553

# 测试通过 OpenClash 解析
nslookup google.com 127.0.0.1 -port=7874
```

**查看 AdGuard Home 查询日志**：
1. 登录 `http://192.168.0.2:3000`
2. 进入 **查询日志**
3. 确认查询被正确转发和处理

**查看 OpenClash 日志**：
```bash
# 查看 OpenClash 日志
logread | grep clash

# 或者查看容器日志（如果使用 Docker）
docker logs clash
```

---

## DNS 重写

### 当前配置

```yaml
filtering:
  rewrites:
    - domain: nas.example.com
      answer: 192.168.0.2
```

**作用**：
- 将 `nas.example.com` 的 DNS 查询直接返回 `192.168.0.2`
- 避免外网访问，强制使用内网 IP
- 适用于 NAS、路由器等本地服务的 DDNS 域名

### 添加 DNS 重写

**Web 界面**：
1. 进入 **过滤器 → DNS 重写**
2. 点击 **添加 DNS 重写**
3. 输入：
   - **域名**: `example.com`
   - **IP 地址**: `192.168.0.xxx`
4. 点击 **保存**

**配置文件**：
```yaml
filtering:
  rewrites:
    - domain: nas.example.com
      answer: 192.168.0.10
    - domain: router.example.com
      answer: 192.168.0.1
```

### 常见应用场景

**1. 强制本地访问**
```yaml
rewrites:
  - domain: nas.ddns.net
    answer: 192.168.0.10
```
即使域名解析到公网 IP，也会返回内网 IP，提高访问速度。

**2. 自定义域名**
```yaml
rewrites:
  - domain: mynas.home
    answer: 192.168.0.10
  - domain: router.home
    answer: 192.168.0.2
```
为内网设备配置自定义域名，无需修改 hosts 文件。

**3. 广告拦截增强**
```yaml
rewrites:
  - domain: ads.example.com
    answer: 0.0.0.0
```
将广告域名重写为无效 IP（配合黑名单使用）。

---

## 故障排查

### 问题 1: 客户端无法解析域名

**症状**：
```bash
nslookup google.com
# Server: 192.168.0.2
# Address: 192.168.0.2#5553
# ** server can't find google.com: SERVFAIL
```

**排查步骤**：

1. **检查 AdGuard Home 是否运行**
   ```bash
   # SSH 到 OpenWrt
   ssh root@192.168.0.2

   # 检查进程
   ps | grep AdGuardHome

   # 检查端口
   netstat -tuln | grep 5553
   ```

2. **检查 OpenClash 是否运行**
   ```bash
   # 检查 OpenClash 端口
   netstat -tuln | grep 7874

   # 查看 OpenClash 日志
   logread | grep clash | tail -50
   ```

3. **测试上游 DNS**
   ```bash
   # 测试 OpenClash DNS
   nslookup google.com 127.0.0.1 -port=7874
   ```

4. **检查 DNS 循环**
   ```bash
   # 查看 AdGuard Home 配置
   cat /etc/AdGuardHome.yaml | grep upstream_dns

   # 确保不是指向自身
   # upstream_dns 不能包含 192.168.0.2:5553
   ```

---

### 问题 2: 过滤列表更新失败

**症状**：
AdGuard Home 日志显示 "Failed to update filter"

**排查步骤**：

1. **检查网络连接**
   ```bash
   # 测试外网连接
   ping -c 3 1.1.1.1

   # 测试域名解析
   nslookup adguardteam.github.io 127.0.0.1 -port=7874
   ```

2. **检查 AdGuard DNS 域名解析**
   ```bash
   # 确保 Clash 配置中有 nameserver-policy
   grep -A 5 'nameserver-policy' /path/to/config-mihomo.yaml
   ```

3. **手动更新过滤列表**
   - Web 界面: **过滤器 → DNS 黑名单 → 检查更新**
   - 或点击单个列表的 **更新** 按钮

4. **检查过滤列表 URL 可达性**
   ```bash
   # 测试列表 URL
   wget -O /dev/null https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt
   ```

---

### 问题 3: 某些网站或应用无法访问

**症状**：
- 网站打不开
- 应用推送收不到
- 服务连接失败

**排查步骤**：

1. **检查查询日志**
   - 登录 `http://192.168.0.2:3000`
   - 进入 **查询日志**
   - 搜索相关域名
   - 查看是否被拦截（红色标记）

2. **临时禁用过滤**
   - 点击右上角 **盾牌图标**
   - 选择 **禁用保护 1 小时**
   - 测试问题是否解决

3. **添加白名单规则**
   - 找到被拦截的域名
   - 点击 **"+"** 按钮
   - 选择 **添加到白名单**

4. **检查客户端配置**
   ```bash
   # 查看客户端是否使用了正确的 DNS
   # iOS/Android: 设置 → WiFi → DNS
   # macOS: 系统偏好设置 → 网络 → DNS
   # 应该配置为: 192.168.0.2
   ```

---

### 问题 4: Safe Search 不生效

**症状**：
搜索引擎仍然显示不适宜内容

**排查步骤**：

1. **确认全局 Safe Search 已启用**
   ```bash
   cat /etc/AdGuardHome.yaml | grep -A 10 'safe_search'
   # enabled: true
   ```

2. **检查客户端配置**
   - 客户端可能覆盖了全局设置
   - Web 界面: **设置 → 客户端设置 → 选择客户端**
   - 确保 `safe_search.enabled` 不是 `false`（或使用全局设置）

3. **清除浏览器缓存**
   - Safe Search 设置可能被浏览器缓存
   - 清除 Cookie 和缓存后重试

4. **验证 DNS 配置**
   ```bash
   # 确认客户端使用的 DNS 是 AdGuard Home
   nslookup google.com
   # Server: 192.168.0.2
   ```

---

### 问题 5: 客户端未被识别

**症状**：
查询日志中显示 "未知客��端" 或 IP 地址

**排查步骤**：

1. **检查客户端 IP 是否正确**
   ```bash
   # 查看客户端实际 IP
   ip addr  # Linux/macOS
   ipconfig  # Windows
   ```

2. **添加客户端标识符**
   - Web 界面: **设置 → 客户端设置 → 添加客户端**
   - 输入 IP 地址或 MAC 地址
   - 配置标签和过滤选项

3. **启用自动发现**
   ```yaml
   clients:
     runtime_sources:
       whois: true
       arp: true
       dhcp: true
       hosts: true
   ```

4. **检查 Zerotier IP**
   - 如果使用 Zerotier，客户端可能使用 `172.16.x.x` IP
   - 为客户端配置多个 IP 标识符

---

### 问题 6: DNS 解析速度慢

**症状**：
网页加载缓慢，DNS 查询延迟高

**排查步骤**：

1. **检查缓存配置**
   ```yaml
   dns:
     cache_size: 4194304       # 增大缓存
     cache_optimistic: true    # 启用乐观缓存
   ```

2. **优化上游 DNS**
   ```yaml
   dns:
     upstream_mode: load_balance  # 或 fastest_addr（最快IP）
     fastest_timeout: 1s
   ```

3. **减少过滤列表数量**
   - 禁用不必要的过滤列表
   - 8 个以内为宜

4. **检查 OpenClash 性能**
   ```bash
   # 查看 OpenClash 延迟
   # 在 OpenClash 面板查看节点延迟
   ```

5. **调整并发数**
   ```yaml
   dns:
     max_goroutines: 300  # 根据硬件调整
   ```

---

## 高级配置

### 启用"绕过中国大陆 IP"功能

如果你需要进一步优化国内流量性能，可以通过添加 dnsmasq 中间层来启用 OpenClash 的"绕过中国大陆 IP"功能。

**⚠️ 注意**：此为高级配置，适合追求极致性能的用户。对于大多数场景，当前的两层架构已经足够高效。

**详细配置指南**：[BYPASS-CHINA-WITH-DNSMASQ.md](BYPASS-CHINA-WITH-DNSMASQ.md)

**架构对比**：
- **当前架构（两层）**：AdGuard Home → OpenClash（简单，推荐）
- **三层架构**：AdGuard Home → dnsmasq → OpenClash（复杂，极致性能）

---

## 相关文档

- [DNSMASQ-REPLACEMENT-GUIDE.md](DNSMASQ-REPLACEMENT-GUIDE.md) - AdGuard Home 替代 dnsmasq 配置指南
- [BYPASS-CHINA-WITH-DNSMASQ.md](BYPASS-CHINA-WITH-DNSMASQ.md) - 启用"绕过中国大陆 IP"功能配置指南
- [AdGuard Home 官方文档](https://github.com/AdguardTeam/AdGuardHome/wiki)
- [OpenClash Wiki](https://github.com/vernesong/OpenClash/wiki)
- [DNS 过滤规则语法](https://adguard-dns.io/kb/general/dns-filtering-syntax/)
- [StevenBlack Hosts](https://github.com/StevenBlack/hosts)

---

**最后更新**: 2025-12-20
**基于配置**: OpenWrt + AdGuard Home + OpenClash (Mihomo)
