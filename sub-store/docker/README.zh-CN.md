# Sub-Store Docker - 优化版

🐳 [Sub-Store](https://github.com/sub-store-org/Sub-Store) 的优化 Docker 镜像，支持 [http-meta](https://github.com/xream/http-meta)。

[English](README.md) | 简体中文

## ✨ 特性

- 🚀 **体积减少 37.5%**（从 264MB 降至 165MB）
- 🏗️ 多阶段构建优化镜像体积
- 🌏 支持国内镜像源加速构建
- 🔧 灵活的 GitHub 代理配置
- 📦 内置 http-meta（MetaCubeX mihomo）支持
- 🔔 内置通知支持（shoutrrr）
- 🏥 配置健康检查

## 📊 镜像对比

| 特性 | 原版 | 优化版 | 改进 |
|------|------|--------|------|
| **镜像大小** | 264MB | 165MB | ✅ -99MB (-37.5%) |
| **基础镜像** | node:22-alpine | alpine:3.20 + nodejs-current | ✅ 更轻量 |
| **构建工具** | 包含 | 已移除 | ✅ 更精简 |
| **构建速度** | 标准 | 国内镜像源 | ✅ 国内更快 |

## 🚀 快速开始

### 使用 Docker CLI

```bash
docker run -d \
  --name sub-store \
  --restart unless-stopped \
  -p 3001:3001 \
  -v /path/to/data:/opt/app/data \
  -e SUB_STORE_FRONTEND_BACKEND_PATH=/backend \
  rz467fzs7d/sub-store:latest
```

### 使用 Docker Compose

```bash
# 克隆仓库
git clone https://github.com/rz467fzs7d/sub-store-docker.git
cd sub-store-docker

# 启动服务
docker-compose up -d
```

访问 Web 界面：`http://localhost:3001`

### OpenWrt 旁路由模式部署

**⚠️ 重要提示**：如果在 OpenWrt 旁路由模式下部署，需要特殊的 DNS 和防火墙配置。

👉 **详细指南请看**：[OPENWRT-GUIDE.md](OPENWRT-GUIDE.md)

**快速检查清单**：
- ✅ 在 docker-compose.yml 中配置 DNS 服务器
- ✅ 添加 iptables MASQUERADE 规则用于容器 NAT
- ✅ 在防火墙中允许容器端口访问

## 🔨 构建选项

### 标准构建（直接访问 GitHub）

```bash
docker build -t sub-store:latest .
```

### 使用 GitHub 代理构建（国内更快）

```bash
docker build \
  --build-arg GITHUB_PROXY=https://ghfast.top/ \
  -t sub-store:latest .
```

### 其他可用代理

- `https://ghproxy.net/`
- `https://gh.api.99988866.xyz/`
- `https://mirror.ghproxy.com/`

## 📋 配置说明

### 环境变量

| 变量 | 说明 | 默认值 | 必需 |
|------|------|--------|------|
| `SUB_STORE_FRONTEND_BACKEND_PATH` | 后端 API 路径 | `/backend` | 否 |
| `SUB_STORE_FRONTEND_PATH` | 前端文件路径 | `/opt/app/frontend` | 否 |
| `SUB_STORE_DATA_BASE_PATH` | 数据存储路径 | `/opt/app/data` | 否 |
| `TIME_ZONE` | 容器时区 | `Asia/Shanghai` | 否 |

### 数据卷

| 容器路径 | 说明 | 推荐宿主机路径 |
|---------|------|----------------|
| `/opt/app/data` | Sub-Store 数据 | `/etc/sub-store/data` 或 `./data` |

### 端口

| 端口 | 服务 | 说明 |
|------|------|------|
| 3000 | 后端 | Sub-Store API 服务器 |
| 3001 | 前端 | Sub-Store Web 界面 |

## 📖 高级用法

### 自定义 DNS

```bash
docker run -d \
  --name sub-store \
  --dns 192.168.1.1 \
  -p 3001:3001 \
  -v ./data:/opt/app/data \
  rz467fzs7d/sub-store:latest
```

### 网络模式

```bash
docker run -d \
  --name sub-store \
  --network host \
  -v ./data:/opt/app/data \
  rz467fzs7d/sub-store:latest
```

### 查看日志

```bash
# 查看所有日志
docker logs sub-store

# 实时跟踪日志
docker logs -f sub-store

# 查看最后 100 行
docker logs --tail 100 sub-store
```

### 健康检查

镜像内置了每 30 秒运行一次的健康检查：

```bash
# 检查容器健康状态
docker inspect --format='{{.State.Health.Status}}' sub-store
```

## 🏗️ 构建细节

### 优化技术

1. **多阶段构建**：分离构建和运行环境
2. **最小基础镜像**：仅使用 Alpine Linux + nodejs-current
3. **层优化**：合并命令减少层数
4. **移除构建工具**：最终镜像不包含 curl、unzip
5. **国内镜像源**：加速 APK 包下载

### 构建参数

| 参数 | 说明 | 默认值 | 示例 |
|------|------|--------|------|
| `GITHUB_PROXY` | GitHub 下载代理 | `""` (空) | `https://ghfast.top/` |

### 镜像层级

```
层 1: Alpine 3.20 基础          ~8MB
层 2: nodejs-current + tzdata   ~40MB
层 3: 应用文件                  ~50MB
层 4: 二进制文件                ~42MB
层 5: 权限设置                  ~25MB
─────────────────────────────────────
总计:                           165MB
```

## 🔧 故障排查

### 容器无法启动

```bash
# 查看容器日志
docker logs sub-store

# 检查端口是否被占用
lsof -i :3001
# 或
netstat -tuln | grep 3001
```

### 权限问题

如果遇到权限错��：

```bash
# 确保数据目录可写
chmod -R 777 /path/to/data

# 或使用特定用户运行
docker run -d \
  --user $(id -u):$(id -g) \
  ...
```

### 网络问题

```bash
# 测试容器是否能访问外部 URL
docker exec sub-store wget -O- https://www.google.com

# 检查 DNS 解析
docker exec sub-store nslookup github.com
```

## 🤝 贡献

欢迎贡献！请随时提交 Pull Request。

### 开发

```bash
# 克隆仓库
git clone https://github.com/rz467fzs7d/sub-store-docker.git
cd sub-store-docker

# 构建镜像
docker build -t sub-store:dev .

# 测试镜像
docker run --rm sub-store:dev node --version
```

## 📝 更新日志

### v1.0.0 (2025-12-18)

- ✨ 首次发布
- 🚀 镜像大小从 264MB 优化到 165MB
- 🌏 添加国内镜像源支持
- 🔧 添加 GitHub 代理构建参数
- 🏥 添加健康检查
- 📦 包含 http-meta 支持

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

## 🔗 相关项目

- [Sub-Store](https://github.com/sub-store-org/Sub-Store) - 高级订阅管理器
- [Sub-Store-Front-End](https://github.com/sub-store-org/Sub-Store-Front-End) - Web 界面
- [http-meta](https://github.com/xream/http-meta) - HTTP 元数据服务
- [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo) - Clash 内核

## 🙏 致谢

- [Sub-Store 团队](https://github.com/sub-store-org) - 出色的订阅管理器
- [xream](https://github.com/xream) - http-meta 作者
- [MetaCubeX](https://github.com/MetaCubeX) - mihomo (Clash Meta 内核)

---

**用 ❤️ 制作**
