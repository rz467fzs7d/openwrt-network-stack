# OpenWrt 网络栈一键部署脚本

自动化部署 AdGuard Home + OpenClash + Sub-Store 网络栈的一键部署脚本。

## 功能特性

- ✅ 自动安装和配置 AdGuard Home (DNS 过滤)
- ✅ 自动安装 Docker 和 docker-compose
- ✅ 自动部署 Sub-Store (订阅管理)
- ✅ 辅助配置 OpenClash (智能分流)
- ✅ 交互式配置向导
- ✅ 完整的错误处理和日志记录
- ✅ 支持自定义配置
- ✅ 自动验证和健康检查

## 系统要求

- **系统**: OpenWrt 23.05 或更高版本
- **架构**: aarch64/arm64（根据您的设备）
- **存储**: 至少 500MB 可用空间
- **网络**: 需要访问外网（用于下载软件包）
- **权限**: root 权限

## 快速开始

### 1. 下载部署脚本

```bash
# 方法 1: 使用 wget
wget https://raw.githubusercontent.com/rz467fzs7d/openwrt-network-stack/main/scripts/deploy.sh

# 方法 2: 使用 curl
curl -O https://raw.githubusercontent.com/rz467fzs7d/openwrt-network-stack/main/scripts/deploy.sh

# 方法 3: 克隆整个仓库
git clone https://github.com/rz467fzs7d/openwrt-network-stack.git
cd openwrt-network-stack/scripts
```

### 2. 添加执行权限

```bash
chmod +x deploy.sh
```

### 3. 运行部署脚本

```bash
# 交互式部署（推荐）
./deploy.sh

# 自动部署（使用默认配置）
./deploy.sh -y

# 使用自定义配置
./deploy.sh -c /path/to/custom.conf
```

## 使用说明

### 命令行选项

```
用法: ./deploy.sh [选项]

选项:
  -h, --help              显示帮助信息
  -c, --config FILE       使用自定义配置文件
  -y, --yes               自动确认所有提示（使用默认配置）
  --skip-check            跳过系统检查
  --skip-network-check    跳过网络连通性检查

示例:
  ./deploy.sh                    # 交互式部署
  ./deploy.sh -y                 # 自动部署
  ./deploy.sh -c custom.conf     # 使用自定义配置
```

### 部署流程

脚本会按以下顺序执行部署:

```
0. 系统环境检查
   ├─ 检查 root 权限
   ├─ 检查 OpenWrt 系统版本
   ├─ 检查网络连通性
   └─ 检查磁盘空间

1. 确认网络配置
   ├─ 检测当前网络配置
   ├─ 确认旁路由 IP
   └─ 确认主路由 IP

2. 部署 AdGuard Home
   ├─ 安装 adguardhome 包
   ├─ 生成配置文件
   ├─ 禁用 dnsmasq DNS 功能
   └─ 启动服务

3. 安装 Docker 环境
   ├─ 安装 docker 和 dockerd
   ├─ 安装 docker-compose
   ├─ 配置防火墙规则
   └─ 启动 Docker 服务

4. 部署 Sub-Store
   ├─ 创建工作目录
   ├─ 生成 docker-compose.yml
   ├─ 拉取镜像
   ├─ 启动容器
   └─ 健康检查

5. 配置 OpenClash
   ├─ 检查是否已安装（需要手动安装）
   ├─ 下载配置模板
   ├─ 验证配置文件
   └─ 启动服务

6. 配置主路由 DHCP
   └─ 显示配置指南
```

## 配置文件

### 默认配置

默认配置文件位于 `config/default.conf`:

```bash
# 网络配置
OPENWRT_IP="192.168.0.2"           # 旁路由 IP
MAIN_ROUTER_IP="192.168.0.1"       # 主路由 IP
CLIENT_IP_START="192.168.0.101"    # 客户端起始 IP
CLIENT_IP_END="192.168.0.254"      # 客户端结束 IP

# 端口配置
AGH_DNS_PORT=53                    # AdGuard Home DNS 端口
AGH_WEB_PORT=3000                  # AdGuard Home Web 端口
CLASH_DNS_PORT=7874                # OpenClash DNS 端口
SUBSTORE_WEB_PORT=3001             # Sub-Store Web 端口

# 其他配置
SUBSTORE_IMAGE="rz467fzs7d/sub-store:latest"
TIMEZONE="Asia/Shanghai"
```

### 自定义配置

创建自定义配置文件 `config/custom.conf`:

```bash
# 复制默认配置
cp config/default.conf config/custom.conf

# 编辑配置
vi config/custom.conf

# 使用自定义配置部署
./deploy.sh -c config/custom.conf
```

## 目录结构

```
scripts/
├── deploy.sh              # 主部署脚本
├── README.md             # 本文档
├── config/               # 配置文件目录
│   ├── default.conf      # 默认配置
│   └── custom.conf       # 自定义配置（可选）
├── lib/                  # 函数库目录
│   ├── common.sh         # 通用函数（日志、交互、系统检查）
│   ├── network.sh        # 网络配置函数
│   ├── docker.sh         # Docker 管理函数
│   ├── adguardhome.sh    # AdGuard Home 部署函数
│   ├── substore.sh       # Sub-Store 部署函数
│   └── openclash.sh      # OpenClash 配置函数
└── dns-benchmark/        # DNS 性能基准测试工具
    ├── dns_benchmark.sh  # Shell 版本 (OpenWrt 推荐)
    ├── dns_benchmark.py  # Python 版本 (功能完整)
    ├── references/       # 参考配置
    │   └── dns_providers.yaml  # DNS 服务商配置
    └── README.md         # 工具文档
```

## 日志文件

部署日志保存在 `/var/log/openwrt-deploy-<timestamp>.log`

查看日志:

```bash
# 实时查看日志
tail -f /var/log/openwrt-deploy-*.log

# 查看最新日志
cat /var/log/openwrt-deploy-*.log | tail -100
```

## 故障排查

### 1. Docker 安装失败

```bash
# 检查可用空间
df -h

# 手动更新软件源
opkg update

# 手动安装 Docker
opkg install docker dockerd docker-compose
```

### 2. AdGuard Home 端口冲突

```bash
# 检查端口占用
netstat -tuln | grep :53

# 手动禁用 dnsmasq DNS
uci set dhcp.@dnsmasq[0].port=0
uci commit dhcp
/etc/init.d/dnsmasq restart
```

### 3. Sub-Store 容器无法启动

```bash
# 查看容器日志
docker logs sub-store

# 检查 Docker 服务
/etc/init.d/dockerd status

# 重启容器
cd /root/sub-store
docker-compose restart
```

### 4. OpenClash 安装

```bash
# 方法 1: 通过 opkg
opkg update
opkg install luci-app-openclash

# 方法 2: 从 GitHub 下载
# 访问: https://github.com/vernesong/OpenClash/releases
```

## 验证部署

### 检查服务状态

```bash
# AdGuard Home
/etc/init.d/adguardhome status
netstat -tuln | grep :53

# Docker
/etc/init.d/dockerd status
docker ps

# Sub-Store
docker ps | grep sub-store
curl http://127.0.0.1:3001

# OpenClash
/etc/init.d/openclash status
netstat -tuln | grep :7874
```

### 测试 DNS 解析

```bash
# 测试 AdGuard Home
nslookup google.com 192.168.0.2

# 测试 OpenClash DNS
nslookup google.com 127.0.0.1 -port=7874

# 使用 DNS Benchmark 工具测试性能
cd dns-benchmark
./dns_benchmark.sh
```

## 卸载

如需卸载部署的组件:

```bash
# 停止并卸载 AdGuard Home
/etc/init.d/adguardhome stop
/etc/init.d/adguardhome disable
opkg remove adguardhome

# 停止并删除 Sub-Store 容器
cd /root/sub-store
docker-compose down
rm -rf /root/sub-store

# 停止并卸载 OpenClash
/etc/init.d/openclash stop
/etc/init.d/openclash disable
opkg remove luci-app-openclash

# 恢复 dnsmasq DNS 功能
uci set dhcp.@dnsmasq[0].port=53
uci commit dhcp
/etc/init.d/dnsmasq restart
```

## 常见问题

**Q: 部署需要多长时间？**

A: 通常需要 10-15 分钟，具体取决于网络速度和设备性能。

**Q: 是否会覆盖现有配置？**

A: 脚本会在覆盖前提示并创建���份，备份位于 `/root/openwrt-deploy-backup/`。

**Q: 可以只部署部分组件吗？**

A: 可以。脚本在每个组件部署前都会询问确认。

**Q: 部署失败怎么办？**

A: 查看日志文件了解详细错误信息，参考故障排查章节解决问题。

**Q: 如何更新组件？**

A: 重新运行部署脚本即可更新组件到最新版本。

## 参与贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 相关链接

- [项目主页](https://github.com/rz467fzs7d/openwrt-network-stack)
- [部署指南](../DEPLOYMENT-GUIDE.md)
- [AdGuard Home 配置](../adguardhome/CONFIGURATION.md)
- [OpenClash 配置](../clash/CONFIGURATION.md)
- [Sub-Store 文档](../sub-store/README.md)
