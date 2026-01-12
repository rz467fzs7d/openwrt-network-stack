# OpenWrt Network Stack

基于 OpenWrt 的完整网络解决方案：AdGuard Home (广告拦截) + OpenClash (智能分流) + Sub-Store (订阅管理)。

> 🚀 **完整部署指南**: 查看 [DEPLOYMENT-GUIDE.md](DEPLOYMENT-GUIDE.md) 了解详细的部署步骤和配置说明。

## 📐 网络架构

### 拓扑结构

```
                    互联网
                      ↑
                      │
              ┌───────┴────────┐
              │  主路由设备     │
              │  192.168.0.1   │
              │  (DHCP 服务器) │
              └───────┬────────┘
                      │
              ┌───────┴────────┐
              │  OpenWrt       │ (旁路由/Docker 宿主机)
              │  192.168.0.2   │
              │                │
              │  ┌──────────────────────────────┐
              │  │ 1️⃣ AdGuard Home              │
              │  │    - 端口: 53 (DNS)          │
              │  │    - 广告拦截 + DNS 缓存      │
              │  │    - 上游: 127.0.0.1:7874    │
              │  └─────────┬────────────────────┘
              │            ↓
              │  ┌──────────────────────────────┐
              │  │ 2️⃣ OpenClash / Mihomo        │
              │  │    - 端口: 7874 (DNS)        │
              │  │    - Fake-IP 分流            │
              │  │    - 智能代理路由             │
              │  └─────────┬────────────────────┘
              │            ↓
              │  ┌──────────────────────────────┐
              │  │ 3️⃣ Sub-Store (容器)          │
              │  │    - 端口: 3001 (Web UI)     │
              │  │    - 订阅管理 + 节点格式化    │
              │  └──────────────────────────────┘
              └────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ↓             ↓             ↓
   客户端 1       客户端 2       客户端 3
   192.168.0.101 192.168.0.102 192.168.0.103
```

### 关键配置

**主路由 (192.168.0.1)**
- DHCP 服务器配置：
  - IP 地址池: `192.168.0.101 - 192.168.0.254`
  - 网关: `192.168.0.1`
  - **DNS 服务器: `192.168.0.2`** (指向 OpenWrt 的 AdGuard Home)

**OpenWrt (192.168.0.2)**
- 静态 IP: `192.168.0.2`
- 运行服务:
  - AdGuard Home: 监听 `192.168.0.2:53`
  - OpenClash: DNS 端口 `127.0.0.1:7874`
  - Sub-Store (Docker): Web UI `192.168.0.2:3001`

### 流量路径

```
客户端 DNS 查询 (google.com)
    ↓
主路由 DHCP 广播的 DNS (192.168.0.2:53)
    ↓
AdGuard Home (广告过滤)
    ↓
OpenClash DNS (127.0.0.1:7874)
    ├─ 国内域名 → 真实 IP → 直连
    └─ 国外域名 → Fake IP → 代理节点
```

## ⚡ 快速开始

### 一键部署（推荐）

使用自动化部署脚本，快速完成所有组件的安装和配置：

```bash
# 下载部署脚本
wget https://raw.githubusercontent.com/rz467fzs7d/openwrt-network-stack/main/scripts/deploy.sh
chmod +x deploy.sh

# 运行部署
./deploy.sh
```

脚本将自动完成：
- ✅ AdGuard Home 安装和配置
- ✅ Docker 环境安装
- ✅ Sub-Store 容器部署
- ✅ OpenClash 配置辅助
- ✅ 网络配置验证

详细说明: [scripts/README.md](scripts/README.md)

### 手动部署

如需逐步了解每个组件的配置细节，请查看 [DEPLOYMENT-GUIDE.md](DEPLOYMENT-GUIDE.md)。

## 📦 项目结构

```
openwrt-network-stack/
├── clash/              # OpenClash/Mihomo 配置
│   ├── config/         # 配置模板
│   └── rules/          # 自定义规则集
├── sub-store/          # Sub-Store 订阅管理
│   ├── docker/         # Docker 部署方案
│   └── scripts/        # 节点处理脚本
├── adguardhome/        # AdGuard Home 配置
├── scripts/            # 一键部署脚本
│   ├── deploy.sh       # 主部署脚本
│   ├── lib/            # 函数库
│   └── config/         # 配置文件
└── DEPLOYMENT-GUIDE.md # 完整部署文档
```

## 🚀 核心功能

### AdGuard Home
- 广告拦截和隐私保护
- DNS 缓存加速
- 查询日志和统计
- 详细配置: [adguardhome/CONFIGURATION.md](adguardhome/CONFIGURATION.md)

### OpenClash / Mihomo
- 智能分流 (国内直连/国外代理)
- 多地区节点自动选择
- 分应用代理策略 (AI、流媒体、开发工具)
- 自定义路由规则
- 详细配置: [clash/CONFIGURATION.md](clash/CONFIGURATION.md)

### Sub-Store
- 订阅托管和转换
- 智能节点重命名 (42 个国家/地区)
- 运营商和 IPLC 专线识别
- Docker 部署方案 (镜像体积减少 37.5%)
- 详细文档: [sub-store/README.md](sub-store/README.md)

## 📖 快速开始

### 1. 主路由 DHCP 配置

在主路由 (192.168.0.1) 配置 DHCP 选项 6，将 DNS 服务器指向 OpenWrt (192.168.0.2)：

```bash
# OpenWrt 主路由命令行
uci set dhcp.lan.dhcp_option="6,192.168.0.2"
uci commit dhcp
/etc/init.d/dnsmasq restart
```

完成后，客户端通过 DHCP 获取的 DNS 将指向 `192.168.0.2`。

### 2. 按顺序部署三个组件

| 组件 | 部署方式 | 访问地址 | 详细文档 |
|------|---------|---------|---------|
| **Sub-Store** | Docker | `http://192.168.0.2:3001` | [sub-store/README.md](sub-store/README.md) |
| **OpenClash** | opkg | OpenWrt LuCI 界面 | [clash/CONFIGURATION.md](clash/CONFIGURATION.md) |
| **AdGuard Home** | opkg | `http://192.168.0.2:3000` | [adguardhome/CONFIGURATION.md](adguardhome/CONFIGURATION.md) |

### 3. 配置关键连接

- **AdGuard Home 上游 DNS**: `127.0.0.1:7874` (指向 OpenClash)
- **OpenClash 订阅源**: 来自 Sub-Store 的订阅链接

## 🛠️ 高级配置

- **自定义路由规则**: [clash/rules/README.md](clash/rules/README.md)
- **内网办公网络配置**: [clash/rules/README.md#openclash-绕过黑名单](clash/rules/README.md#-openclash-绕过黑名单bypass-blacklist)
- **节点重命名脚本**: [sub-store/scripts/README.md](sub-store/scripts/README.md)
- **完整部署指南**: [DEPLOYMENT-GUIDE.md](DEPLOYMENT-GUIDE.md)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🔗 相关链接

**本项目相关**：
- [Sub Store Docker](https://github.com/rz467fzs7d/sub-store-docker) - 优化的 Sub Store Docker 镜像

**官方项目**：
- [Mihomo 官方文档](https://wiki.metacubex.one/)
- [Sub Store 项目](https://github.com/sub-store-org/Sub-Store)
- [AdGuard Home](https://github.com/AdguardTeam/AdGuardHome)

**规则资源**：
- [Clash 规则集](https://github.com/blackmatrix7/ios_rule_script)
- [GeoIP 数据](https://github.com/MetaCubeX/meta-rules-dat)

## ⚠️ 免责声明

本项目仅供学习交流使用，请遵守当地法律法规。
