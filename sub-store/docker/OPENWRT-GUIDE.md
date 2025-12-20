# OpenWrt 旁路由部署指南

本指南专门针对在 OpenWrt 旁路由模式下部署 Sub-Store Docker 容器的特殊配置。

## 🌐 什么是旁路由模式

旁路由（Bypass Gateway）是一种特殊的网络架构：
- **主路由**：负责 DHCP、NAT、拨号上网等基础功能
- **旁路由**：OpenWrt 设备作为旁路网关，仅提供代理、广告过滤等增值服务
- **特点**：旁路由本身不处理 NAT，仅转发特定流量

在这种模式下，Docker 容器的网络配置需要特别处理。

## ⚙️ 必需配置

### 1. DNS 配置

#### 为什么需要配置 DNS？

在旁路由模式下，OpenWrt 自身可能：
- ❌ 没有配置正确的 DNS 服务器
- ❌ DNS 查询被主路由拦截或重定向
- ❌ 运行 AdGuard Home 等服务占用了 53 端口，导致容器内 DNS 解析失败

**Docker 容器默认继承宿主机的 DNS 配置**，如果宿主机（OpenWrt）的 DNS 不正常，容器就无法解析域名。

#### 解决方案

在 `docker-compose.yml` 中明确指定 DNS 服务器：

```yaml
services:
  sub-store:
    image: rz467fzs7d/sub-store:latest
    # ... 其他配置
    dns:
      - 192.168.1.1      # 主路由的 DNS（推荐）
      - 223.5.5.5        # 阿里云公共 DNS（国内）
      - 8.8.8.8          # Google DNS（备用）
```

**推荐配置顺序**：
1. **主路由 IP**（如 192.168.1.1）- 最快，能访问局域网设备
2. **国内公共 DNS**（如 223.5.5.5、119.29.29.29）- 快速，适合国内网络
3. **国际公共 DNS**（如 8.8.8.8、1.1.1.1）- 备用

#### 验证 DNS 是否正常

```bash
# 检查容器 DNS 配置
docker exec sub-store cat /etc/resolv.conf

# 测试域名解析
docker exec sub-store nslookup github.com
```

---

### 2. 防火墙配置

#### 为什么需要配置防火墙？

OpenWrt 作为旁路由时：
- ❌ 默认防火墙规则可能阻止 Docker 容器访问外部网络
- ❌ Docker 的 NAT 规则与 OpenWrt 的防火墙规则冲突
- ❌ 容器无法正常访问互联网下载订阅

**问题表现**：
- 容器可以 ping 通 IP 地址，但无法访问域名
- 容器可以访问局域网，但无法访问外网
- 订阅更新失败，提示网络错误

#### 核心规则解释

```bash
# 允许 Docker 容器访问外部网络
iptables -t nat -A POSTROUTING -s 172.17.0.0/16 ! -o docker0 -j MASQUERADE
```

**逐字段解释**：

| 字段 | 说明 |
|------|------|
| `-t nat` | 操作 NAT 表（网络地址转换表） |
| `-A POSTROUTING` | 在 POSTROUTING 链末尾添加规则（数据包离开系统前） |
| `-s 172.17.0.0/16` | 源地址是 Docker 默认网段（172.17.0.0-172.17.255.255） |
| `! -o docker0` | 出站接口**不是** docker0（即流量要离开 Docker 内部网络） |
| `-j MASQUERADE` | 执行 IP 伪装（将容器 IP 伪装成宿主机 IP） |

**简单理解**：
> 当 Docker 容器（172.17.x.x）的流量要访问外部网络时，把容器 IP 伪装成 OpenWrt 的 IP，这样外部网络才能正确回应。

#### 完整配置步骤

**方法 1：临时配置（重启失效）**

```bash
# SSH 登录 OpenWrt
ssh root@192.168.3.80

# 添加 iptables 规则
iptables -t nat -A POSTROUTING -s 172.17.0.0/16 ! -o docker0 -j MASQUERADE

# 验证规则已添加
iptables -t nat -L POSTROUTING -n -v | grep 172.17
```

**方法 2：永久配置（推荐）**

编辑 `/etc/firewall.user`：

```bash
# SSH 登录 OpenWrt
ssh root@192.168.3.80

# 编辑防火墙自定义规则
vi /etc/firewall.user
```

添加以下内容：

```bash
# Docker 容器 NAT 规则
# 允许 Docker 容器访问外部网络
iptables -t nat -A POSTROUTING -s 172.17.0.0/16 ! -o docker0 -j MASQUERADE

# 如果使用自定义 Docker 网段，修改为对应网段
# iptables -t nat -A POSTROUTING -s 192.168.100.0/24 ! -o br-xxxxx -j MASQUERADE
```

重启防火墙使规则生效：

```bash
/etc/init.d/firewall restart
```

**方法 3：使用 LuCI 界面配置**

1. 登录 OpenWrt 管理界面
2. 进入 **Network → Firewall → Custom Rules**
3. 添加上述规则
4. 点击 **Restart Firewall**

#### 验证防火墙规则

```bash
# 查看 NAT 规则
iptables -t nat -L POSTROUTING -n -v

# 测试容器网络
docker exec sub-store ping -c 3 8.8.8.8          # 测试 IP 连通性
docker exec sub-store ping -c 3 www.google.com   # 测试域名解析
docker exec sub-store wget -O- https://ip.sb     # 查看出站 IP
```

---

## 📦 完整部署示例

### docker-compose.yml（旁路由优化版）

```yaml
version: '3.8'

services:
  sub-store:
    image: rz467fzs7d/sub-store:latest
    container_name: sub-store
    restart: unless-stopped

    # 端口映射
    ports:
      - "3001:3001"
      - "3000:3000"

    # 数据持久化
    volumes:
      - ./data:/opt/app/data

    # 环境变量
    environment:
      - SUB_STORE_FRONTEND_BACKEND_PATH=/backend
      - TZ=Asia/Shanghai

    # DNS 配置（旁路由必需）
    dns:
      - 192.168.1.1      # 主路由 DNS
      - 223.5.5.5        # 阿里云 DNS
      - 8.8.8.8          # Google DNS

    # 健康检查
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3001/"]
      interval: 30s
      timeout: 3s
      start_period: 10s
      retries: 3

    # 资源限制（可选，防止占用过多资源）
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

### 部署命令

```bash
# 1. 配置防火墙（一次性操作）
ssh root@192.168.3.80
echo 'iptables -t nat -A POSTROUTING -s 172.17.0.0/16 ! -o docker0 -j MASQUERADE' >> /etc/firewall.user
/etc/init.d/firewall restart

# 2. 创建项目目录
mkdir -p /root/sub-store
cd /root/sub-store

# 3. 创建 docker-compose.yml（内容见上）
vi docker-compose.yml

# 4. 启动服务
docker-compose up -d

# 5. 查看日志
docker-compose logs -f

# 6. 测试网络连通性
docker exec sub-store ping -c 3 www.google.com
```

---

## 🔧 故障排查

### 问题 1：容器无法解析域名

**症状**：
```bash
docker exec sub-store ping www.google.com
# ping: bad address 'www.google.com'
```

**解决方案**：
```bash
# 检查容器 DNS 配置
docker exec sub-store cat /etc/resolv.conf

# 如果 DNS 不正确，修改 docker-compose.yml 添加 dns 配置
# 然后重启容器
docker-compose down && docker-compose up -d
```

---

### 问题 2：容器无法访问外网

**症状**：
```bash
docker exec sub-store wget https://www.google.com
# Connecting to www.google.com (failed: Network is unreachable)
```

**解决方案**：
```bash
# 检查防火墙规则
iptables -t nat -L POSTROUTING -n -v | grep 172.17

# 如果没有规则，添加规则
iptables -t nat -A POSTROUTING -s 172.17.0.0/16 ! -o docker0 -j MASQUERADE

# 并写入 /etc/firewall.user 以持久化
```

---

### 问题 3：端口无法从其他设备访问

**症状**：
- 在 OpenWrt 上可以访问 `http://localhost:3001`
- 在局域网其他设备无法访问 `http://192.168.3.80:3001`

**解决方案**：
```bash
# 检查 OpenWrt 防火墙是否允许该端口
iptables -L INPUT -n -v | grep 3001

# 如果被阻止，添加允许规则
iptables -I INPUT -p tcp --dport 3001 -j ACCEPT

# 持久化规则
echo 'iptables -I INPUT -p tcp --dport 3001 -j ACCEPT' >> /etc/firewall.user
/etc/init.d/firewall restart
```

---

### 问题 4：Docker 网段冲突

**症状**：
```bash
docker network ls
# 显示的网段与局域网网段冲突（如 172.17.0.0/16 与实际网络冲突）
```

**解决方案**：
```bash
# 修改 Docker 默认网段
vi /etc/docker/daemon.json
```

添加：
```json
{
  "bip": "192.168.100.1/24",
  "default-address-pools": [
    {
      "base": "192.168.100.0/24",
      "size": 24
    }
  ]
}
```

重启 Docker：
```bash
/etc/init.d/dockerd restart
```

更新防火墙规则：
```bash
# 修改 /etc/firewall.user 中的网段
iptables -t nat -A POSTROUTING -s 192.168.100.0/24 ! -o docker0 -j MASQUERADE
```

---

## 📚 相关链接

- [Docker 网络模式详解](https://docs.docker.com/network/)
- [OpenWrt 防火墙配置](https://openwrt.org/docs/guide-user/firewall/firewall_configuration)
- [iptables MASQUERADE 详解](https://www.netfilter.org/documentation/)

---

## ❓ 常见问题

**Q: 为什么不用 `network_mode: host`？**

A: `host` 模式虽然简单，但会：
- 失去网络隔离
- 容器直接使用宿主机网络栈，可能与 OpenWrt 服务冲突
- 不便于管理和迁移

**Q: MASQUERADE 和 SNAT 有什么区别？**

A:
- `MASQUERADE`：自动获取出站接口 IP 进行伪装，适合 IP 动态变化的场景
- `SNAT`：需要手动指定目标 IP，适合 IP 固定的场景
- 旁路由通常使用 `MASQUERADE` 更灵活

**Q: 可以用其他 Docker 网络驱动吗？**

A: 可以，但 `bridge` 模式最简单可靠。其他模式（如 `macvlan`）需要更复杂的配置。

---

**最后更新**：2025-12-18
