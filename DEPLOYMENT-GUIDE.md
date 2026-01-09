# OpenWrt 网络栈部署指南

本文档提供完整的安装部署步骤，适用于 OpenWrt 旁路由模式。

> 💡 **架构说明**: 查看 [README.md](README.md) 了解网络架构和拓扑结构

## 📋 前置准备

### 环境要求

| 项目 | 要求 | 说明 |
|------|------|------|
| **OpenWrt 设备** | 已刷入 OpenWrt 系统 | 推荐 23.05+ 版本 |
| **固定 IP** | `192.168.0.2` | OpenWrt 静态 IP |
| **主路由** | `192.168.0.1` | 负责 DHCP 和网关 |
| **Docker** | 已安装 Docker 和 docker-compose | 用于 Sub-Store |
| **存储空间** | 至少 500MB 可用 | 用于 Docker 镜像和数据 |

### 网络规划

```
主路由: 192.168.0.1 (DHCP 服务器、网关)
OpenWrt: 192.168.0.2 (旁路由、DNS 服务器)
客户端: 192.168.0.101 - 192.168.0.254 (DHCP 分配)
```

### 确认 OpenWrt 网络配置

```bash
# SSH 登录 OpenWrt
ssh root@192.168.0.2

# 确认 IP 配置
ip addr show br-lan
# 应显示: inet 192.168.0.2/24

# 确认能访问外网
ping -c 3 8.8.8.8
ping -c 3 www.google.com
```

---

## 🚀 部署步骤

### 第一步：配置主路由 DHCP

**目标**: 让所有客户端使用 OpenWrt (192.168.0.2) 作为 DNS 服务器。

#### 方法 A: OpenWrt 主路由 (命令行)

```bash
# SSH 登录主路由
ssh root@192.168.0.1

# 配置 DHCP 选项 6 (DNS 服务器)
uci set dhcp.lan.dhcp_option="6,192.168.0.2"
uci commit dhcp
/etc/init.d/dnsmasq restart

# 验证配置
uci show dhcp.lan.dhcp_option
```

#### 方法 B: 其他路由器品牌 (Web 界面)

在主路由管理界面找到 **DHCP 设置**，添加自定义选项：

```
Option 6 (DNS): 192.168.0.2
```

**验证**: 重启客户端网络，检查 DNS 服务器是否为 `192.168.0.2`：

```bash
# Windows
ipconfig /all

# macOS/Linux
cat /etc/resolv.conf
```

---

### 第二步：部署 Sub-Store (订阅管理)

Sub-Store 用于管理代理订阅，并提供节点格式化功能。

#### 2.1 安装 Docker (如未安装)

```bash
# SSH 登录 OpenWrt
ssh root@192.168.0.2

# 安装 Docker
opkg update
opkg install docker dockerd docker-compose

# 启动 Docker 服务
/etc/init.d/dockerd start
/etc/init.d/dockerd enable

# 验证安装
docker --version
docker-compose --version
```

#### 2.2 部署 Sub-Store

**方法 A: 使用 docker-compose (推荐)**

```bash
# 创建目录
mkdir -p /root/sub-store
cd /root/sub-store

# 创建 docker-compose.yml
cat > docker-compose.yml <<'EOF'
version: '3.8'

services:
  sub-store:
    image: rz467fzs7d/sub-store:latest
    container_name: sub-store
    restart: unless-stopped
    ports:
      - "3001:3001"
      - "3000:3000"
    volumes:
      - ./data:/opt/app/data
    environment:
      - SUB_STORE_FRONTEND_BACKEND_PATH=/backend
      - TZ=Asia/Shanghai
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3001/"]
      interval: 30s
      timeout: 3s
      start_period: 10s
      retries: 3
EOF

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

**方法 B: 使用 docker run**

```bash
docker run -d \
  --name sub-store \
  --restart unless-stopped \
  -p 3001:3001 \
  -p 3000:3000 \
  -v /root/sub-store/data:/opt/app/data \
  -e SUB_STORE_FRONTEND_BACKEND_PATH=/backend \
  -e TZ=Asia/Shanghai \
  rz467fzs7d/sub-store:latest
```

#### 2.3 配置订阅和节点重命名

1. 访问 Sub-Store: `http://192.168.0.2:3001`
2. 点击 **订阅** → **添加订阅**，填入你的订阅链接
3. 点击订阅 → **操作器** → **添加脚本操作器**
4. 脚本地址填入：
   ```
   https://cdn.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@main/sub-store/scripts/node-renamer.js
   ```
5. 参数配置（可选）：
   ```json
   {
     "format": "{countryCode} {index:2d} {iplc} {otherTags}"
   }
   ```
6. 保存后，复制订阅链接备用

> 📖 **详细配置**: [sub-store/docker/OPENWRT-GUIDE.md](sub-store/docker/OPENWRT-GUIDE.md)

---

### 第三步：部署 OpenClash (代理核心)

OpenClash 负责代理流量和 DNS 分流。

#### 3.1 安装 OpenClash

```bash
# SSH 登录 OpenWrt
ssh root@192.168.0.2

# 更新软件源
opkg update

# 安装 OpenClash
opkg install luci-app-openclash

# 或通过 Web 界面安装
# 系统 → 软件包 → 搜索 "openclash" → 安装
```

#### 3.2 下载配置模板

```bash
# 进入 OpenClash 配置目录
cd /etc/openclash

# 下载 Mihomo 配置模板
wget https://cdn.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@main/clash/config/config-mihomo.yaml.example -O config.yaml

# 备份原配置（可选）
# cp config.yaml config.yaml.bak
```

#### 3.3 修改配置文件

编辑 `/etc/openclash/config.yaml`，修改以下部分：

```yaml
# 1. 修改订阅地址
proxy-providers:
  My-Subscription:
    type: http
    url: "YOUR_SUBSTORE_URL"  # 替换为第二步获取的 Sub-Store 订阅链接
    interval: 600
    path: ./proxy-providers/my-subscription.yaml
    health-check:
      enable: true
      url: http://www.gstatic.com/generate_204
      interval: 300

# 2. 确认 DNS 配置
dns:
  enable: true
  listen: 127.0.0.1:7874
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.0/16
  nameserver:
    - https://dns.alidns.com/dns-query
    - https://doh.pub/dns-query
  fallback:
    - https://8.8.8.8/dns-query
    - https://1.1.1.1/dns-query
```

#### 3.4 启动 OpenClash

```bash
# 验证配置
mihomo -t -d /etc/openclash

# 启动服务
/etc/init.d/openclash start
/etc/init.d/openclash enable

# 查看状态
/etc/init.d/openclash status
```

#### 3.5 通过 LuCI 界面配置

1. 访问 OpenWrt 管理界面: `http://192.168.0.2`
2. 进入 **服务 → OpenClash**
3. 上传配置文件或在线编辑
4. 启动 OpenClash

> 📖 **详细配置**: [clash/CONFIGURATION.md](clash/CONFIGURATION.md)

---

### 第四步：部署 AdGuard Home (广告拦截 + DNS)

AdGuard Home 作为主 DNS 服务器，负责广告拦截和缓存。

#### 4.1 安装 AdGuard Home

```bash
# SSH 登录 OpenWrt
ssh root@192.168.0.2

# 安装 AdGuard Home
opkg update
opkg install adguardhome

# 启动服务
/etc/init.d/adguardhome start
/etc/init.d/adguardhome enable

# 检查服务状态
/etc/init.d/adguardhome status
```

#### 4.2 处理端口冲突

AdGuard Home 使用 53 端口，需要禁用或修改 dnsmasq 端口。

**方法 A: 禁用 dnsmasq DNS 功能（保留 DHCP）**

```bash
# 修改 dnsmasq 端口为 0（禁用 DNS）
uci set dhcp.@dnsmasq[0].port='0'
uci commit dhcp
/etc/init.d/dnsmasq restart
```

**方法 B: 完全停用 dnsmasq（不推荐，会失去 DHCP 功能）**

```bash
/etc/init.d/dnsmasq stop
/etc/init.d/dnsmasq disable
```

#### 4.3 初始化配置

1. 访问 AdGuard Home: `http://192.168.0.2:3000`
2. 完成初始化向导：
   - 管理员账号密码设置
   - 监听端口：保持默认 `53` (DNS) 和 `3000` (Web)
3. 进入 **设置 → DNS 设置**
4. 配置上游 DNS 服务器：
   ```
   127.0.0.1:7874
   ```
5. （可选）启用 **并行请求**
6. 配置 Bootstrap DNS（用于解析上游 DoH/DoT 域名）：
   ```
   223.5.5.5
   119.29.29.29
   ```
7. 保存设置

#### 4.4 配置过滤器（可选）

在 **过滤器 → DNS 封锁清单** 中添加广告拦截规则：

```
https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt
https://anti-ad.net/easylist.txt
```

> 📖 **详细配置**: [adguardhome/CONFIGURATION.md](adguardhome/CONFIGURATION.md)

---

## ✅ 验证部署

### 1. 检查服务状态

```bash
# SSH 登录 OpenWrt
ssh root@192.168.0.2

# 检查 Docker 容器
docker ps | grep sub-store

# 检查 OpenClash
/etc/init.d/openclash status

# 检查 AdGuard Home
/etc/init.d/adguardhome status

# 检查端口监听
netstat -tuln | grep -E '53|3000|3001|7874'
# 应该看到:
# - 53 (AdGuard Home)
# - 3000 (Sub-Store backend / AdGuard Home web)
# - 3001 (Sub-Store frontend)
# - 7874 (OpenClash DNS)
```

### 2. DNS 解析测试

```bash
# 在 OpenWrt 上测试
nslookup google.com 127.0.0.1       # 测试 AdGuard Home
nslookup google.com 127.0.0.1:7874  # 测试 OpenClash DNS

# 在客户端测试 (192.168.0.101)
nslookup google.com
# Server 应该显示: 192.168.0.2
```

### 3. 广告拦截测试

在客户端浏览器访问: https://ads-blocker.com/testing/

应该看到大部分广告被拦截。

### 4. 代理功能测试

```bash
# 在客户端测试
curl https://ip.sb
# 应返回代理节点的 IP（不是你的真实 IP）

curl https://api.openai.com
# 应该能访问（通过代理）

curl https://www.baidu.com
# 应该能访问（直连）
```

### 5. 访问 Web 界面

- **Sub-Store**: `http://192.168.0.2:3001`
- **AdGuard Home**: `http://192.168.0.2:3000`
- **OpenClash**: `http://192.168.0.2/cgi-bin/luci/admin/services/openclash`

---

## 🔧 配置调优

### DNS 缓存优化

**AdGuard Home**:
- 设置 → 通用设置 → 速率限制: `20` (每秒请求数)
- DNS 缓存大小: 根据内存调整

**OpenClash**:
```yaml
dns:
  cache-size: 4096  # 增加缓存
```

### 代理节点健康检查

```yaml
proxy-providers:
  My-Subscription:
    health-check:
      enable: true
      url: http://www.gstatic.com/generate_204
      interval: 300  # 5分钟检查一次
      timeout: 3000  # 3秒超时
```

### 资源限制

如果 OpenWrt 设备内存有限，限制 Docker 容器资源：

```yaml
services:
  sub-store:
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '0.5'
```

---

## ❓ 常见问题

### Q1: Sub-Store 无法访问外网

**症状**: 订阅更新失败，提示网络错误

**解决**:
```bash
# 添��防火墙规则
iptables -t nat -A POSTROUTING -s 172.17.0.0/16 ! -o docker0 -j MASQUERADE

# 持久化规则
echo 'iptables -t nat -A POSTROUTING -s 172.17.0.0/16 ! -o docker0 -j MASQUERADE' >> /etc/firewall.user
/etc/init.d/firewall restart
```

详见: [sub-store/docker/OPENWRT-GUIDE.md](sub-store/docker/OPENWRT-GUIDE.md)

### Q2: 客户端 DNS 不是 192.168.0.2

**原因**: DHCP 配置未生效或客户端使用了静态 DNS

**解决**:
1. 确认主路由 DHCP 选项 6 已配置
2. 客户端重新获取 IP (断网重连或 `ipconfig /renew`)
3. 检查客户端是否手动配置了 DNS

### Q3: OpenClash 无法启动

**检查日志**:
```bash
logread | grep openclash
/etc/init.d/openclash status
```

**常见原因**:
- 配置文件格式错误: `mihomo -t -d /etc/openclash`
- 端口冲突: 检查 7890, 7874 端口是否被占用
- 订阅链接无效: 手动访问订阅链接测试

### Q4: 广告没有被拦截

**检查**:
1. AdGuard Home 是否已添加过滤器规则
2. 客户端 DNS 是否正确指向 192.168.0.2
3. 浏览器是否使用了 DoH (会绕过系统 DNS)

---

## 📚 相关文档

| 文档 | 说明 |
|------|------|
| [README.md](README.md) | 网络架构和拓扑说明 |
| [sub-store/docker/OPENWRT-GUIDE.md](sub-store/docker/OPENWRT-GUIDE.md) | Sub-Store 旁路由部署详解 |
| [clash/CONFIGURATION.md](clash/CONFIGURATION.md) | OpenClash/Mihomo 配置说明 |
| [clash/rules/README.md](clash/rules/README.md) | 自定义规则集 |
| [adguardhome/CONFIGURATION.md](adguardhome/CONFIGURATION.md) | AdGuard Home 配置详解 |

---

## 🤝 获取帮助

如遇到问题：
1. 查看对应组件的详细文档
2. 检查日志文件
3. 提交 [GitHub Issue](https://github.com/rz467fzs7d/openwrt-network-stack/issues)

---

**最后更新**: 2025-01-09
