# Sub-Store 安装指南

Sub-Store 订阅管理服务的安装部署说明。

> 💡 **完整部署流程**: 查看根目录 [DEPLOYMENT-GUIDE.md](../DEPLOYMENT-GUIDE.md) 了解完整的网络栈部署
> 💡 **配置说明**: 查看 [CONFIGURATION.md](CONFIGURATION.md) 了解如何配置订阅和脚本

## 安装方式

Sub-Store 推荐通过 Docker 部署，提供了优化的镜像（体积减少 37.5%）。

---

## Docker 部署（推荐）

### 方式一：使用 docker-compose

```bash
# 进入 docker 目录
cd sub-store/docker

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f sub-store

# 查看状态
docker-compose ps
```

### 方式二：使用 docker run

```bash
docker run -d \
  --name sub-store \
  --restart unless-stopped \
  -p 3001:3001 \
  -p 3000:3000 \
  -v ./data:/opt/app/data \
  -e SUB_STORE_FRONTEND_BACKEND_PATH=/backend \
  -e TZ=Asia/Shanghai \
  rz467fzs7d/sub-store:latest
```

### 环境变量说明

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SUB_STORE_FRONTEND_BACKEND_PATH` | 后端 API 路径 | `/backend` |
| `TZ` | 时区设置 | `Asia/Shanghai` |

---

## OpenWrt 特殊配置

在 OpenWrt 旁���由模式下部署时，需要额外配置：

### 1. DNS 配置

在 `docker-compose.yml` 中添加 DNS：

```yaml
services:
  sub-store:
    dns:
      - 192.168.0.1      # 主路由 DNS
      - 223.5.5.5        # 阿里云 DNS
      - 8.8.8.8          # Google DNS
```

### 2. 防火墙规则

添加 iptables MASQUERADE 规则：

```bash
# 允许 Docker 容器访问外网
iptables -t nat -A POSTROUTING -s 172.17.0.0/16 ! -o docker0 -j MASQUERADE

# 持久化规则
echo 'iptables -t nat -A POSTROUTING -s 172.17.0.0/16 ! -o docker0 -j MASQUERADE' >> /etc/firewall.user
/etc/init.d/firewall restart
```

**详细配置**: 查看 [docker/OPENWRT-GUIDE.md](docker/OPENWRT-GUIDE.md) 了解完整的 OpenWrt 部署说明。

---

## 验证安装

### 检查服务状态

```bash
# 检查容器运行状态
docker ps | grep sub-store

# 检查端口监听
netstat -tuln | grep -E '3000|3001'
# 应该看到:
# - 3000 (Backend API)
# - 3001 (Frontend Web UI)
```

### 访问 Web 界面

打开浏览器访问：
```
http://192.168.0.2:3001
```

如果能看到 Sub-Store 界面，说明安装成功。

### 测试网络连通性

```bash
# 测试容器能否访问外网
docker exec sub-store ping -c 3 www.google.com

# 测试容器 DNS 解析
docker exec sub-store nslookup github.com
```

---

## 更新 Sub-Store

### 更新到最新版本

```bash
# 停止容器
docker-compose down

# 拉取最新镜像
docker pull rz467fzs7d/sub-store:latest

# 重启容器
docker-compose up -d
```

### 查看版本信息

访问: `http://192.168.0.2:3001/api/utils/env`

---

## 卸载

### 停止并删除容器

```bash
cd sub-store/docker

# 停止容器
docker-compose down

# 删除镜像（可选）
docker rmi rz467fzs7d/sub-store:latest

# 删除数据（可选，谨慎操作）
rm -rf ./data
```

---

## 故障排查

### Q: 无法访问 Web 界面

**检查端口**:
```bash
netstat -tuln | grep 3001
```

**检查防火墙**:
```bash
iptables -I INPUT -p tcp --dport 3001 -j ACCEPT
```

### Q: 订阅更新失败，提示网络错误

**原因**: 容器无法访问外网

**解决**: 参考上方 "OpenWrt 特殊配置" 部分，配置 DNS 和防火墙。

详见: [docker/OPENWRT-GUIDE.md](docker/OPENWRT-GUIDE.md)

### Q: 容器启动失败

**查看日志**:
```bash
docker logs sub-store
```

**常见原因**:
- 端口被占用
- 数据目录权限问题
- Docker 版本过低

### Q: Docker 镜像拉取慢

**使用国内镜像加速**:
```bash
# 配置 Docker 镜像源
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<EOF
{
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com"
  ]
}
EOF

# 重启 Docker
/etc/init.d/dockerd restart
```

---

## Docker 镜像说明

本项目使用优化的 Sub-Store Docker 镜像：

| 特性 | 原版 | 优化版 | 改进 |
|------|------|--------|------|
| **镜像大小** | 264MB | 165MB | ✅ -37.5% |
| **基础镜像** | node:22-alpine | alpine:3.20 | ✅ 更轻量 |
| **内置功能** | 基础功能 | + mihomo + 通知 | ✅ 更完整 |

**镜像特性**:
- ✅ 多阶段构建优化大小
- ✅ 支持中国镜像加速
- ✅ 内置 http-meta (mihomo 支持)
- ✅ 内置 shoutrrr (通知支持)
- ✅ 健康检查配置

---

## 相关文档

- [CONFIGURATION.md](CONFIGURATION.md) - Sub-Store 配置指南
- [docker/OPENWRT-GUIDE.md](docker/OPENWRT-GUIDE.md) - OpenWrt 旁路由特殊配置
- [scripts/README.md](scripts/README.md) - 节点重命名脚本使用说明
- [DEPLOYMENT-GUIDE.md](../DEPLOYMENT-GUIDE.md) - 完整网络栈部署

---

## 下一步

安装完成后：
1. 访问 Web 界面: `http://192.168.0.2:3001`
2. 添加订阅源
3. 配置节点处理脚本

详见: [CONFIGURATION.md](CONFIGURATION.md)

---

**最后更新**: 2025-01-09
