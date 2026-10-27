# OpenWrt Network Stack

围绕 OpenWrt 的网络配置与部署方案，整合 AdGuard Home DNS 过滤、OpenClash / Mihomo 分流与 Sub-Store 订阅管理，并提供节点重命名、出口地区识别和按需 Google / YouTube 送中检测。

> 🚀 **完整部署指南**: 查看 [DEPLOYMENT-GUIDE.md](DEPLOYMENT-GUIDE.md) 了解详细的部署步骤和配置说明。

## 📐 网络架构

### 拓扑结构

下图为同机部署示例，地址和端口需按实际环境调整。Sub-Store 也可独立部署在 NAS 等设备上；它向 OpenClash 提供订阅，不参与 DNS 查询或代理流量转发。

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
├── openclash/              # OpenClash/Mihomo 配置
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
- 基于内置 GeoSite/GeoIP 的智能分流 (国内直连/国外代理)，无第三方 rule-provider 依赖
- 多地区节点自动选择 + fallback 故障转移
- 分应用代理策略 (AI、流媒体)
- 自定义路由规则 (`openclash/rules/*.yaml`)
- 详细配置: [openclash/CONFIGURATION.md](openclash/CONFIGURATION.md)

### Sub-Store
- 订阅托管和转换
- 节点地区识别、HTTP META 出口探测与自定义重命名
- Home、IPLC、UDPN 标签识别，以及排序、拍平和缓存
- 模板使用 `{region*}` 时按需检测 Google / YouTube 送中情况，默认范围为亚洲国家和地区；使用 `{region}` 不执行送中检测
- 送中标记嵌入地区字段，例如 `ENET-HK*-02`；检测失败保持未知，不自动删除节点
- 支持检测范围、排除规则、并发、超时与缓存时长配置
- Docker 部署方案
- 详细文档: [sub-store/README.md](sub-store/README.md)

重命名示例（`f` / `format`）：

```text
{prefix:ENET}{region*}{i:2d}{tag:Home=家宽|home}
```

明确检测结果默认缓存 6 小时，任一检测未知时最长缓存 10 分钟。
Google 服务识别的地区不等同于普通 GeoIP 地区；具体判定方法和参数见
[脚本说明](sub-store/scripts/README.md#google--youtube-送中检测可选)。

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
| **OpenClash** | opkg | OpenWrt LuCI 界面 | [openclash/CONFIGURATION.md](openclash/CONFIGURATION.md) |
| **AdGuard Home** | opkg | `http://192.168.0.2:3000` | [adguardhome/CONFIGURATION.md](adguardhome/CONFIGURATION.md) |

### 3. 配置关键连接

- **AdGuard Home 上游 DNS**: `127.0.0.1:7874` (指向 OpenClash)
- **OpenClash 订阅源**: 来自 Sub-Store 的订阅链接

## 🛠️ 高级配置

- **自定义路由规则**: [openclash/rules/README.md](openclash/rules/README.md)
- **内网办公网络配置**: [openclash/rules/README.md#openclash-绕过黑名单](openclash/rules/README.md#-openclash-绕过黑名单bypass-blacklist)
- **节点重命名脚本**: [sub-store/scripts/README.md](sub-store/scripts/README.md)
- **完整部署指南**: [DEPLOYMENT-GUIDE.md](DEPLOYMENT-GUIDE.md)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

第三方检测逻辑的授权单独说明：Google / YouTube 检测参考 RegionRestrictionCheck，
相关逻辑遵循 AGPL-3.0，详见 [第三方声明](sub-store/scripts/THIRD_PARTY_NOTICES.md)。

## 🔗 相关链接

**本项目相关**：
- [Sub Store Docker](https://github.com/rz467fzs7d/sub-store-docker) - 优化的 Sub Store Docker 镜像

**官方项目**：
- [Mihomo 官方文档](https://wiki.metacubex.one/)
- [Sub Store 项目](https://github.com/sub-store-org/Sub-Store)
- [AdGuard Home](https://github.com/AdguardTeam/AdGuardHome)

**规则资源**：
- [GeoSite 数据 (Loyalsoldier)](https://github.com/Loyalsoldier/v2ray-rules-dat)
- [GeoIP 数据](https://github.com/MetaCubeX/meta-rules-dat)

## ⚠️ 免责声明

本项目仅供学习交流使用，请遵守当地法律法规。
