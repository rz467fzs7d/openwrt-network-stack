# OpenClash / Mihomo 安装指南

本文档说明如何在 OpenWrt 上安装 OpenClash 或 Mihomo。

> 💡 **完整部署流程**: 查看根目录 [DEPLOYMENT-GUIDE.md](../DEPLOYMENT-GUIDE.md) 了解完整的网络栈部署
> 💡 **配置说明**: 查看 [CONFIGURATION.md](CONFIGURATION.md) 了解配置模板的使用方法

## 安装方式选择

| 方式 | 适用场景 | 特点 |
|------|---------|------|
| OpenClash | OpenWrt LuCI 图形界面 | ✅ Web 界面管理<br>✅ 自动更新规则<br>✅ 适合新手 |
| Mihomo 原生 | 命令行管理 | ✅ 轻量级<br>✅ 性能更好<br>✅ 适合进阶用户 |

---

## 方式一：安装 OpenClash（推荐）

### 1. 通过 opkg 安装

```bash
# SSH 登录 OpenWrt
ssh root@192.168.0.2

# 更新软件源
opkg update

# 安装 OpenClash
opkg install luci-app-openclash

# 或者安装 Mihomo 内核版本
opkg install luci-app-openclash-mihomo
```

### 2. 通过 Web 界面安装

1. 登录 OpenWrt 管理界面: `http://192.168.0.2`
2. 进入 **系统 → 软件包**
3. 点击 **更新列表**
4. 搜索 `openclash`
5. 点击 **安装**

### 3. 从 GitHub 安装（最新版本）

```bash
# 下载最新 ipk 包
wget https://github.com/vernesong/OpenClash/releases/download/latest/luci-app-openclash_xxx_all.ipk

# 安装
opkg install luci-app-openclash_xxx_all.ipk
```

### 4. 下载配置模板

```bash
# 进入 OpenClash 配置目录
cd /etc/openclash

# 下载本项目的 Mihomo 配置模板
wget https://cdn.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@main/clash/config/config-mihomo.yaml.example -O config.yaml

# 或者复制本地文件
cp /path/to/openwrt-network-stack/clash/config/config-mihomo.yaml.example /etc/openclash/config.yaml
```

### 5. 配置文件

修改 `/etc/openclash/config.yaml`：

1. 修改订阅地址（proxy-providers 部分）
2. 根据需要修改内网 IP 段和域名
3. （可选）配置自定义规则

详见: [CONFIGURATION.md](CONFIGURATION.md)

### 6. 启动 OpenClash

**通过 Web 界面**:
1. 访问 OpenWrt 管理界面
2. 进入 **服务 → OpenClash**
3. 点击 **启动 OpenClash**
4. 查看运行状态和日志

**通过命令行**:
```bash
# 启动服务
/etc/init.d/openclash start

# 设置开机自启
/etc/init.d/openclash enable

# 查看状态
/etc/init.d/openclash status
```

---

## 方式二：安装 Mihomo 原生

### 1. 通过 opkg 安装

```bash
# 更新软件源
opkg update

# 安装 Mihomo
opkg install mihomo
```

### 2. 从 GitHub 下载最新版本

```bash
# 下载对应架构的二进制文件
# ARM64
wget https://github.com/MetaCubeX/mihomo/releases/download/latest/mihomo-linux-arm64.gz

# ARMv7
wget https://github.com/MetaCubeX/mihomo/releases/download/latest/mihomo-linux-armv7.gz

# 解压
gunzip mihomo-linux-arm64.gz

# 赋予执行权限
chmod +x mihomo-linux-arm64

# 移动到系统目录
mv mihomo-linux-arm64 /usr/bin/mihomo
```

### 3. 创建配置目录

```bash
# 创建 Mihomo 配置目录
mkdir -p /etc/mihomo

# 下载配置模板
wget https://cdn.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@main/clash/config/config-mihomo.yaml.example -O /etc/mihomo/config.yaml
```

### 4. 配置文件

修改 `/etc/mihomo/config.yaml`，参见 [CONFIGURATION.md](CONFIGURATION.md)。

### 5. 创建 init 脚本

```bash
# 创建 init 脚本
cat > /etc/init.d/mihomo <<'EOF'
#!/bin/sh /etc/rc.common

START=99
STOP=10

USE_PROCD=1
PROG=/usr/bin/mihomo
CONF=/etc/mihomo/config.yaml

start_service() {
    procd_open_instance
    procd_set_param command $PROG -d /etc/mihomo -f $CONF
    procd_set_param respawn
    procd_set_param stdout 1
    procd_set_param stderr 1
    procd_close_instance
}

stop_service() {
    killall mihomo
}
EOF

# 赋予执行权限
chmod +x /etc/init.d/mihomo
```

### 6. 启动 Mihomo

```bash
# 验证配置
mihomo -t -d /etc/mihomo

# 启动服务
/etc/init.d/mihomo start

# 设置开机自启
/etc/init.d/mihomo enable

# 查看状态
/etc/init.d/mihomo status
```

---

## 验证安装

### 检查服务状态

```bash
# OpenClash
/etc/init.d/openclash status

# Mihomo
/etc/init.d/mihomo status
```

### 检查端口监听

```bash
netstat -tuln | grep -E '7890|7874|9090'
# 应该看到:
# - 7890 (代理端口)
# - 7874 (DNS 端口)
# - 9090 (Web 面板)
```

### 测试 DNS 解析

```bash
nslookup google.com 127.0.0.1 -port=7874
# 应该成功返回 IP
```

### 访问 Web 面板

**OpenClash**:
- `http://192.168.0.2/cgi-bin/luci/admin/services/openclash`

**Mihomo**:
- `http://192.168.0.2:9090/ui`
- 默认密码在配置文件中设置

---

## 配置防火墙（如需透明代理）

如果使用透明代理模式，需要配置防火墙规则。

```bash
# OpenClash 会自动配置，无需手动操作

# Mihomo 需要手动配置（参考 OpenClash 规则）
# 或使用 TUN 模式（推荐）
```

---

## 卸载

### 卸载 OpenClash

```bash
# 停止服务
/etc/init.d/openclash stop
/etc/init.d/openclash disable

# 卸载软件
opkg remove luci-app-openclash

# 清理配置（可选）
rm -rf /etc/openclash
```

### 卸载 Mihomo

```bash
# 停止服务
/etc/init.d/mihomo stop
/etc/init.d/mihomo disable

# 删除文件
rm /usr/bin/mihomo
rm /etc/init.d/mihomo
rm -rf /etc/mihomo
```

---

## 故障排查

### Q: OpenClash 无法启动

**检查日志**:
```bash
logread | grep openclash | tail -50
```

**常见原因**:
- 配置文件格式错误
- 订阅链接无效
- 端口被占用

### Q: Mihomo 配置文件语法错误

**验证配置**:
```bash
mihomo -t -d /etc/mihomo
```

查看错误提示，修复 YAML 语法问题。

### Q: 无法访问 Web 面板

**检查防火墙**:
```bash
# 确保端口开放
iptables -I INPUT -p tcp --dport 9090 -j ACCEPT
```

### Q: 订阅无法更新

**检查网络连接**:
```bash
curl -I http://your-subscription-url
```

**检查 Sub-Store** (如果使用):
```bash
curl http://127.0.0.1:3001/api/health
```

---

## 下一步

- 查看 [CONFIGURATION.md](CONFIGURATION.md) 了解详细配置
- 查看 [rules/README.md](rules/README.md) 了解自定义规则
- 查看 [DEPLOYMENT-GUIDE.md](../DEPLOYMENT-GUIDE.md) 了解与其他组件的集成

---

**最后更新**: 2025-01-09
