# DNS Benchmark - DNS 性能基���测试工具

一个轻量级的 DNS 性能基准测试工具，专为 OpenWrt 等嵌入式 Linux 环境设计。

## 特性

- ✅ **轻量级**: 纯 Shell 脚本，无需 Python 环境
- 🚀 **多协议**: 支持 UDP DNS 和 DoH (DNS over HTTPS)
- 🌍 **多区域**: 内置国内外主流 DNS 服务商
- 📊 **详细统计**: 平均/最小/最大延迟、成功率
- 🔍 **污染检测**: 自动检测 DNS 污染
- 🎯 **智能推荐**: 根据测试结果推荐最优 DNS

## 依赖安装

### OpenWrt

```bash
opkg update
opkg install bind-dig   # UDP DNS 测试必需
opkg install curl       # DoH 测试需要
```

### 其他 Linux 发行版

```bash
# Debian/Ubuntu
apt install dnsutils curl

# CentOS/RHEL
yum install bind-utils curl

# Alpine
apk add bind-tools curl
```

## 使用方法

### 基础测试

```bash
# 测试所有 UDP DNS
./dns_benchmark.sh

# 测试特定域名
./dns_benchmark.sh -d google.com

# 测试 DoH 协议
./dns_benchmark.sh -p doh

# 测试所有协议
./dns_benchmark.sh -p all

# 只测试国内 DNS
./dns_benchmark.sh -r CN

# 只测试国际 DNS
./dns_benchmark.sh -r US
```

### 高级选项

```bash
# 增加测试轮数 (提高准确性)
./dns_benchmark.sh -n 5

# 显示解析的 IP 地址
./dns_benchmark.sh -i

# 详细输出模式
./dns_benchmark.sh -v

# DNS 污染检测
./dns_benchmark.sh -P -d google.com

# 组合使用
./dns_benchmark.sh -d facebook.com -p all -r all -n 5 -i
```

### 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `-d DOMAIN` | 测试域名 | baidu.com |
| `-p PROTOCOL` | 协议 (udp/doh/all) | udp |
| `-r REGION` | 区域 (CN/US/all) | all |
| `-n ROUNDS` | 测试轮数 | 3 |
| `-t TIMEOUT` | 超时时间(秒) | 5 |
| `-i` | 显示解析的IP | 否 |
| `-v` | 详细输出 | 否 |
| `-P` | 污染检测模式 | 否 |
| `-h` | 显示帮助 | - |

## 输出示例

### 标准输出

```
🚀 开始DNS性能测试...
测试域名: baidu.com
测试协议: udp
测试轮数: 3

===============================================================================
DNS 性能测试结果
===============================================================================
排名 DNS服务商             协议     平均(ms)     最小(ms)     最大(ms)     成功率
-------------------------------------------------------------------------------
🥇  阿里DNS               udp          15.2         14.8         15.8       100%
🥈  DNSPod                udp          18.5         17.2         20.1       100%
🥉  114DNS                udp          22.3         21.5         23.8       100%
4.  百度DNS               udp          25.6         24.2         27.4       100%
5.  Google DNS            udp          45.8         43.2         49.5       100%
6.  Cloudflare            udp          52.3         50.1         55.8       100%

===============================================================================
🎯 DNS 推荐
===============================================================================
🚀 最快国内DNS: 阿里DNS (udp) - 15.2ms
   服务器: 223.5.5.5

🌐 最快国际DNS: Google DNS (udp) - 45.8ms
   服务器: 8.8.8.8

✓ 最可靠DNS: 阿里DNS - 成功率 100%
```

### 污染检测

```bash
./dns_benchmark.sh -P -d google.com
```

输出:
```
🔍 检测 google.com 的 DNS 污染...

测试国内 DNS...
测试国际 DNS...

国内DNS解析结果: 142.250.185.206
国际DNS解析结果: 142.250.185.206

✅ 未检测到 DNS 污染
```

## 内置 DNS 服务商

### 国内 DNS

| 服务商 | UDP | DoH | 特点 |
|--------|-----|-----|------|
| 阿里DNS | 223.5.5.5<br>223.6.6.6 | https://dns.alidns.com/dns-query | 速度快,支持ECS |
| DNSPod | 119.29.29.29<br>119.28.28.28 | https://doh.pub/dns-query | 腾讯出品,防劫持 |
| 114DNS | 114.114.114.114 | - | 老牌DNS |
| 百度DNS | 180.76.76.76 | - | 速度较快 |

### 国际 DNS

| 服务商 | UDP | DoH | 特点 |
|--------|-----|-----|------|
| Google DNS | 8.8.8.8<br>8.8.4.4 | https://dns.google/dns-query | 全球最快之一 |
| Cloudflare | 1.1.1.1<br>1.0.0.1 | https://cloudflare-dns.com/dns-query | 隐私保护 |
| Quad9 | 9.9.9.9 | https://dns.quad9.net/dns-query | 恶意网站拦截 |
| AdGuard | 94.140.14.14 | https://dns.adguard-dns.com/dns-query | 广告拦截 |

## OpenWrt 配置建议

### 方法1: 使用 UCI 配置

```bash
# 设置主 DNS 为阿里
uci set network.lan.dns='223.5.5.5 223.6.6.6'
uci commit network
/etc/init.d/network reload

# 设置 dnsmasq 上游服务器
uci add_list dhcp.@dnsmasq[0].server='223.5.5.5'
uci add_list dhcp.@dnsmasq[0].server='223.6.6.6'
uci commit dhcp
/etc/init.d/dnsmasq reload
```

### 方法2: 编辑配置文件

编辑 `/etc/config/dhcp`:

```
config dnsmasq
    option domainneeded '1'
    option boguspriv '1'
    option filterwin2k '0'
    option localise_queries '1'
    option rebind_protection '1'
    option rebind_localhost '1'
    option local '/lan/'
    option domain 'lan'
    option expandhosts '1'
    option nonegcache '0'
    option authoritative '1'
    option readethers '1'
    option leasefile '/tmp/dhcp.leases'
    option resolvfile '/tmp/resolv.conf.d/resolv.conf.auto'
    option nonwildcard '1'
    option localservice '1'
    list server '223.5.5.5'
    list server '223.6.6.6'
    list server '119.29.29.29'
```

### 方法3: 使用 DoH (推荐)

安装 https-dns-proxy:

```bash
opkg update
opkg install https-dns-proxy luci-app-https-dns-proxy

# 配置 DoH
uci set https-dns-proxy.dns.bootstrap_dns='223.5.5.5,119.29.29.29'
uci set https-dns-proxy.dns.resolver_url='https://dns.alidns.com/dns-query'
uci set https-dns-proxy.dns.listen_addr='127.0.0.1'
uci set https-dns-proxy.dns.listen_port='5053'
uci commit https-dns-proxy

/etc/init.d/https-dns-proxy enable
/etc/init.d/https-dns-proxy start
```

## 常见问题

### Q: 为什么某些 DNS 测试失败?

A: 可能原因:
- DNS 服务器在您的地区不可用
- 防火墙拦截
- 网络超时
- 某些国际 DNS 在国内被阻断

### Q: DoH 测试失败?

A: 确认:
1. 是否安装了 curl: `opkg install curl`
2. 系统时间是否正确 (影响 SSL 验证)
3. 证书是否安装: `opkg install ca-bundle ca-certificates`

### Q: 如何解决 DNS 污染?

A: 推荐方案:
1. 使用 DoH/DoT 加密 DNS
2. 配置海外 DNS + 代理
3. 使用 AdGuard Home / SmartDNS 等工具

### Q: 为什么测试结果不稳定?

A: 建议:
1. 增加测试轮数: `-n 5`
2. 避开网络高峰期
3. 检查本地网络状况

## 脚本集成

在其他脚本中使用:

```bash
#!/bin/sh

# 测试 DNS 并获取推荐
RESULT=$(./dns_benchmark.sh -d example.com 2>/dev/null)

# 提取最快的 DNS
FASTEST=$(echo "$RESULT" | grep "🥇" | awk '{print $2}')

echo "推荐使用: $FASTEST"
```

## 许可证

本工具遵循项目根目录的许可证。

## 相关资源

- [OpenWrt DNS 配置��档](https://openwrt.org/docs/guide-user/base-system/dhcp)
- [DoH 标准 RFC 8484](https://datatracker.ietf.org/doc/html/rfc8484)
