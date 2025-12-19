# Sub-Store 节点重命名脚本

## node-renamer.js

智能节点重命名脚本，用于 Sub-Store 订阅管理。

### 核心功能

- ✅ **智能地区识别**：支持 42 个国家/地区（emoji、中文、英文）
- ✅ **运营商识别**：识别 20+ 运营商（ATT、Hinet、TMNet、NTT、Softbank等）
- ✅ **连接类型识别**：IPLC专线、家宽、企业等
- ✅ **网络标签识别**：BGP、CN2、5G等
- ✅ **自动设置属性**：为节点添加 `code` 和 `region` 属性（用于 Mihomo/Clash Meta 筛选）
- ✅ **完全自定义格式**：灵活的占位符模板系统
- ✅ **高性能**：纯本地处理，无需网络请求，100个节点 < 0.1秒
- ✅ **索引格式化**：支持补零序号（如 01, 02, 03）

### 支持的国家/地区（42个）

**亚洲**：
- 香港 (HK)、台湾 (TW)、日本 (JP)、韩国 (KR)、新加坡 (SG)
- 马来西亚 (MY)、泰国 (TH)、越南 (VN)、印度尼西亚 (ID)、菲律宾 (PH)
- 印度 (IN)、孟加拉国 (BD)

**美洲**：
- 美国 (US)、加拿大 (CA)、巴西 (BR)、阿根廷 (AR)、智利 (CL)、墨西哥 (MX)

**欧洲**：
- 英国 (UK)、德国 (DE)、法国 (FR)、荷兰 (NL)、意大利 (IT)、西班牙 (ES)
- 瑞典 (SE)、瑞士 (CH)、挪威 (NO)、芬兰 (FI)、丹麦 (DK)
- 波兰 (PL)、奥地利 (AT)、比利时 (BE)、捷克 (CZ)、葡萄牙 (PT)
- 希腊 (GR)、匈牙利 (HU)、爱尔兰 (IE)

**其他**：
- 澳大利亚 (AU)、新西兰 (NZ)、南非 (ZA)、尼日利亚 (NG)
- 俄罗斯 (RU)、土耳其 (TR)

### 支持的运营商（20+）

- **美国**：ATT
- **台湾**：Hinet、Sonet
- **日本**：NTT、Softbank
- **韩国**：KT、SK
- **新加坡**：Singtel、Starhub
- **马来西亚**：TMNet
- **中国**：CMCC(移动)、CU(联通)、CT(电信)

### 占位符说明

| 占位符 | 说明 | 示例输出 |
|--------|------|----------|
| `{countryFlag}` | 国旗 emoji | 🇭🇰 |
| `{countryCode}` | 国家代码 | HK |
| `{countryNameCN}` | 中文国家名 | 香港 |
| `{countryName}` | 英文国家名 | Hong Kong |
| `{ispCode}` | 运营商代码 | ATT, HINET, TMNET |
| `{iplc}` | IPLC专线标识 | IPLC（识别到时显示） |
| `{otherTags}` | 其他标签 | Home, BGP, CN2, 5G, Enterprise |
| `{index}` | 地区内序号 | 1, 2, 3... |
| `{index:Nd}` | N位补零序号 | 01, 02（N=2） |
| `{original}` | 剩余原始文本 | 保留未处理的文本 |

### 使用方法

#### 在 Sub-Store 中配置

通过 CDN 引用（推荐）：
```
https://cdn.jsdelivr.net/gh/<username>/<repo>/vendor/openwrt-network-stack/sub-store/scripts/node-renamer.js
```

#### 参数配置

```javascript
{
  "type": "Script Operator",
  "args": {
    "format": "{countryName} {iplc} {ispCode} {index:2d}",
    "connector": " "
  }
}
```

**参数说明**：
- `format`（可选）：节点名称格式模板
  - 不设置：保留原名称，仅去除 emoji 和地区关键词
  - 设置模板：按模板格式化节点名称
- `connector`（可选，默认空格）：连接符，用于连接各个非空字段

### 格式模板示例

#### 1. 完整格式（推荐）
```javascript
"{countryName} {iplc} {ispCode} {index:2d} {otherTags}"
```
输出示例：
- `Hong Kong 01`
- `Hong Kong IPLC 02`
- `Japan IPLC SONET 01`
- `United States IPLC ATT 01`
- `Malaysia TMNET Home 01`

#### 2. 简洁格式
```javascript
"{countryName} {ispCode} {index:2d}"
```
输出示例：
- `Hong Kong 01`
- `Japan SONET 02`
- `United States ATT 01`

#### 3. 紧凑格式（无空格）
```javascript
"{countryName}{ispCode}{index:02d}"
```
输出示例：
- `HongKong01`
- `JapanSONET02`
- `UnitedStatesATT01`

#### 4. 带国旗格式
```javascript
"{countryFlag} {countryNameCN} {ispCode}"
```
输出示例：
- `🇭🇰 香港`
- `🇯🇵 日本 SONET`
- `🇺🇸 美国 ATT`

#### 5. 代码格式（最简）
```javascript
"{countryCode}-{index:02d}"
```
输出示例：
- `HK-01`
- `JP-02`
- `US-03`

#### 6. 自定义连接符
```javascript
{
  "format": "{countryCode}-{countryName}-{index}",
  "connector": "-"
}
```
输出示例：
- `HK-Hong-Kong-01`
- `JP-Japan-02`

### 节点属性

脚本会自动为每个节点添加以下属性（无论是否设置 format）：

```javascript
proxy.code = "HK"              // 国家代码
proxy.region = "Hong Kong"     // 英文地区名
```

这些属性可用于 Mihomo/Clash Meta 的规则筛选：
```yaml
# 选择所有香港节点
proxy-groups:
  - name: 香港节点
    type: select
    filter: code=HK
```

### 性能指标

基于 41 个节点的基准测试：
- ✅ **识别准确率**：100% (41/41)
- ✅ **处理速度**：< 20ms / 41节点
- ✅ **内存占用**：低，适合大量节点批量处理

### 测试验证

#### 运行基准测试
```bash
cd /path/to/sub-store/test
node run-benchmark.js
```

测试输出示例：
```
╔═══════════════════════════════════════════════════════════════╗
║         节点重命名脚本 - 基准测试                              ║
╚═══════════════════════════════════════════════════════════════╝

📦 测试数据集: 41 个节点
🎯 测试格式数: 5 种

================================================================================
测试格式: 完整格式（推荐）
模板: {countryName} {iplc} {ispCode} {index:2d} {otherTags}
================================================================================

✅ 处理完成: 41/41 个节点
⏱️  耗时: 15 ms

📋 转换结果示例（前10个）:
  01. Hong Kong 01 (HK/Hong Kong)
  02. Hong Kong 02 (HK/Hong Kong)
  03. Hong Kong 03 (HK/Hong Kong)
  ...

✅ 所有验证通过！
```

#### 测试文件说明
```
test/
├── benchmark-dataset.js    # 标准测试数据集（41个节点）
├── run-benchmark.js        # 自动化测试运行器
├── sub.txt                 # 原始测试数据源
└── README.md               # 测试说明文档
```

### 更新日志

#### 2025-12-19 - v1.2
- ✅ 添加尼日利亚 (NG) 和孟加拉国 (BD) 支持
- ✅ 修复 $.warn 函数调用错误（Sub-Store 环境不支持）
- ✅ 修复生产环境下未识别地区导致后续节点重命名失败的问题

#### 2025-12-19 - v1.1
- ✅ 修复正则表达式转义问题
- ✅ 改进字符串组装逻辑，智能过滤空字段
- ✅ 优化空格处理，避免多余空格
- ✅ 脚本更名为 node-renamer.js

#### 2025-12-19 - v1.0
- 🎉 初始版本发布

### 故障排查

#### 问题：部分节点未重命名

**可能原因**：
1. 地区未在 REGION_MAP 中定义
2. 节点名称格式特殊，关键词匹配失败

**解决方法**：
1. 检查 OpenWrt Docker 日志：
   ```bash
   docker logs sub-store 2>&1 | grep -A 5 "未能识别地区"
   ```
2. 如果发现未支持的地区，请提交 Issue 或 PR

#### 问题：格式化结果有多余空格

**原因**：使用了旧版本脚本

**解决方法**：升级到最新版 node-renamer.js

#### 问题：Emoji 未正确显示

**原因**：终端或客户端不支持 emoji

**解决方法**：使用不包含 emoji 的格式模板（如 `{countryName}` 代替 `{countryFlag}`）

### 相关链接

- **测试文档**：`/test/README.md`
- **基准测试**：`/test/run-benchmark.js`
- **测试数据集**：`/test/benchmark-dataset.js`

### 贡献

欢迎提交 Issue 和 Pull Request！

需要添加新的国家/地区或运营商支持，请在 REGION_MAP 或 ISP_MAP 中添加相应条目。

### 许可证

MIT License
