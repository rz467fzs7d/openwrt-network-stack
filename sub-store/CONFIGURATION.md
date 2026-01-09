# Sub-Store 配置指南

Sub-Store Web 界面的使用说明，包含订阅管理、节点处理、脚本配置等功能。

> 💡 **安装方法**: 查看 [INSTALLATION.md](INSTALLATION.md) 了解如何安装 Sub-Store
> 💡 **部署流程**: 查看 [DEPLOYMENT-GUIDE.md](../DEPLOYMENT-GUIDE.md) 了解完整的网络栈集成

## 目录

- [Web 界面访问](#web-界面访问)
- [订阅管理](#订阅管理)
- [节点处理脚本](#节点处理脚本)
- [订阅转换](#订阅转换)
- [与 OpenClash 集成](#与-openclash-集成)
- [常见问题](#常见问题)

---

## Web 界面访问

部署完成后，访问 Sub-Store Web 界面：

```
http://192.168.0.2:3001
```

首次访问会看到欢迎页面，可以开始添加订阅。

---

## 订阅管理

### 添加订阅源

1. 点击左侧 **订阅** 菜单
2. 点击右上角 **+** 按钮
3. 填写订阅信息：
   - **名称**: 订阅的显示名称（如 "Sub 01"）
   - **类型**: 选择订阅类型（通常选 "通用"）
   - **URL**: 填入订阅链接
4. 点击 **保存**

### 订阅类型

| 类型 | 说明 | 适用场景 |
|------|------|---------|
| 通用 | 标准订阅格式 | 大多数机场订阅 |
| Clash | Clash 配置 | 已有 Clash 配置 |
| Surge | Surge 配置 | Surge 用户 |

### 查看节点

点击订阅名称，可以查看订阅包含的所有节点。

---

## 节点处理脚本

Sub-Store 最强大的功能是通过"操作器"处理节点。

### 添加脚本操作器

1. 进入订阅详情页
2. 点击 **操作器** 标签
3. 点击 **添加操作器** → **脚本操作器**
4. 填写脚本信息：
   - **名称**: 操作器名称（如 "节点重命名"）
   - **脚本 URL**: 填入脚本地址
   - **参数**: 脚本配置参数（JSON 格式）
5. 点击 **保存**

### 使用节点重命名脚本

本项目提供了强大的节点重命名脚本：

**脚本 URL**:
```
https://cdn.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@main/sub-store/scripts/node-renamer.js
```

**参数配置示例**:

**最简单配置**（仅添加属性，不修改名称）:
```json
{}
```
或
```json
{
  "format": ""
}
```

**标准格式**:
```json
{
  "format": "{region_code} {index:02d}",
  "connector": " "
}
```
输出: `HK 01`, `US 02`, `JP 03`

**完整格式**:
```json
{
  "format": "{region_flag} {region_name} {isp_code} {index:02d}",
  "connector": " "
}
```
输出: `🇭🇰 Hong Kong ATT 01`, `🇺🇸 United States 02`

**带 IPLC 标识**:
```json
{
  "format": "{region_code} {index:02d} {tag:IPLC}",
  "connector": " "
}
```
输出: `HK 01`, `TW 02 IPLC`, `JP 03`

### 可用占位符

| 占位符 | 说明 | 示例 |
|--------|------|------|
| `{region_code}` | 地区代码 | HK, US, JP |
| `{region_name}` | 地区英文名 | Hong Kong, United States |
| `{region_flag}` | 地区旗帜 | 🇭🇰, 🇺🇸 |
| `{isp_code}` | 运营商代码 | ATT, NTT |
| `{isp_name}` | 运营商全名 | AT&T, NTT |
| `{index:02d}` | 序号（补零） | 01, 02, 03 |
| `{index}` | 序号 | 1, 2, 3 |
| `{tag:IPLC}` | 动态标签 | IPLC（有则显示） |

**详细说明**: [scripts/README.md](scripts/README.md)

### 其他操作器

Sub-Store 还支持其他操作器：

- **正则过滤器**: 按关键词过滤节点
- **正则删除器**: 删除匹配的节点
- **正则重命名器**: 使用正则表达式重命名
- **排序操作器**: 按名称或延迟排序

---

## 订阅转换

### 获取处理后的订阅链接

配置完操作器后，Sub-Store 会生成新的订阅链接。

1. 进入订阅详情页
2. 点击右上角 **复制订阅链接** 按钮
3. 选择格式：
   - **Clash**: 用于 Clash/OpenClash
   - **Surge**: 用于 Surge
   - **通用**: Base64 编码的节点列表

### 订阅链接格式

```
http://192.168.0.2:3001/backend/download/Sub%2001
```

- `192.168.0.2:3001`: Sub-Store 地址
- `/backend/download/`: 固定路径
- `Sub%2001`: 订阅名称（URL 编码）

---

## 与 OpenClash 集成

### 在 OpenClash 中使用 Sub-Store 订阅

**方式一: 通过 Web 界面**

1. 登录 OpenWrt: `http://192.168.0.2`
2. 进入 **服务 → OpenClash → 配置文件管理**
3. 点击 **配置文件订阅**
4. 添加 Sub-Store 订阅链接
5. 点击 **保存配置** 并 **更新订阅**

**方式二: 修改配置文件**

编辑 `/etc/openclash/config.yaml`:

```yaml
proxy-providers:
  Sub-Store:
    type: http
    url: "http://127.0.0.1:3001/backend/download/Sub%2001"
    interval: 600
    path: ./proxy-providers/sub-store.yaml
    health-check:
      enable: true
      url: http://www.gstatic.com/generate_204
      interval: 300
```

**优势**:
- ✅ 统一节点命名格式
- ✅ 自动过滤不需要的节点
- ✅ 添加地区属性用于规则筛选
- ✅ 支持多订阅合并

---

## 高级功能

### 合并多个订阅

1. 创建新订阅
2. 类型选择 **组合订阅**
3. 选择要合并的订阅源
4. 配置��作器统一处理

### 定时更新

Sub-Store 会自动更新订阅，默认间隔：
- 订阅源更新: 60 分钟
- OpenClash 拉取: 10 分钟（在 OpenClash 配置中设置）

### 节点测速

1. 进入订阅详情页
2. 点击 **测速** 按钮
3. 等待测速完成
4. 查看各节点延迟

---

## 常见问题

### Q: 订阅更新失败

**检查网络**:
```bash
docker exec sub-store ping -c 3 www.google.com
```

**检查订阅 URL**:
- 确认订阅链接有效
- 测试在浏览器中能否访问

### Q: 脚本不生效

**检查脚本配置**:
1. 确认脚本 URL 正确
2. 检查参数是否为有效 JSON
3. 查看 Sub-Store 日志:
   ```bash
   docker logs sub-store
   ```

### Q: OpenClash 无法获取节点

**检查订阅链接**:
```bash
# 在 OpenWrt 上测试
curl http://127.0.0.1:3001/backend/download/Sub%2001
```

应该返回节点列表。

**检查 OpenClash 配置**:
- 确认 `proxy-providers` 中的 URL 正确
- 检查 OpenClash 日志

### Q: 节点名称没有变化

**原因**: 脚本参数配置错误

**检查**:
1. 参数是否为空或 `{}`（这会保留原名称）
2. 如需重命名，必须配置 `format` 参数
3. 参见上方"节点处理脚本"部分的示例

### Q: 如何备份配置

**备份数据目录**:
```bash
# 数据存储在 docker-compose.yml 配置的 volume 中
cp -r ./sub-store/docker/data /backup/sub-store-data-$(date +%Y%m%d)
```

**恢复**:
```bash
docker-compose down
cp -r /backup/sub-store-data-20250109/* ./sub-store/docker/data/
docker-compose up -d
```

---

## 相关文档

- [INSTALLATION.md](INSTALLATION.md) - Sub-Store 安装指南
- [scripts/README.md](scripts/README.md) - 节点重命名脚本详细文档
- [docker/OPENWRT-GUIDE.md](docker/OPENWRT-GUIDE.md) - OpenWrt 旁路由特殊配置
- [Sub-Store 官方文档](https://github.com/sub-store-org/Sub-Store)

---

**最后更新**: 2025-01-09
