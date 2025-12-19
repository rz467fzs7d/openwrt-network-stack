# Clash 自定义规则

自定义路由规则，用于精细控制特定域名的流量走向。

## 📁 规则文件

### direct.yaml - 直连规则

强制指定域名通过直连（DIRECT）访问，不走代理。

**规则列表**：

| 类型 | 规则 | 说明 |
|------|------|------|
| DOMAIN | v4.plex.tv | Plex 服务器心跳检测 |
| DOMAIN | clients.plex.tv | Plex 客户端验证 |
| DOMAIN-KEYWORD | direct | 包含 "direct" 关键词的域名 |
| DOMAIN-KEYWORD | checkip | IP 检测服务 |

**适用场景**：
- Plex 服务器注册和心跳（必须直连）
- IP 地址检测服务（获取真实 IP）
- 其他明确需要直连的服务

### proxy.yaml - 代理规则

强制指定域名通过代理（PROXY）访问。

**规则列表**：

| 类型 | 规则 | 说明 |
|------|------|------|
| DOMAIN | dns.adguard-dns.com | AdGuard DNS DoH 服务器 |
| DOMAIN-SUFFIX | brew.sh | Homebrew 官网 |
| DOMAIN-SUFFIX | yunpan1.xyz | 云盘服务 |
| DOMAIN-SUFFIX | mycomic.com | 漫画网站 |
| DOMAIN-SUFFIX | biccam.com | BicCamera 购物网站 |
| DOMAIN-SUFFIX | 321012.xyz | 资源站点 |
| DOMAIN-SUFFIX | jjsubmarines.com | 资源站点 |
| DOMAIN-SUFFIX | clouddrive2.com | CloudDrive 云盘挂载 |
| DOMAIN-KEYWORD | hdhive | HDHive 高清影视 |
| DOMAIN-SUFFIX | dmm.co.jp | DMM 日本电商 |
| DOMAIN-SUFFIX | thetvdb.com | TVDB 媒体数据库 |
| DOMAIN-SUFFIX | javbee.vip | 成人内容 |
| DOMAIN-SUFFIX | ai18.pics | 成人内容 |
| DOMAIN-SUFFIX | idol69.net | 成人内容 |
| DOMAIN-SUFFIX | javball.com | 成人内容 |
| DOMAIN-SUFFIX | cnxx.me | 成人内容 |
| DOMAIN-SUFFIX | right.com.cn | Right.com.cn 服务 |
| DOMAIN-SUFFIX | lgthinq.com | LG ThinQ 智能家居 |

**适用场景**：
- 需要通过代理访问的国外服务
- 被墙或限速的网站
- 媒体元数据服务（TVDB 等）
- 个人特定需求的站点

## 🚀 使用方法

### 方式一：使用本仓库的规则（推荐）

在 Clash 配置中引用：

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
  - RULE-SET,CUSTOM-DIRECT,DIRECT
  - RULE-SET,CUSTOM-PROXY,PROXY
```

### 方式二：本地文件

```bash
# 复制规则文件到 Mihomo 配置目录
cp rules/*.yaml /etc/mihomo/rule-providers/
```

修改配置：

```yaml
rule-providers:
  CUSTOM-DIRECT:
    type: file
    behavior: classical
    path: ./rule-providers/direct.yaml

  CUSTOM-PROXY:
    type: file
    behavior: classical
    path: ./rule-providers/proxy.yaml

rules:
  - RULE-SET,CUSTOM-DIRECT,DIRECT
  - RULE-SET,CUSTOM-PROXY,PROXY
```

### 方式三：Fork 后自定义

1. Fork 本仓库
2. 修改 `clash/rules/*.yaml` 文件
3. 更新 Clash 配置中的 URL：
   ```yaml
   url: "https://cdn.jsdelivr.net/gh/YOUR_USERNAME/openwrt-network-stack@main/clash/rules/direct.yaml"
   ```

## ✏️ 自定义规则

### 添加直连规则

编辑 `direct.yaml`：

```yaml
payload:
  # 现有规则
  - DOMAIN,v4.plex.tv
  - DOMAIN,clients.plex.tv

  # 添加新规则
  - DOMAIN,example.com                    # 精确匹配域名
  - DOMAIN-SUFFIX,example.org             # 匹配域名及其所有子域名
  - DOMAIN-KEYWORD,example                # 包含关键词的域名
  - IP-CIDR,192.168.1.0/24,no-resolve     # 匹配 IP 段
```

### 添加代理规则

编辑 `proxy.yaml`：

```yaml
payload:
  # 现有规则
  - DOMAIN,dns.adguard-dns.com

  # 添加新规则
  - DOMAIN-SUFFIX,github.com              # GitHub 相关域名
  - DOMAIN-SUFFIX,githubusercontent.com    # GitHub raw 内容
```

### 规则类型说明

| 类型 | 语法 | 说明 | 示例 |
|------|------|------|------|
| DOMAIN | DOMAIN,域名 | 精确匹配 | DOMAIN,google.com |
| DOMAIN-SUFFIX | DOMAIN-SUFFIX,域名 | 匹配域名及子域名 | DOMAIN-SUFFIX,google.com |
| DOMAIN-KEYWORD | DOMAIN-KEYWORD,关键词 | 包含关键词 | DOMAIN-KEYWORD,google |
| IP-CIDR | IP-CIDR,IP段,no-resolve | 匹配 IP 段 | IP-CIDR,1.1.1.0/24 |

## 📝 规则优先级

在 Clash 配置中，规则从上到下匹配，**第一条匹配的规则生效**。

推荐规则顺序：

```yaml
rules:
  # 1. 本地网络
  - GEOIP,lan,DIRECT,no-resolve
  - GEOIP,private,DIRECT,no-resolve

  # 2. 自定义直连规则（优先级最高）
  - RULE-SET,CUSTOM-DIRECT,DIRECT

  # 3. 自定义代理规则
  - RULE-SET,CUSTOM-PROXY,PROXY

  # 4. 其他规则...
```

## 🔍 常见场景

### Plex 服务器配置

**问题**：Plex 服务器无法注册或心跳失败

**原因**：Plex 验证服务器（plex.tv）必须通过真实 IP 访问

**��决**：添加 Plex 相关域名到 `direct.yaml`

```yaml
payload:
  - DOMAIN,v4.plex.tv           # 心跳检测
  - DOMAIN,clients.plex.tv      # 客户端验证
  - DOMAIN,plex.tv              # 主域名
  - DOMAIN-SUFFIX,plex.direct   # 直连域名
```

### AdGuard DNS 广告拦截

**问题**：使用 AdGuard DNS 但无法拦截广告

**原因**：DoH 服务器地址被直连，无法通过代理

**解决**：添加 AdGuard 域名到 `proxy.yaml`

```yaml
payload:
  - DOMAIN,dns.adguard-dns.com              # DoH 服务器
  - DOMAIN-SUFFIX,adguard-dns.com           # 所有 AdGuard DNS 域名
  - DOMAIN-SUFFIX,dns.adguard.com           # 拦截列表域名
```

### Homebrew 加速

**问题**：Homebrew 下载慢或失败

**解决**：添加 Homebrew 域名到 `proxy.yaml`

```yaml
payload:
  - DOMAIN-SUFFIX,brew.sh                   # 官网
  - DOMAIN-SUFFIX,githubusercontent.com     # 下载源
  - DOMAIN-SUFFIX,github.com                # 代码仓库
```

### 媒体库元数据

**问题**：Plex/Emby/Jellyfin 刮削器无法获取元数据

**解决**：添加元数据服务到 `proxy.yaml`

```yaml
payload:
  - DOMAIN-SUFFIX,themoviedb.org            # TMDB
  - DOMAIN-SUFFIX,thetvdb.com               # TVDB
  - DOMAIN-SUFFIX,imdb.com                  # IMDb
  - DOMAIN-SUFFIX,fanart.tv                 # Fanart
```

## 🛠️ 维护建议

### 定期清理

定期检查规则是否仍然需要：

1. 移除不再使用的服务
2. 合并重复或冲突的规则
3. 优化规则顺序（高频规则放前面）

### 测试规则

添加新规则后测试：

```bash
# 查看规则匹配情况（Mihomo）
curl http://127.0.0.1:9090/rules

# 测试域名匹配
curl -X GET "http://127.0.0.1:9090/providers/rules/CUSTOM-DIRECT"
```

### Git 管理

使用 Git 管理规则变更：

```bash
# 添加规则后提交
git add clash/rules/*.yaml
git commit -m "Add: XXX 域名规则"
git push

# 等待 CDN 更新（约 5-10 分钟）
# 或手动刷新 JSDelivr 缓存
```

## 📚 参考资料

- [Clash 规则语法](https://github.com/Dreamacro/clash/wiki/configuration)
- [Mihomo 文档](https://wiki.metacubex.one/)
- [规则集项目](https://github.com/blackmatrix7/ios_rule_script)

## ⚠️ 注意事项

1. **隐私规则**：建议 Fork 后修改，避免暴露个人使用的站点
2. **成人内容**：如不需要，可从 `proxy.yaml` 中删除相关规则
3. **更新频率**：规则变化不频繁时，`interval` 可设为更大值（如 604800 = 7天）
4. **规则顺序**：自定义规则应放在通用规则之前，以覆盖默认行为
