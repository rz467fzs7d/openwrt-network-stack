# AdGuard Home 代替 Dnsmasq 配置指南

本指南详细说明如何在 OpenWrt 旁路由上使用 AdGuard Home 替代或配合 Dnsmasq 进行 DNS 管理。

## 目录

- [为什么要替代 Dnsmasq](#为什么要替代-dnsmasq)
- [三种配置方案对比](#三种配置方案对比)
- [方案选择建议](#方案选择建议)
- [配置步骤](#配置步骤)
- [验证和故障排查](#验证和故障排查)

---

## 为什么要替代 Dnsmasq

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

## 三种配置方案对比

### 方案一：作为 Dnsmasq 的上游服务器（最稳定）

```
客户端 → Dnsmasq (53) → AdGuard Home (5553) → 上游 DNS
```

**优点**：
- 配置简单，兼容性最好
- Dnsmasq 继续处理 DHCP 和本地域名解析
- 不影响其他依赖 Dnsmasq 的功能

**缺点**：
- AdGuard Home 看到的所有请求来源都是 `127.0.0.1`
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

## 配置步骤

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

## 验证和故障排查

### 验证配置

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

### 常见问题

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

## 配置示例总结

### 完整配置文件示例

**`/etc/config/dhcp`**（Dnsmasq 配置）：

```bash
config dnsmasq
    option domainneeded '1'
    option localise_queries '1'
    option rebind_protection '1'
    option rebind_localhost '1'
    option local '/lan/'
    option domain 'lan'
    option expandhosts '1'
    option cachesize '0'
    option authoritative '1'
    option readethers '1'
    option leasefile '/tmp/dhcp.leases'
    option resolvfile '/tmp/resolv.conf.d/resolv.conf.auto'
    option localservice '1'
    option port '6653'
    option noresolv '1'
    option nohosts '1'
```

**`/etc/AdGuardHome.yaml`**（AdGuard Home 配置）：

```yaml
dns:
  bind_hosts:
    - 0.0.0.0
  port: 5553

  upstream_dns:
    - 127.0.0.1:7874            # OpenClash

  bootstrap_dns:
    - 1.1.1.1
    - 114.114.114.114
    - 192.168.0.1

  cache_size: 4194304
  cache_ttl_min: 600
  cache_ttl_max: 3600
  cache_optimistic: true
```

**`/etc/firewall.user`**（防火墙规则）：

```bash
# AdGuard Home DNS 劫持
iptables -t nat -A PREROUTING -p udp --dport 53 -j REDIRECT --to-ports 5553
iptables -t nat -A PREROUTING -p tcp --dport 53 -j REDIRECT --to-ports 5553

# 允�� AdGuard Home 查询上游
iptables -t nat -A OUTPUT -p udp -m owner --uid-owner root --dport 53 -j ACCEPT
iptables -t nat -A OUTPUT -p tcp -m owner --uid-owner root --dport 53 -j ACCEPT
```

---

## 参考资料

本指南整合了以下优质教程的内容：

- [在OpenWrt上OpenClash+AdGuard Home+旁路由最佳设置办法](https://www.mrxiang.org/archives/openwrt_openclash_adguardhome_router.html)
- [配合AdGuard Home使用时的设置 - OpenClash Discussion #1420](https://github.com/vernesong/OpenClash/discussions/1420)
- [AdGuardHome安装及配置 - CSDN博客](https://blog.csdn.net/gn6201111990/article/details/144301521)
- [OpenWrt旁路由进阶SmartDNS+AdGH+passwall设置 - 知乎](https://zhuanlan.zhihu.com/p/686341709)

---

**最后更新**: 2025-12-20
**适用版本**: OpenWrt 22.03+ | AdGuard Home v0.107+
