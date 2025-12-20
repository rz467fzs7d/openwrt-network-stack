# OpenWrt Network Stack

OpenWrt 网络栈完整方案：从 DNS 解析到代理流量，再到订阅管理的全链路配置。

> 🚀 **完整部署指南**: 查看 [DEPLOYMENT-GUIDE.md](DEPLOYMENT-GUIDE.md) 了解从 AdGuardHome → OpenClash → Sub-Store 的完整架构和部署步骤。

## 📦 项目结构

```
openwrt-network-stack/
├── clash/              # Clash/Mihomo 配置模板
│   ├── config/         # 配置文件目录
│   │   └── config-mihomo.yaml.example  # Mihomo 配置模板
│   └── rules/          # 自定义路由规则
│       ├── direct.yaml # 直连规则
│       └── proxy.yaml  # 代理规则
├── sub-store/          # Sub Store 完整方案
│   ├── docker/         # Docker 部署文件
│   │   ├── Dockerfile
│   │   ├── docker-compose.yml
│   │   └── OPENWRT-GUIDE.md
│   ├── scripts/        # 节点处理脚本
│   │   └── node-renamer.js  # 智能节点重命名脚本
│   └── test/           # 测试和基准测试
├── adguardhome/        # AdGuardHome 配置和规则
└── docs/               # 文档和教程
```

## 🚀 功能特性

### Clash/Mihomo 配置
- ✅ 完整的 Mihomo (Clash Meta) 配置模板
- ✅ 使用 YAML 锚点实现模块化管理
- ✅ 智能路由策略（Smart Group）
- ✅ 多地区节点自动选择（URL Test、Fallback）
- ✅ 分应用代理策略（AI 服务、流媒体、开发工具等）
- ✅ 完善的中国路由和 DNS 配置
- ✅ 自定义路由规则（direct/proxy）

### Sub Store 脚本
- ✅ 智能地区识别（支持 42 个国家/地区）
- ✅ 运营商识别（20+ 运营商）
- ✅ IPLC专线和网络标签识别
- ✅ 节点名称格式化和清理
- ✅ 自动设置 code 和 region 属性
- ✅ 高性能处理（< 0.1s 处理 100 个节点）

### AdGuardHome
- 🚧 广告拦截列表（即将添加）
- 🚧 DNS 过滤规则（即将添加）

## 📖 快速开始

### 部署 Sub Store（前置步骤）

Sub Store 用于管理代理订阅和处理节点信息，建议先部署。

本仓库已集成优化的 Sub Store Docker 部署文件（镜像体积减小 37.5%，集成 mihomo 和通知功能）。

**Docker Compose 部署（推荐）**：

```bash
# 方式1: 使用本仓库（已集成）
git clone https://github.com/rz467fzs7d/openwrt-network-stack.git
cd openwrt-network-stack/sub-store/docker
docker-compose up -d

# 方式2: 使用独立项目
git clone https://github.com/rz467fzs7d/sub-store-docker.git
cd sub-store-docker
docker-compose up -d
```

**Docker CLI 部署**：

```bash
docker run -d \
  --name sub-store \
  -p 3001:3001 \
  -v /path/to/data:/opt/app/data \
  --restart unless-stopped \
  rz467fzs7d/sub-store:latest
```

访问 Sub Store：http://YOUR_OPENWRT_IP:3001

**OpenWrt 注意事项**：
- 配置 DNS 和防火墙规则
- 确保 3001 端口可访问
- 详细部署指南参见 [sub-store/docker/OPENWRT-GUIDE.md](sub-store/docker/OPENWRT-GUIDE.md)

### Clash/Mihomo 配置

1. 复制配置模板：
```bash
cp clash/config/config-mihomo.yaml.example /etc/mihomo/config.yaml
```

2. 修改以下部分：
   - `proxy-providers`: 修改订阅 URL
   - 内网 IP 段（如有需要）
   - 公司内网域名（如有需要）

3. 验证配置：
```bash
mihomo -t -d /etc/mihomo
```

4. 启动服务：
```bash
systemctl restart mihomo
```

### Sub Store 脚本

**node-renamer.js** - 智能节点重命名

特点：
- 🚀 最快：< 0.1 秒处理 100 个节点
- 🌍 支持 42 个国家/地区
- 🏷️ 识别 emoji、中文、英文、城市名
- 🔌 识别 IPLC 专线和 20+ 运营商
- 🏠 识别连接类型（家宽、企业）
- 🌐 识别网络标签（BGP、CN2、5G）
- 📝 支持完全自定义格式化模板
- ⚡ 无需网络请求，纯本地处理

使用场景：
1. **增加节点属性**：为节点添加标准化的 `code` 和 `region` 属性
2. **批量格式化节点名称**：根据模板重新命名节点（支持 IPLC/运营商/标签识别）
3. **Mihomo 规则筛选**：自动设置属性用于 Clash Meta 的智能筛选

使用方法：
1. 在 Sub Store 订阅中添加"操作器"
2. 选择"脚本操作器"
3. 使用 CDN URL：
   ```
   https://cdn.jsdelivr.net/gh/<username>/openwrt-network-stack@main/sub-store/scripts/node-renamer.js
   ```
4. 配置参数（可选）：
   - 不配置或 `{}`：仅添加地区属性，保留原名称
   - 完整格式：`{ "format": "{countryName} {iplc} {ispCode} {index:2d} {otherTags}" }`
   - 简洁格式：`{ "format": "{countryName} {ispCode} {index:2d}" }`
   - 带国旗：`{ "format": "{countryFlag} {countryNameCN} {ispCode}" }`

详细说明参见 [Sub Store 脚本文档](sub-store/scripts/README.md)

## 📝 配置说明

### Clash 关键配置

**代理组类型**：
- `select`: 手动选择
- `url-test`: 基于延迟自动选择
- `fallback`: 故障自动转移
- `smart`: 智能选择（基于机器学习）

**节点筛选关键词**：
```yaml
x-keywords:
  hong-kong: &HONG_KONG_KEYWORDS "香港|HK|hongkong|hong kong"
  taiwan: &TAIWAN_KEYWORDS "台湾|TW|taiwan"
  japan: &JAPAN_KEYWORDS "日本|JP|japan"
  # ... 更多地区
```

**应用策略模板**：
- `APPLICATION_POLICY_BASE`: Smart 优先（适合国际服务）
- `APPLICATION_POLICY_DIRECT_FIRST`: DIRECT 优先（适合国内服务）

### 超时参数调优

所有超时参数默认为 300ms，可根据实际网络情况调整：

| 参数位置 | 推荐值 | 说明 |
|---------|--------|------|
| Proxy Provider 健康检查 | 3000-5000ms | Sub Store 需要时间获取元数据 |
| URL Test 超时 | 2000-5000ms | 远距离节点需要更多时间 |
| Fallback 超时 | 2000-3000ms | 避免频繁切换 |

## 🛠️ 高级用法

### 自定义规则集

本项目提供两个自定义规则文件：

- `clash/rules/direct.yaml` - 强制直连规则（Plex、IP 检测等）
- `clash/rules/proxy.yaml` - 强制代理规则（AdGuard DNS、媒体服务等）

**在配置中引用**：

```yaml
rule-providers:
  CUSTOM-DIRECT:
    type: http
    behavior: classical
    interval: 86400
    url: "https://cdn.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@main/clash/rules/direct.yaml"
    path: ./rule-providers/custom-direct.yaml

  CUSTOM-PROXY:
    type: http
    behavior: classical
    interval: 86400
    url: "https://cdn.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@main/clash/rules/proxy.yaml"
    path: ./rule-providers/custom-proxy.yaml

rules:
  # 在其他规则之前添加
  - RULE-SET,CUSTOM-DIRECT,DIRECT
  - RULE-SET,CUSTOM-PROXY,PROXY
```

**Fork 后自定义**：

1. Fork 本仓库到你的账号
2. 修改 `clash/rules/*.yaml` 文件
3. 更新配置中的 URL 为你的仓库地址

详细说明参见 [自定义规则文档](clash/rules/README.md)

### 内网办公网络

如果需要通过特定节点访问公司内网：

```yaml
# 1. 定义内网 IP 段
rules:
  - IP-CIDR,192.168.x.0/24,Office,no-resolve

# 2. 定义内网域名
  - DOMAIN-SUFFIX,company.internal,Office
  - DOMAIN-SUFFIX,git.company.com,Office

# 3. 跳过内网域名的嗅探
sniffer:
  skip-domain:
    - "company.internal"
    - "intranet.company.com"
```

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
