---
name: ssh-tools
description: 核心基础设施Skill：所有远程设备访问、SSH命令执行、文件上传下载的唯一标准入口。当用户要求"连接NAS"、"查看路由器/OpenWrt配置"、"在远程设备上执行命令"（如重启服务、查日志、部署容器）、或需要在不同设备间传输文件时，必须无条件优先调用此Skill。内含所有设备的IP和统一凭证。
allowed-tools:
  - Bash(.claude/skills/ssh-tools/scripts/*.sh:*)
  - Bash(python3 .claude/skills/ssh-tools/scripts/*.py:*)
  - Read
---

# ssh-tools

远程设备访问的唯一标准入口。

## 脚本入口

```bash
# 执行命令
python3 .claude/skills/ssh-tools/scripts/exec.py <device> "<command>"

# 上传文件
python3 .claude/skills/ssh-tools/scripts/upload.py <device> <local_path> <remote_path>

# 下载文件
python3 .claude/skills/ssh-tools/scripts/download.py <device> <remote_path> <local_path>
```

## 设备列表

从 `config.yaml` 的 `devices` 节读取，当前设备：

| 设备 | 类型 | 说明 |
|---|---|---|
| `nas` | linux | Synology NAS |
| `openwrt` | openwrt | OpenWrt 主路由 |
| `openwrt-standby` | openwrt | OpenWrt 备用节点 |
| `openwrt-2` | openwrt | OpenWrt 辅助路由 |
| `openwrt-vip` | - | Keepalived 虚拟 IP |
| `main-router` | router | TP-Link 主路由 |
| `mmm2` | macos | Mac Mini M2 办公室 |
| `mmm4` | macos | Mac Mini M4 |
| `homeassistant` | linux | Home Assistant |
| `dietpi` | linux | DietPi 服务器 |
| `adguard-gateway` | linux | AdGuard DNS |
| `aws-server` | linux | AWS 海外节点 |
| `aws-server2` | linux | AWS 海外节点 2 |
| `office-server` | linux | 办公室服务器 |
| `oc-server-office` | linux | OpenClaw 账号 |
| `jms-bastion` | - | 跳板机 |
| `remote-dev` | - | 远程开发机 |

## 配置查询

```python
from lib.device_selector import ConfigLoader
cl = ConfigLoader()
conn = cl.get_connection('nas')
print(conn['host'], conn['user'])
```

## 依赖此 Skill 的 Skills

- network-diagnose
- network-diagnose-keepalived
- nas-diagnose
- openwrt-backup
- homeassistant-manager
- n8n-manager
- qinglong-manager
- plex-manager
- music-organizer
- synology-build
