# AdGuard Home 安装指南

本文档说明如何在 OpenWrt 上安装 AdGuard Home。

> 💡 **完整部署流程**: 查看根目录 [DEPLOYMENT-GUIDE.md](../DEPLOYMENT-GUIDE.md) 了解完整的网络栈部署

## 安装方法

### 通过 opkg 安装（推荐）

```bash
# SSH 登录 OpenWrt
ssh root@192.168.0.2

# 更新软件源
opkg update

# 安装 AdGuard Home
opkg install adguardhome

# 启动服务
/etc/init.d/adguardhome start

# 设置开机自启
/etc/init.d/adguardhome enable

# 检查服务状态
/etc/init.d/adguardhome status
```

### 通过 Docker 安装（备选）

```bash
docker run -d \
  --name adguardhome \
  --restart unless-stopped \
  -p 53:53/tcp -p 53:53/udp \
  -p 3000:3000/tcp \
  -v /data/adguardhome/work:/opt/adguardhome/work \
  -v /data/adguardhome/conf:/opt/adguardhome/conf \
  adguard/adguardhome:latest
```

## 处理端口冲突

AdGuard Home 默认使用 53 端口，需要禁用或修改 dnsmasq 端口。

### 方法 A: 禁用 dnsmasq DNS 功能（保留 DHCP）

```bash
# 修改 dnsmasq 端口为 0（禁用 DNS）
uci set dhcp.@dnsmasq[0].port='0'
uci commit dhcp
/etc/init.d/dnsmasq restart

# 验证配置
uci show dhcp.@dnsmasq[0].port
```

### 方法 B: 完全停用 dnsmasq（不推荐）

```bash
/etc/init.d/dnsmasq stop
/etc/init.d/dnsmasq disable
```

**注意**: 方法 B 会失去 DHCP 功能，除非你的主路由提供 DHCP。

## 初始化配置

1. 访问 AdGuard Home Web 界面: `http://192.168.0.2:3000`

2. 完成初始化向导：
   - 设置管理员账号密码
   - 确认监听端口：
     - DNS 端口: `53`
     - Web 界面端口: `3000`
   - 点击"下一步"完成初始化

3. 登录后进行基本配置：
   - 配置上游 DNS
   - 添加过滤列表
   - 设置客户端

详细配置说明参见: [CONFIGURATION.md](CONFIGURATION.md)

## 验证安装

```bash
# 检查服务状态
/etc/init.d/adguardhome status

# 检查端口监听
netstat -tuln | grep 53
# 应该看到: 0.0.0.0:53

# 测试 DNS 解析
nslookup google.com 127.0.0.1
# 应该成功返回 IP 地址
```

## 卸载

```bash
# 停止服务
/etc/init.d/adguardhome stop
/etc/init.d/adguardhome disable

# 卸载软件
opkg remove adguardhome

# 清理配置文件（可选）
rm -rf /etc/adguardhome
```

## 故障排查

### Q: 无法启动，提示端口被占用

**解决**: 检查是否有其他服务占用 53 端口

```bash
netstat -tuln | grep :53
# 如果看到 dnsmasq，按照上述方法禁用它
```

### Q: Web 界面无法访问

**检查防火墙**:
```bash
# 确保 3000 端口开放
iptables -I INPUT -p tcp --dport 3000 -j ACCEPT
```

### Q: opkg 找不到 adguardhome 包

**解决**: 更新软件源或使用二进制安装

```bash
# 下载最新版本
wget https://static.adguard.com/adguardhome/release/AdGuardHome_linux_armv7.tar.gz

# 解压并安装
tar -xzvf AdGuardHome_linux_armv7.tar.gz
cd AdGuardHome
./AdGuardHome -s install
```

**注意**: 根据设备架构选择对应版本（armv7/arm64/amd64）

## 下一步

- 查看 [CONFIGURATION.md](CONFIGURATION.md) 了解详细配置选项
- 查看 [DEPLOYMENT-GUIDE.md](../DEPLOYMENT-GUIDE.md) 了解与其他组件的集成

---

**最后更新**: 2025-01-09
