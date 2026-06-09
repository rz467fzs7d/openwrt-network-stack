# Sub Store 完整方案

本目录包含 Sub Store 的完整解决方案，从部署到脚本使用。

## 📁 目录结构

```
sub-store/
├── docker/          # Docker 部署文件
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── OPENWRT-GUIDE.md      # OpenWrt 部署指南
│   └── README.md             # Docker 镜像说明
├── scripts/         # 节点处理脚本
│   ├── node-renamer.js       # 智能节点重命名脚本
│   └── README.md             # 脚本详细文档
└── test/           # 测试和基准测试
    ├── benchmark-dataset.js  # 标准测试数据集
    ├── run-benchmark.js      # 自动化测试运行器
    └── README.md             # 测试说明
```

## 🚀 快速开始

### 1. 部署 Sub Store

使用 Docker 部署 Sub Store 服务（优化镜像，体积减小 37.5%）：

```bash
cd sub-store/docker
docker-compose up -d
```

详细部署说明请参见：[docker/README.md](docker/README.md)
OpenWrt 特定配置请参见：[docker/OPENWRT-GUIDE.md](docker/OPENWRT-GUIDE.md)

### 2. 使用节点重命名脚本

在 Sub Store 中配置操作器，使用智能节点重命名脚本：

**CDN URL**：
```
https://cdn.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@main/sub-store/scripts/node-renamer.js
```

**功能特性**：
- ✅ 支持 42 个国家/地区识别
- ✅ 识别 20+ 运营商（ATT、Hinet、TMNet 等）
- ✅ 识别 IPLC 专线和网络标签
- ✅ 自动设置 `code` 和 `region` 属性
- ✅ 完全自定义格式化模板
- ✅ 高性能处理（< 0.1s / 100节点）

详细使用说明请参见：[scripts/README.md](scripts/README.md)

## 📖 文档索引

| 文档 | 说明 |
|------|------|
| [docker/README.md](docker/README.md) | Docker 镜像和部署说明 |
| [docker/OPENWRT-GUIDE.md](docker/OPENWRT-GUIDE.md) | OpenWrt 部署完整指南 |
| [scripts/README.md](scripts/README.md) | 节点重命名脚本详细文档 |
| [test/README.md](test/README.md) | 测试和基准测试说明 |

## 🎯 使用场景

### 场景 1: 为节点添加地区属性

如果你的节点没有 `code` 和 `region` 属性，用于 Mihomo 的规则筛选：

1. 部署 Sub Store
2. 添加订阅，配置操作器
3. 使用 node-renamer.js，参数留空或 `{}`
4. 节点将自动获得 `code` 和 `region` 属性

### 场景 2: 格式化节点名称

如果你想统一节点命名格式，提取 IPLC 等信息：

1. 使用 node-renamer.js
2. 配置 format 参数：
   ```json
   {
     "format": "{countryName} {iplc} {index:2d}",
     "connector": " "
   }
   ```
3. 节点名称将被格式化为：`Hong Kong IPLC 01`

### 场景 3: 本地测试和验证

在部署前测试脚本功能：

```bash
cd test
node run-benchmark.js
```

运行基准测试，验证 41 个节点的识别准确率和性能。

## 🔗 相关链接

- **主仓库**: [openwrt-network-stack](https://github.com/rz467fzs7d/openwrt-network-stack)
- **独立 Docker 项目**: [sub-store-docker](https://github.com/rz467fzs7d/sub-store-docker)
- **Sub Store 官方**: [Sub-Store](https://github.com/sub-store-org/Sub-Store)

## 📝 更新日志

### 2025-12-20
- 🎉 整合 Docker 部署文件到 sub-store/docker/
- 📚 重组目录结构，提供完整的 Sub Store 方案

### 2025-12-19
- ✅ 添加 node-renamer.js（支持 42 个国家/地区）
- ✅ 添加完整的测试和基准测试套件
- ✅ 提供详细的使用文档

## 📄 许可证

MIT License
