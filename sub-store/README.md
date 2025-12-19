# Sub Store 脚本

Sub Store 节点处理脚本，用于格式化节点地区信息和节点名称。

## 📁 脚本列表

### region-name-formatter.js

**高效的地区识别和格式化脚本**，通过节点名称匹配识别地区，并支持自定义名称格式化。

#### 特点

- ⚡ **极速**：< 0.1 秒处理 100 个节点
- 🌍 **广泛支持**：覆盖 40+ 国家/地区
- 🏷️ **多格式识别**：支持 emoji、中文、英文、城市名
- 🔌 **零依赖**：无需网络请求，完全本地处理
- 🎨 **灵活格式化**：支持自定义节点名称模板
- 📝 **标准化属性**：自动设置 code 和 region 属性

#### 核心功能

1. **地区识别**：从节点名称中识别地区信息
2. **属性设置**：设置标准化的 `code` 和 `region` 属性
3. **名称格式化**：使用模板自定义节点名称格式

#### 使用参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `format` | string | null | 节点名称格式模板（可选） |
| `setRegionAttributes` | boolean | true | 是否设置 region 和 code 属性 |
| `regionFormat` | string | "name_en" | region 属性格式（name_en/name_cn/code） |

#### format 模板占位符

| 占位符 | 说明 | 示例值 |
|--------|------|--------|
| `{flag}` | emoji 国旗 | 🇭🇰 |
| `{code}` | 地区代码 | HK |
| `{name_cn}` | 中文名称 | 香港 |
| `{name_en}` | 英文名称 | Hong Kong |
| `{name}` | 英文名称（等同 name_en） | Hong Kong |
| `{original}` | 原始节点名（去除地区信息） | IPLC-01 |

## 📋 使用场景

### 场景 1：添加地区属性（不改变节点名称）

**适用情况**：
- 节点没有 region/code 属性
- 需要为 Mihomo 筛选添加属性
- 保持原有节点名称不变

**配置**：
```json
{
  "setRegionAttributes": true,
  "regionFormat": "name_en"
}
```

**效果**：

输入节点：
```json
{
  "name": "🇭🇰 Hong Kong IPLC-01"
}
```

输出节点：
```json
{
  "name": "Hong Kong IPLC-01",
  "code": "HK",
  "region": "Hong Kong"
}
```

### 场景 2：统一节点名称格式（无 emoji）

**适用情况**：
- 希望节点名称简洁统一
- 移除所有 emoji 和地区标识
- 保留原始节点信息

**配置**：
```json
{
  "format": "{original}",
  "setRegionAttributes": true
}
```

**效果**：

输入：`🇭🇰 香港 IPLC-01` → 输出：
```json
{
  "name": "IPLC-01",
  "code": "HK",
  "region": "Hong Kong"
}
```

### 场景 3：统一添加英文地区前缀

**适用情况**：
- 希望节点名称包含地区信息
- 使用英文便��识别
- 去除 emoji

**配置**：
```json
{
  "format": "{name_en} {original}",
  "setRegionAttributes": true
}
```

**效果**：

| 输入 | 输出名称 | code | region |
|------|----------|------|--------|
| 🇭🇰 香港 01 | Hong Kong 01 | HK | Hong Kong |
| 🇯🇵 Tokyo-Premium | Japan Tokyo-Premium | JP | Japan |
| 🇺🇸 美国高速 | United States 高速 | US | United States |

### 场景 4：添加 emoji + 代码前缀

**适用情况**：
- 保留 emoji 视觉标识
- 添加地区代码方便识别
- 统一格式

**配置**：
```json
{
  "format": "{flag} {code} {original}",
  "setRegionAttributes": true
}
```

**效果**：

输入：`香港 IPLC-01` → 输出：
```json
{
  "name": "🇭🇰 HK IPLC-01",
  "code": "HK",
  "region": "Hong Kong"
}
```

### 场景 5：中文地区名称

**适用情况**：
- 偏好中文显示
- 本地化需求

**配置**：
```json
{
  "format": "{name_cn} {original}",
  "setRegionAttributes": true,
  "regionFormat": "name_cn"
}
```

**效果**：

输入：`🇭🇰 HK-01` → 输出：
```json
{
  "name": "香港 01",
  "code": "HK",
  "region": "香港"
}
```

### 场景 6：仅代码格式

**适用情况**：
- 极简风格
- 减少名称长度

**配置**：
```json
{
  "format": "{code}-{original}",
  "setRegionAttributes": true,
  "regionFormat": "code"
}
```

**效果**：

输入：`🇭🇰 香港 IPLC Premium` → 输出：
```json
{
  "name": "HK-IPLC Premium",
  "code": "HK",
  "region": "HK"
}
```

## 🛠️ 在 Sub Store 中配置

### 步骤

1. 打开 Sub Store Web 界面：http://127.0.0.1:3001
2. 进入订阅编辑页面
3. 点击"操作器" → "添加操作器"
4. 选择"脚本操作器"
5. 上传 `scripts/region-name-formatter.js`
6. 配置参数（JSON 格式）

### 常用配置示例

**推荐配置（Mihomo 用户）**：
```json
{
  "format": "{name_en} {original}",
  "setRegionAttributes": true,
  "regionFormat": "name_en"
}
```

**极简配置**：
```json
{
  "format": "{original}",
  "setRegionAttributes": true
}
```

**保留 emoji**：
```json
{
  "format": "{flag} {name_en} {original}",
  "setRegionAttributes": true
}
```

**仅设置属性（不改名）**：
```json
{
  "setRegionAttributes": true
}
```

## 🎯 与 Mihomo 配合使用

### 通过 code 筛选节点

脚本设置的 `code` 属性可用于精确筛选：

```yaml
proxy-groups:
  - name: Hong Kong
    type: url-test
    filter: "HK"  # 匹配 code: HK
    url: https://www.gstatic.com/generate_204
    interval: 300

  - name: Japan
    type: url-test
    filter: "JP"  # 匹配 code: JP
    url: https://www.gstatic.com/generate_204
    interval: 300
```

### 通过 region 筛选节点

```yaml
proxy-groups:
  - name: Hong Kong Nodes
    type: select
    filter: "Hong Kong"  # 匹配 region: Hong Kong
```

### 通过节点名称筛选

如果使用了 format，可以通过格式化后的名称筛选：

```yaml
# 假设 format: "{name_en} {original}"
proxy-groups:
  - name: All Hong Kong
    type: select
    filter: "^Hong Kong"  # 匹配以 "Hong Kong" 开头的节点
```

## 📖 支持的地区

脚本内置 40+ 个国家/地区的映射信息：

| 地区 | code | flag | name_cn | name_en | 识别关键词 |
|------|------|------|---------|---------|-----------|
| 香港 | HK | 🇭🇰 | 香港 | Hong Kong | 🇭🇰、香港、hong kong、hk |
| 台湾 | TW | 🇹🇼 | 台湾 | Taiwan | 🇹🇼、🏝️、台湾、taiwan、tw |
| 日本 | JP | 🇯🇵 | 日本 | Japan | 🇯🇵、日本、japan、tokyo、osaka |
| 美国 | US | 🇺🇸 | 美国 | United States | 🇺🇸、美国、us、seattle |
| 新加坡 | SG | 🇸🇬 | 新加坡 | Singapore | 🇸🇬、新加坡、singapore、sg |
| 韩国 | KR | 🇰🇷 | 韩国 | Korea | 🇰🇷、韩国、korea、seoul |
| ... | ... | ... | ... | ... | ... |

*查看脚本源码获取完整列表*

## 🔍 故障排查

### 问题：节点未识别地区

**原因**：节点名称不包含任何地区关键词

**检查**：
1. 查看 Sub Store 日志：`未能识别地区: xxx`
2. 确认节点名称是否包含地区信息

**解决**：
- 在 `REGION_MAP` 中添加自定义关键词
- 或手动为节点添加地区标识

### 问题：format 模板不生效

**原因**：可能 format 参数格式错误

**检查**：
1. 确认 JSON 格式正确
2. 确认占位符拼写正确（区分大小写）
3. 使用双引号而非单引号

**正确示例**：
```json
{
  "format": "{flag} {name_en}"
}
```

**错误示例**：
```json
{
  format: '{flag} {name_en}'  // 错误：缺少双引号
}
```

### 问题：{original} 为空

**原因**：节点名称全部是地区信息，没有其他内容

**示例**：
- 输入：`🇭🇰 Hong Kong`
- `{original}` = ""（空）

**解决**：
- 使用不包含 `{original}` 的 format
- 例如：`"{flag} {code}"`

### 问题：节点名称有多余空格

**原因**：format 模板中包含多余空格

**解决**：
脚本会自动清理多余空格，但如果仍有问题：
- 检查 format 模板
- 使用单个空格分隔占位符

## 🎨 高级用法

### 自定义分隔符

```json
{
  "format": "{flag}|{code}|{original}"
}
```
输出：`🇭🇰|HK|IPLC-01`

### 条件格式（通过多个订阅实现）

为不同订阅使用不同格式：

**订阅 1（高端线路）**：
```json
{
  "format": "⭐ {name_en} {original}"
}
```

**订阅 2（普通线路）**：
```json
{
  "format": "{name_en} {original}"
}
```

### 添加自定义前后缀

```json
{
  "format": "[{code}] {original} | {name_cn}"
}
```
输出：`[HK] IPLC-01 | 香港`

## 🛠️ 自定义开发

### 添加新地区

编辑脚本中的 `REGION_MAP`：

```javascript
const REGION_MAP = {
    // 现有映射...

    // 添加新地区
    'BR': {
        keywords: ['🇧🇷', '巴西', 'brazil', 'br', 'sao paulo'],
        flag: '🇧🇷',
        code: 'BR',
        name_cn: '巴西',
        name_en: 'Brazil',
        name: 'Brazil'
    },
};
```

### 修改关键��优先级

地区匹配按 `REGION_MAP` 的顺序进行，调整顺序可改变优先级：

```javascript
const REGION_MAP = {
    // 将常用地区放在前面，提高匹配速度
    'HK': { /* ... */ },
    'JP': { /* ... */ },
    'US': { /* ... */ },
    // 其他地区...
};
```

## 📚 API 参考

### 脚本输入

```javascript
// 节点对象
{
  name: "🇭🇰 Hong Kong IPLC-01",
  server: "example.com",
  port: 443,
  // ... 其他代理配置
}
```

### 脚本输出

```javascript
// 处理后的节点对象
{
  name: "Hong Kong IPLC-01",        // 格式化后的名称
  server: "example.com",
  port: 443,
  code: "HK",                       // 新增：地区代码
  region: "Hong Kong",              // 新增：地区名称
  // ... 其他配置保持不变
}
```

### Sub Store API

脚本使用的 Sub Store API：

```javascript
const $ = $substore;

// 日志
$.info('信息日志');
$.warn('警告日志');
$.error('错误日志');

// 参数
const { format, setRegionAttributes } = $arguments;
```

## 🤝 贡献

欢迎提交 Pull Request！

- 添加新的地区映射
- 改进地区识别算法
- 优化名称清理逻辑

## 📄 许可证

MIT License

## 🔗 相关链接

- [Sub Store 官方文档](https://github.com/sub-store-org/Sub-Store)
- [Mihomo 配置文档](../clash/README.md)
