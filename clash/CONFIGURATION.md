# OpenClash / Mihomo 配置指南

本仓库提供 [config/config-template.yaml](config/config-template.yaml)，使用 Fake-IP、GeoSite/GeoIP 和应用策略组。它是可调整的示例，不是可直接覆盖现网的运行配置。

## 配置来源与职责

- Sub-Store 负责订阅转换、节点识别及重命名；本模板按生成时注入节点的方式组织，不内置真实订阅或代理凭证。
- OpenClash 管理导入的配置，并可能通过覆盖设置生成运行配置。不要把运行配置文件当作唯一配置源直接覆盖。
- 使用独立 Mihomo 时，配置路径由服务启动参数决定；常见路径为 /etc/mihomo/config.yaml。
- 各组件可以分机部署；跨设备访问时不要使用仅代表本机的 127.0.0.1 地址。

## 使用模板

1. 下载模板到临时目录，先查看内容：

```sh
curl -fL https://raw.githubusercontent.com/rz467fzs7d/openwrt-network-stack/main/clash/config/config-template.yaml -o /tmp/config-template.yaml
```

2. 在 Sub-Store 中将模板与自己的节点集合组合，或自行添加 proxies / proxy-providers。模板本身不包含可用代理节点。
3. 检查代理组引用、订阅地址、端口、DNS 上游和管理接口。移除不需要的示例策略。
4. 在 OpenClash 配置管理中导入为新的配置文件，检查后再切换；独立 Mihomo 可先执行 mihomo -t -f /tmp/config-template.yaml。
5. 应用前备份，应用后验证 DNS、直连、代理和客户端访问。语法通过不代表网络可用。

## DNS 集成

典型路径：客户端 → AdGuard Home → OpenClash DNS → 上游 DNS。

- 确保 OpenClash DNS 实际监听在可达的地址和端口；同机上游可配置为 127.0.0.1:7874，分机则改为受信任的内网地址。
- 上游不要再指回 AdGuard Home，避免转发循环。
- default-nameserver 用于基础域名解析，nameserver 用于常规查询；按上游协议与实际可达性选择，不因品牌固定启用或禁用。
- Fake-IP 并不强制要求 fallback，也不意味着 fallback 一定无效；是否配置取决于解析策略。
- 使用 OpenClash DNS 覆盖时，以覆盖选项及实际生成结果为准，避免同时维护互相矛盾的 YAML 与覆盖配置。
- TUN 栈、路由接管和 DNS 劫持取决于版本及网络角色。不要不经评估照搬模板中的自动路由设置。

## 节点与分组

模板使用地区代码筛选节点，例如 HK、TW、MO、JP、US、SG；重命名规则需与筛选规则一致。

parser.js 的重命名模板只有包含 {region*} 才执行送中检测，默认检测亚洲国家和地区。标记示例为 HK*，不改变原始地区属性。

送中筛选正则使用 \*，不要使用只匹配名称末尾的 \*$。Google 服务地区不等同于 GeoIP 地区；未标记也不表示检测一定成功。

## 自定义规则

本仓库不再提供独立 rules/direct.yaml、rules/proxy.yaml 下载源。简单规则直接维护在配置的 rules 中，并放在通用规则之前，例如：

```yaml
rules:
  - DOMAIN-SUFFIX,internal.example,DIRECT
  - GEOSITE,cn,DIRECT
  - GEOIP,CN,DIRECT
  - MATCH,Select
```

如需远程规则集，使用自己的可用 rule-provider 地址，确认格式、更新频率及策略组引用；不要沿用已删除的仓库路径。

启用区域绕过时，优先通过当前版本 OpenClash 原生选项维护例外，不手工覆盖防火墙文件。iptables/ipset 与 firewall4/nftables 的操作不能混用。

## 验证与安全

- 检查管理接口监听范围。远程控制需要密钥、访问限制；网页能打开不代表 API 受到保护。
- 比较原始配置、覆盖设置和运行配置，确认最终生效值。
- 验证订阅请求的 User-Agent；服务端可能为不同客户端返回不同协议和入口。
- 用相同设备和出口分别测试 DNS 结果、直连网站及代理网站，不仅依赖测速 URL。
- 日志、备份和导出文件可能包含订阅凭证、节点密码、个人域名及内网拓扑，分享前脱敏。

## 相关文档

- [安装指南](INSTALLATION.md)
- [Sub-Store 脚本说明](../sub-store/scripts/README.md)
- [Mihomo 官方文档](https://wiki.metacubex.one/)
- [OpenClash 项目](https://github.com/vernesong/OpenClash)
