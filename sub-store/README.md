# Sub Store 完整方案

本目录包含 Sub Store 的完整解决方案，从部署到脚本使用。

## 📁 目录结构

```
sub-store/
├── docker/          # Docker 部署文件
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── OPENWRT-GUIDE.md      # OpenWrt 部署指南
└── scripts/         # 节点处理脚本与测试
│   ├── parser.js             # 智能节点处理脚本
    ├── parser.test.js        # 重命名与地区识别测试
    ├── parser.google.test.js # Google 检测测试
    └── README.md             # 脚本详细文档
```

## 🚀 快速开始

### 1. 部署 Sub Store

使用 Docker 部署 Sub Store 服务：

```bash
cd sub-store/docker
docker-compose up -d
```

详细部署说明请参见：[INSTALLATION.md](INSTALLATION.md)
OpenWrt 特定配置请参见：[docker/OPENWRT-GUIDE.md](docker/OPENWRT-GUIDE.md)

### 2. 使用节点重命名脚本

在 Sub Store 中配置操作器，使用智能节点重命名脚本：

**CDN URL**：
```
https://fastly.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@2329571/sub-store/scripts/parser.js
```

**功能特性**：
- ✅ 支持动态地区识别与 HTTP META region 回填
- ✅ 识别 IPLC / UDPN / HOME 主标签
- ✅ 自动设置 `region` 相关属性
- ✅ 完全自定义格式化模板
- ✅ 支持缓存、排序、拍平与批量处理
- ✅ 模板含 `{region*}` 时检测 Google / YouTube 送中情况，默认范围为亚洲
- ✅ 使用 `{region*}` 将送中标记嵌入地区字段，例如 `ENET-HK*-02`

详细使用说明请参见：[scripts/README.md](scripts/README.md)

## 📖 文档索引

| 文档 | 说明 |
|------|------|
| [INSTALLATION.md](INSTALLATION.md) | Docker 镜像和部署说明 |
| [docker/OPENWRT-GUIDE.md](docker/OPENWRT-GUIDE.md) | OpenWrt 部署完整指南 |
| [scripts/README.md](scripts/README.md) | 节点重命名脚本详细文档 |

## 🎯 使用场景

### 场景 1: 为节点添加地区属性

如果你的节点没有 `code` 和 `region` 属性，用于 Mihomo 的规则筛选：

1. 部署 Sub Store
2. 添加订阅，配置操作器
3. 使用 `parser.js`，参数留空或 `{}`
4. 节点将自动获得 `region` 相关属性

### 场景 2: 格式化节点名称

如果你想统一节点命名格式，提取 IPLC 等信息：

1. 使用 `parser.js`
2. 配置 format 参数：
   ```json
   {
     "format": "{countryName} {tag:IPLC=iplc|专线} {index:2d}",
     "connector": " "
   }
   ```
3. 节点名称将被格式化为：`Hong Kong IPLC 01`

### 场景 3: 本地测试和验证

在部署前测试脚本功能：

```bash
node sub-store/scripts/parser.test.js
node --test sub-store/scripts/parser.google.test.js
```

在仓库根目录运行上述测试，验证地区识别、重命名、检测范围与缓存行为；这些测试不代表真实网络性能基准。

## 🔗 相关链接

- **主仓库**: [openwrt-network-stack](https://github.com/rz467fzs7d/openwrt-network-stack)
- **独立 Docker 项目**: [sub-store-docker](https://github.com/rz467fzs7d/sub-store-docker)
- **Sub Store 官方**: [Sub-Store](https://github.com/sub-store-org/Sub-Store)

## 📝 更新日志

### 2026-10-27

- 送中检测按需启用：仅当重命名模板包含 `{region*}` 时运行；`{region}` 或未设置模板不触发检测。
- 更新入口文档的脚本链接至 `2329571`，包含按需送中检测与地区标记功能。
- 检测方法参考 RegionRestrictionCheck，分别经节点访问 YouTube Premium 与 Google Play；请求失败或无法识别时视为未知，不据此标记送中，也不删除节点。
- 默认检测亚洲国家和地区（含港澳台、中亚、中东）。`exit_is_cn_check` 可指定原始节点名正则；显式空值关闭检测，`.*` 检测全部；`exit_is_cn_check_exclude` 可排除指定节点。
- 明确结果默认缓存 6 小时，任一检测未知时最长缓存 10 分钟；默认并发 2，每个请求超时 5 秒。缓存可用时复用结果，不重复探测。
- 推荐格式：`{prefix:ENET}{region*}{i:2d}{tag:Home=家宽|home}`。送中节点输出 `ENET-HK*-02`，普通节点输出 `ENET-HK-02`；原始地区属性保持不变。

**更新与迁移注意事项**：

- 旧参数 `cn_check` 改为 `exit_is_cn_check`；其他检测参数参见 [脚本文档](scripts/README.md#google--youtube-送中检测可选)。
- 使用 `{region*}` 时移除末尾 `{exit_is_cn}`，避免重复标记；旧 `{region}` 仍不显示标记。
- 星号从名称末尾移到地区后时，OpenClash 的送中筛选应由 `\*$` 改为 `\*`。
- 订阅服务可能按 User-Agent 返回不同协议或入口，检测结果仅对应实际返回的节点；不同客户端的结果可能不同。
- 更新脚本及操作器参数即可，无需重启 Sub-Store。已有订阅输出或客户端缓存需在刷新后才能看到新名称。
- 检测缓存时长与 Sub-Store 的 `scriptCacheTtl` 是独立设置；更新脚本不会修改服务全局缓存设置。

### 2025-12-20
- 🎉 整合 Docker 部署文件到 sub-store/docker/
- 📚 重组目录结构，提供完整的 Sub Store 方案

### 2025-12-19
- ✅ 添加 parser.js 节点处理脚本
- ✅ 添加完整的测试和基准测试套件
- ✅ 提供详细的使用文档

## 📄 许可证

项目许可证及第三方检测逻辑的授权说明请参见
[第三方声明](scripts/THIRD_PARTY_NOTICES.md)；RegionRestrictionCheck 相关检测逻辑遵循其 AGPL-3.0 授权。
