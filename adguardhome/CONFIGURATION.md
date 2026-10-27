# AdGuard Home 配置指南

AdGuard Home DNS 服务器的完整配置说明，包含基础配置、Dnsmasq 集成、高级分流等功能。

> 💡 **安装方法**: 查看 [INSTALLATION.md](INSTALLATION.md) 了解如何安装 AdGuard Home
> 💡 **部署流程**: 查看 [DEPLOYMENT-GUIDE.md](../DEPLOYMENT-GUIDE.md) 了解完整的网络栈集成

## 目录

- [基础配置](#基础配置)
  - [DNS 配置](#dns-配置)
  - [过滤列表](#过滤列表)
  - [白名单规则](#白名单规则)
  - [家庭控制](#家庭控制)
  - [DNS 重写](#dns-重写)
  - [与 OpenClash 集成](#与-openclash-集成)
- [与 Dnsmasq 集成](#与-dnsmasq-集成)
  - [为什么要集成 Dnsmasq](#为什么要集成-dnsmasq)
  - [三种集成方案对比](#三种集成方案对比)
  - [方案选择建议](#方案选择建议)
  - [配置步骤](#配置步骤-dnsmasq-集成)
- [高级配置：大陆流量绕过](#高级配置大陆流量绕过)
- [常见问题](#常见问题)

---

# 基础配置

## DNS 配置

### 核心参数

访问 AdGuard Home Web 界面，进入 **设置 → DNS 设置**。

**上游 DNS 服务器**:
```
127.0.0.1:7874
```
> 指向 OpenClash DNS，实现分流和 Fake-IP

**Bootstrap DNS** (用于解析 DoH/DoT 域名):
```
1.1.1.1
114.114.114.114
```

**负载均衡模式**: 启用（可选）

**并行请求**: 启用（可选）

### 缓存优化

- **缓存大小**: 4MB
- **最小 TTL**: 600 秒（10分钟）
- **最大 TTL**: 3600 秒（1小时）
- **乐观缓存**: 启用

### 速率限制

- **速率限制**: 20-30 请求/秒（根据设备调整）
- **最大并发数**: 300

---

## 过滤列表

### 推荐的过滤列表

进入 **过滤器 → DNS 封锁清单**，添加以下列表：

| 名称 | URL | 说明 |
|------|-----|------|
| AdGuard DNS filter | https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt | AdGuard 官方综合列表 |
| StevenBlack Hosts | http://sbc.io/hosts/hosts | 广告 + 恶意软件 |
| EasyList China | https://easylist-downloads.adblockplus.org/easylistchina.txt | 中文广告优化 |
| EasyList | https://easylist-downloads.adblockplus.org/easylist.txt | 国际广告 |

**可选列表**:
- StevenBlack - Social (拦截社交媒体)
- StevenBlack - Gambling (拦截赌博网站)
- StevenBlack - Fakenews (拦截假新闻)
- TV Box Ads (智能电视广告)

### 添加自定义列表

1. 点击 **添加阻止列表 → 添加自定义列表**
2. 输入列表 URL 和名称
3. 点击 **保存**

---

## 白名单规则

### 添加白名单

进入 **过滤器 → DNS 白名单**。

**方法 1: 通过查询日志**
1. 进入 **查询日志**
2. 找到被误拦截的域名（红色标记）
3. 点击域名旁的 **"+"** 按钮
4. 选择 **添加到白名单**

**方法 2: 手动添加**
1. 进入 **过滤器 → DNS 白名单**
2. 点击 **添加白名单 → 添加自定义规则**
3. 输入规则：
   ```
   @@||example.com^
   ```
4. 点击 **保存**

### 白名单语法

| 语法 | 说明 | 示例 |
|------|------|------|
| `@@||domain.com^` | 允许域名及子域名 | `@@||google.com^` |
| `$client='设备名'` | 仅对特定客户端生效 | `@@||getui.com^$client='iPhone'` |
| `$important` | 高优先级规则 | `@@||metrics.icloud.com^$important` |

### 常见白名单场景

**推送服务**:
```
@@||getui.com^
@@||jpush.cn^
```

**iCloud 服务**:
```
@@||metrics.icloud.com^$important
@@||icloud.com^
```

**Microsoft 服务**:
```
@@||msftconnecttest.com^
@@||windows.com^
```

---

## 家庭控制

### 全局 Safe Search

进入 **设置 → 通用设置 → 家长控制**。

启用 **Safe Search**，自动对以下搜索引擎启用安全模式：
- Google
- Bing
- DuckDuckGo
- YouTube
- Yandex

### 服务拦截

进入 **过滤器 → 服务拦截**。

选择要拦截的在线服务类别：
- 社交媒体（Facebook, Twitter, Instagram, TikTok等）
- 视频平台（YouTube, Twitch等）
- 成人内容
- 游戏平台
- 购物网站

### 客户端级别控制

进入 **设置 → 客户端设置**。

为不同设备配置差异化策略：

**示例 1: 儿童设备**
- 名称: `Child's iPhone`
- 标识符: `192.168.0.100` (IP) 或 `aa:bb:cc:dd:ee:ff` (MAC)
- ✅ 启用过滤
- ✅ 启用 Safe Search
- ✅ 使用全局服务拦截
- ✅ 启用安全浏览（恶意软件防护）

**示例 2: 成人设备**
- 名称: `Admin's Phone`
- 标识符: `192.168.0.101`
- ✅ 启用过滤
- ✅ 启用 Safe Search
- ✅ 使用全局服务拦截
- ✅ 启用安全浏览

**示例 3: 基础设施设备（NAS, 路由器）**
- 名称: `NAS`
- 标识符: `192.168.0.10`
- ❌ 关闭所有过滤（避免影响系统服务）

---

## DNS 重写

### 用途

DNS 重写可以将域名解析重定向到指定 IP，常用于：
- 强制本地访问（避免走公网）
- 自定义域名
- 广告拦截增强

### 添加 DNS 重写

进入 **过滤器 → DNS 重写**。

**示例 1: 强制本地访问 NAS**
```
域名: nas.ddns.net
IP 地址: 192.168.0.10
```

**示例 2: 自定义内网域名**
```
域名: nas.home
IP 地址: 192.168.0.10

域名: router.home
IP 地址: 192.168.0.2
```

**示例 3: 广告拦截增强**
```
域名: ads.example.com
IP 地址: 0.0.0.0
```

---

## 与 OpenClash 集成

### DNS 转发链

```
客户端 → AdGuard Home (53) → OpenClash (7874) → 上游 DNS / 代理
```

### AdGuard Home 配置

**上游 DNS 服务器**:
```
127.0.0.1:7874
```

**Bootstrap DNS**:
```
223.5.5.5
119.29.29.29
```

### OpenClash 配置要点

确保 OpenClash 配置中包含以下设置：

```yaml
dns:
  enable: true
  listen: 127.0.0.1:7874
  enhanced-mode: fake-ip

  # 为 AdGuard DNS 域名配置专用解析
  nameserver-policy:
    '+.adguard.com': https://dns.adguard-dns.com/dns-query
    '+.adguard-dns.com': https://dns.adguard-dns.com/dns-query
```

> ⚠️ **避免 DNS 循环**: OpenClash 的上游 DNS 不能指向 AdGuard Home

---

# 与 Dnsmasq 集成

本节详细说明如何在 OpenWrt 旁路由上使用 AdGuard Home 替代或配合 Dnsmasq 进行 DNS 管理。

> ⚠️ **重要提示 - 关于 OpenClash "绕过中国大陆 IP" 功能**：
>
> OpenClash 的"绕过中国大陆 IP"功能依赖 **dnsmasq + ipset + iptables** 三者配合实现：
> - **Dnsmasq** 拦截国内域名查询，将解析结果动态添加到 ipset 集合 `China_ip_route_pass`
> - **Iptables** 根据 ipset 集合规则让流量绕过 Clash 内核直接走原始路由
>
> **如果使用 AdGuard Home 完全替代 dnsmasq，将无法使用"绕过中国大陆 IP"功能**。
>
> 此时国内外分流需要完全依赖 **Clash 内核的规则集**（GeoIP、GeoSite）实现，所有流量进入 Clash 内核由其决定直连或代理。

---

## 为什么要集成 Dnsmasq

### Dnsmasq 的局限性

- **广告过滤能力有限**: 仅支持基础的 hosts 文件格式
- **无可视化界面**: 配置和日志查看不直观
- **缺少高级功能**: 不支持 Safe Search、客户端分组、DNS重写等
- **客户端统计困难**: 难以追踪每个设备的 DNS 查询

### AdGuard Home 的优势

- ✓ 强大的广告过滤（支持多种规则格式）
- ✓ 完善的 Web 管理界面
- ✓ 详细的查询日志和统计
- ✓ 客户端级别的过滤策略
- ✓ 家长控制和 Safe Search
- ✓ 支持 DoH/DoT 加密 DNS

---

## 三种集成方案对比

### 方案一：作为 Dnsmasq 的上游服务器（最稳定）

```
客户端 → Dnsmasq (53) → AdGuard Home (5553) → 上游 DNS
```

**优点**：
- 配置简单，兼容性最好
- Dnsmasq 继续处理 DHCP 和本地域名解析
- 不影响其他依赖 Dnsmasq 的功能

**缺点**：
- AdGuard Home 收到的所有请求来源都是 `127.0.0.1`
- 无法实现客户端级别的过滤策略
- 统计功能受限

**适用场景**：
- 首次配置，追求稳定性
- 不需要客户端级别的控制
- 需要保留其他 OpenWrt 插件功能

---

### 方案二：重定向 53 端口到 AdGuard Home（推荐）

```
客户端 → AdGuard Home (5553) ← 防火墙重定向 (53)
         Dnsmasq (6653) - 仅用于 DHCP
```

**优点**：
- AdGuard Home 可以看到真实客户端 IP
- 支持客户端级别的过滤策略
- Dnsmasq 继续提供 DHCP 服务
- 兼容性好，大多数插件不受影响

**缺点**：
- 需要配置防火墙规则
- 稍微复杂一些

**适用场景**：
- 需要客户端级别的过滤和统计
- 保留 Dnsmasq 的 DHCP 功能
- 旁路由模式（本指南采用）

---

### 方案三：完全替代 Dnsmasq（极简方案）

```
客户端 → AdGuard Home (53) - 同时处理 DNS 和 DHCP
         Dnsmasq (禁用)
```

**优点**：
- 配置最简洁
- AdGuard Home 完全控制 DNS 和 DHCP
- PTR 查询效率高

**缺点**：
- 可能影响其他依赖 Dnsmasq 的 OpenWrt 插件
- 网易云音乐解锁等功能可能失效
- 配置失误可能导致网络中断

**适用场景**：
- 不使用其他 OpenWrt 插件
- 追求极简配置
- 主路由模式

---

## 方案选择建议

### 旁路由模式（本指南采用）

**推荐：方案二（重定向 53 端口）**

理由：
- 旁路由本身不处理主 DHCP，由主路由负责
- AdGuard Home 使用非标准端口（如 5553）避免冲突
- 通过防火墙规则劫持 DNS 流量
- 支持客户端级别的过滤策略

### 主路由模式

**推荐：方案一或方案三**

- 首次配置建议方案一，稳定后可以尝试方案三
- 如果不使用其他 OpenWrt 插件，方案三更简洁

---

## 配置步骤 (Dnsmasq 集成)

### 方案二：重定向 53 端口到 AdGuard Home（旁路由）

本节详细说明如何在旁路由模式下配置 AdGuard Home。

#### 前提条件

- OpenWrt 已安装 AdGuard Home
- 主路由 IP: `192.168.0.1`
- 旁路由（OpenWrt）IP: `192.168.0.2`

---

#### 步骤 1: 修改 Dnsmasq 配置

**1.1 修改 Dnsmasq 监听端口**

SSH 登录 OpenWrt：

```bash
ssh root@192.168.0.2
```

编辑 `/etc/config/dhcp`：

```bash
vi /etc/config/dhcp
```

找到 `config dnsmasq` 部分，修改为：

```bash
config dnsmasq
    option domainneeded '1'
    option localise_queries '1'
    option rebind_protection '1'
    option rebind_localhost '1'
    option local '/lan/'
    option domain 'lan'
    option expandhosts '1'
    option cachesize '0'                    # 关闭 DNS 缓存（由 AdGuard Home 处理）
    option authoritative '1'
    option readethers '1'
    option leasefile '/tmp/dhcp.leases'
    option resolvfile '/tmp/resolv.conf.d/resolv.conf.auto'
    option localservice '1'
    option port '6653'                      # 改为非标准端口
    option noresolv '1'                     # 不读取 resolv.conf
    option nohosts '1'                      # 不读取 /etc/hosts
```

**关键参数说明**：
- `port '6653'`: Dnsmasq 改为监听 6653 端口（而不是 53）
- `cachesize '0'`: 关闭 Dnsmasq 的 DNS 缓存，避免与 AdGuard Home 冲突
- `noresolv '1'`: 不使用系统 DNS 配置
- `nohosts '1'`: 不读取 hosts 文件（由 AdGuard Home 处理）

**1.2 禁用 DNS 重定向**

在同一文件中，确保没有 DNS 重定向规则：

```bash
# 删除或注释掉以下选项（如果存在）
# option dns_redirect '1'
```

**1.3 重启 Dnsmasq**

```bash
/etc/init.d/dnsmasq restart
```

---

#### 步骤 2: 配置 AdGuard Home

**2.1 设置监听端口**

编辑 `/etc/AdGuardHome.yaml`：

```yaml
dns:
  bind_hosts:
    - 0.0.0.0
  port: 5553                    # 监听 5553 端口（非标准）
```

或者通过 Web 界面：

1. 登录 AdGuard Home: `http://192.168.0.2:3000`
2. 进入 **设置 → DNS 设置**
3. **DNS 服务器配置**：
   - 监听接口: `0.0.0.0`
   - 端口: `5553`
4. 点击 **保存**

**2.2 配置上游 DNS**

**重要**：在添加过滤规则之前，先配置外部 DNS，避免界面无响应。

```yaml
dns:
  upstream_dns:
    - 127.0.0.1:7874              # OpenClash（如果使用）
    # 或者使用公共 DNS：
    # - https://dns.alidns.com/dns-query
    # - https://doh.360.cn/dns-query
```

**2.3 配置 Bootstrap DNS**

```yaml
dns:
  bootstrap_dns:
    - 1.1.1.1
    - 114.114.114.114
    - 192.168.0.1                 # 主路由
```

**2.4 DNS 缓存设置**

```yaml
dns:
  cache_size: 4194304             # 4MB 缓存
  cache_ttl_min: 600              # 最小 TTL: 10分钟
  cache_ttl_max: 3600             # 最大 TTL: 1小时
  cache_optimistic: true          # 乐观缓存
```

**2.5 重启 AdGuard Home**

```bash
/etc/init.d/adguardhome restart
```

---

#### 步骤 3: 配置防火墙规则（DNS 劫持）

**3.1 添加 iptables 规则**

编辑 `/etc/firewall.user`：

```bash
vi /etc/firewall.user
```

添加以下规则：

```bash
# AdGuard Home DNS 劫持规则
# 将所有发往 53 端口的 DNS 请求重定向到 AdGuard Home (5553)

# 劫持 UDP DNS 请求
iptables -t nat -A PREROUTING -p udp --dport 53 -j REDIRECT --to-ports 5553

# 劫持 TCP DNS 请求
iptables -t nat -A PREROUTING -p tcp --dport 53 -j REDIRECT --to-ports 5553

# 允许 AdGuard Home 本身的 DNS 查询（到上游）
iptables -t nat -A OUTPUT -p udp -m owner --uid-owner root --dport 53 -j ACCEPT
iptables -t nat -A OUTPUT -p tcp -m owner --uid-owner root --dport 53 -j ACCEPT
```

**规则说明**：
- `PREROUTING`: 拦截进入路由器的 DNS 请求
- `--dport 53`: 目标端口为 53（标准 DNS 端口）
- `--to-ports 5553`: 重定向到 AdGuard Home 的端口
- `OUTPUT`: 允许 AdGuard Home 向上游 DNS 查询

**3.2 重启防火墙**

```bash
/etc/init.d/firewall restart
```

**3.3 验证规则**

```bash
iptables -t nat -L PREROUTING -n -v | grep 53
```

应该看到类似输出：

```
0     0 REDIRECT   udp  --  *      *       0.0.0.0/0            0.0.0.0/0            udp dpt:53 redir ports 5553
0     0 REDIRECT   tcp  --  *      *       0.0.0.0/0            0.0.0.0/0            tcp dpt:53 redir ports 5553
```

---

#### 步骤 4: 配置客户端 DNS

**方法 1: 主路由 DHCP 推送（推荐）**

在主路由的 DHCP 设置中，将 DNS 服务器设置为旁路由 IP：

```
主 DNS: 192.168.0.2
备用 DNS: 192.168.0.1
```

**方法 2: 手动配置客户端**

在客户端网络设置中：

```
DNS 服务器: 192.168.0.2
网关: 192.168.0.1
```

---

#### 步骤 5: 配置 OpenClash（如果使用）

如果您使用 OpenClash 作为代理，需要配置 DNS 转发链：

**5.1 AdGuard Home 配置**

```yaml
dns:
  upstream_dns:
    - 127.0.0.1:7874              # OpenClash DNS 端口
```

**5.2 OpenClash 配置**

编辑 Clash 配置文件：

```yaml
dns:
  enable: true
  listen: 127.0.0.1:7874          # 监听本地 7874 端口
  ipv6: false
  enhanced-mode: fake-ip

  default-nameserver:
    - 223.5.5.5
    - 119.29.29.29

  nameserver:
    - https://223.5.5.5/dns-query
    - https://1.1.1.1/dns-query

  # 重要：不要让 OpenClash 转发回 AdGuard Home
  # 避免 DNS 循环查询

  # AdGuard DNS 域名使用专用 DNS
  nameserver-policy:
    '+.adguard.com': https://dns.adguard-dns.com/dns-query
    '+.adguard-dns.com': https://dns.adguard-dns.com/dns-query
    '+.adguard-dns.io': https://dns.adguard-dns.com/dns-query
```

**DNS 转发链**：

```
客户端 → AdGuard Home (5553) → OpenClash (7874) → 上游 DNS / 代理
```

---

### 验证配置 (Dnsmasq 集成)

**1. 检查 AdGuard Home 是否监听正确端口**

```bash
netstat -tuln | grep 5553
```

预期输出：

```
tcp        0      0 0.0.0.0:5553            0.0.0.0:*               LISTEN
udp        0      0 0.0.0.0:5553            0.0.0.0:*
```

**2. 检查 Dnsmasq 端口**

```bash
netstat -tuln | grep 6653
```

预期输出：

```
tcp        0      0 0.0.0.0:6653            0.0.0.0:*               LISTEN
udp        0      0 0.0.0.0:6653            0.0.0.0:*
```

**3. 测试 DNS 解析**

从客户端测试：

```bash
nslookup google.com 192.168.0.2
```

预期输出：

```
Server:    192.168.0.2
Address:   192.168.0.2#53

Non-authoritative answer:
Name:   google.com
Address: 142.250.x.x
```

**4. 检查 AdGuard Home 查询日志**

1. 登录 AdGuard Home: `http://192.168.0.2:3000`
2. 进入 **查询日志**
3. 确认可以看到客户端的真实 IP（不是 127.0.0.1）

**5. 检查防火墙规则**

```bash
iptables -t nat -L PREROUTING -n -v
```

应该看到 DNS 重定向规则，且计数器在增加。

---

### 常见问题 (Dnsmasq 集成)

#### 问题 1: 客户端无法解析域名

**症状**：

```bash
nslookup google.com
# Server can't find google.com: SERVFAIL
```

**排查步骤**：

1. **检查 AdGuard Home 是否运行**

   ```bash
   /etc/init.d/adguardhome status
   ```

2. **检查防火墙规则是否生效**

   ```bash
   iptables -t nat -L PREROUTING -n -v | grep 53
   ```

3. **测试直接查询 AdGuard Home**

   ```bash
   nslookup google.com 192.168.0.2 -port=5553
   ```

4. **检查 AdGuard Home 上游 DNS**

   编辑 `/etc/AdGuardHome.yaml`，确保 `upstream_dns` 配置正确。

---

#### 问题 2: 查询日志显示所有客户端都是 127.0.0.1

**原因**：AdGuard Home 作为 Dnsmasq 的上游服务器（方案一）。

**解决方案**：

切换到方案二（重定向 53 端口），按照本指南配置防火墙规则。

---

#### 问题 3: OpenClash 与 AdGuard Home 冲突

**症状**：代理无法正常工作，或 DNS 解析失败。

**解决方案**：

1. **检查 DNS 转发顺序**

   AdGuard Home → OpenClash → 上游 DNS

2. **确保 OpenClash 不转发回 AdGuard Home**

   OpenClash 配置文件中不要将 DNS 指向 `127.0.0.1:5553`

3. **检查 OpenClash 防火墙规则优先级**

   ```bash
   iptables -t nat -L PREROUTING -n -v --line-numbers
   ```

   OpenClash 的规则应该在 AdGuard Home 规则之前。

---

#### 问题 4: 部分插件失效（如网易云音乐解锁）

**原因**：某些插件依赖 Dnsmasq 的特定功能。

**解决方案**：

1. **方案 A**: 回退到方案一（作为 Dnsmasq 上游服务器）

2. **方案 B**: 为特定插件添加例外规则

   在 `/etc/firewall.user` 中：

   ```bash
   # 排除特定 IP 的 DNS 劫持
   iptables -t nat -I PREROUTING -s 192.168.0.100 -p udp --dport 53 -j ACCEPT
   ```

3. **方案 C**: 禁用冲突插件，使用 AdGuard Home 的等效功能

---

#### 问题 5: DNS 查询速度慢

**排查步骤**：

1. **检查 AdGuard Home 缓存配置**

   ```yaml
   dns:
     cache_size: 4194304       # 增大缓存
     cache_optimistic: true    # 启用乐观缓存
   ```

2. **减少过滤列表数量**

   禁用不必要的过滤列表，保持 5-8 个即可。

3. **优化上游 DNS**

   使用 DoH/DoT 可能增加延迟，考虑使用传统 UDP DNS：

   ```yaml
   dns:
     upstream_dns:
       - 223.5.5.5
       - 119.29.29.29
   ```

4. **检查 OpenClash 性能**

   如果使用 OpenClash，确保节点延迟低。

---

# 高级配置：大陆流量绕过

是否启用大陆流量绕过，应依据 OpenClash 当前版本、运行模式和系统防火墙后端决定，不能仅凭 DNS 转发层数判断。

- 保留清晰的 DNS 路径，例如客户端 → AdGuard Home → OpenClash；避免相互转发造成循环。
- 需要保留客户端统计时，优先让客户端直接查询 AdGuard Home；后置 dnsmasq 不会必然抹掉 AdGuard Home 已收到的客户端身份。
- 使用 OpenClash 原生设置管理绕过规则，不向防火墙顶层链盲目插入 RETURN，也不覆盖现有防火墙文件。
- 旧版 iptables/ipset 命令不能直接套用到 firewall4/nftables 系统。先识别实际后端，再按插件对应版本的说明操作。
- 调整前备份配置，记录 DNS 查询、流量匹配和客户端识别结果；变更后用同一设备、同一出口复测。
- 本仓库未提供可复现的两层/三层架构性能基准，不承诺固定的毫秒级收益。

# 常见问题

## Q: 过滤列表更新失败

**原因**: 网络连接问题或 DNS 解析失败

**解决**:
1. 检查 OpenClash 是否正常运行
2. 确认 Bootstrap DNS 配置正确
3. 手动点击 **检查更新** 按钮重试

## Q: 某些网站无法访问

**排查步骤**:
1. 进入 **查询日志**，搜索相关域名
2. 检查域名是否被拦截（红色标记）
3. 临时禁用过滤（点击右上角盾牌图标）
4. 如确认误拦截，添加到白名单

## Q: Safe Search 不生效

**检查**:
1. 确认全局 Safe Search 已启用
2. 检查客户端是否覆盖了全局设置
3. 清除浏览器 Cookie 和缓存
4. 确认客户端 DNS 指向 AdGuard Home

## Q: DNS 解析速度慢

**优化**:
1. 增大缓存大小到 8MB
2. 启用乐观缓存
3. 减少过滤列表数量（建议 5-8 个）
4. 检查 OpenClash 节点延迟

## Q: 客户端未被识别

**解决**:
1. 确认客户端 IP 地址
2. 手动添加客户端（使用 IP 或 MAC 地址）
3. 启用客户端自动发现：
   - 进入 **设置 → 客户端设置**
   - 启用 **WHOIS**、**ARP**、**DHCP** 信息源

---

## 高级配置文件管理

### 配置文件位置

```bash
/etc/AdGuardHome.yaml
```

### 直接编辑配置

```bash
# 停止服务
/etc/init.d/adguardhome stop

# 编辑配置文件
vi /etc/AdGuardHome.yaml

# 重启服务
/etc/init.d/adguardhome start
```

### 备份和恢复

**备份**:
```bash
cp /etc/AdGuardHome.yaml /tmp/AdGuardHome.yaml.backup
```

**恢复**:
```bash
cp /tmp/AdGuardHome.yaml.backup /etc/AdGuardHome.yaml
/etc/init.d/adguardhome restart
```

---

## 相关文档

- [INSTALLATION.md](INSTALLATION.md) - 安装指南
- [AdGuard Home 官方文档](https://github.com/AdguardTeam/AdGuardHome/wiki)
- [DNS 过滤规则语法](https://adguard-dns.io/kb/general/dns-filtering-syntax/)
- [OpenClash 官方 Wiki](https://github.com/vernesong/OpenClash/wiki)
- [dnsmasq 官方文档](http://www.thekelleys.org.uk/dnsmasq/doc.html)
- [ipset 使用指南](https://ipset.netfilter.org/)

---

**最后更新**: 2025-01-09
