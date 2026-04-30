---
name: sub-store-diagnostic
description: Sub-Store 诊断 Skill。通过 ssh-tools 连接 NAS 上的 Sub-Store Docker 容器进行诊断：查看日志、检查节点、探测 geo、测试代理延迟。当需要诊断 Sub-Store 节点问题、分析订阅解析、分析代理连通性时调用此 Skill。
allowed-tools:
  - Bash(.claude/skills/ssh-tools/scripts/exec.py nas *)
---

# Sub-Store 诊断

通过 NAS 上的 Docker 容器诊断 Sub-Store。

## 入口

```bash
# 快捷方式
python3 .claude/skills/ssh-tools/scripts/exec.py nas "<command>"
```

## 容器状态

```bash
# 查看容器运行状态
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker ps -a --filter name=sub-store --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

# 实时资源占用
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker stats sub-store --no-stream --format 'cpu={{.CPUPerc}} mem={{.MemUsage}} net={{.NetIO}}'"
```

## 日志诊断

```bash
# 实时跟踪日志（最新 50 行）
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker logs --tail 50 sub-store 2>&1"

# 错误级别日志
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker logs --tail 100 --since 30m sub-store 2>&1 | grep -iE 'error|fail|warn'"

# 指定时间范围日志
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker logs --since '2026-04-30T10:00:00' sub-store 2>&1 | tail -100"
```

## 节点 & 订阅诊断

```bash
# 查看容器内 Sub-Store 数据目录
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker exec sub-store ls -la /app/data/"

# 查看订阅文件
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker exec sub-store find /app/data/subscriptions -type f | head -20"

# 查看解析后的代理节点数
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker exec sub-store find /app/data/proxies -type f | wc -l"
```

## META 代理测试

```bash
# 测试指定节点（替换 proxy json）
python3 .claude/skills/ssh-tools/scripts/exec.py nas 'docker exec sub-store sh -c "curl -X POST http://127.0.0.1:9876/start -H '\''Content-Type: application/json'\'' -d '\''{\"proxies\":[{\"type\":\"vmess\",\"server\":\"93.179.103.179\",\"port\":10038,\"uuid\":\"b4d3be5d-b4e2-4daf-8878-6ba9889b1461\",\"alterId\":0}],\"timeout\":15000}'\''"'

# 通过 META 代理请求目标站，检测 geo 出口
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker exec sub-store sh -c \"curl -s --proxy http://127.0.0.1:65534 'http://ip-api.com/json?lang=zh-CN' --max-time 8000\""

# 查看 META 进程日志
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker exec sub-store cat /tmp/http-meta.*.log 2>/dev/null | tail -30"
```

## 常用测试节点

- VMess: `{"type":"vmess","server":"93.179.103.179","port":10038,"uuid":"b4d3be5d-b4e2-4daf-8878-6ba9889b1461","alterId":0}`
- SS: `{"type":"ss","server":"67.209.184.142","port":10038,"cipher":"aes-256-gcm","password":"xWsZferpKq7DX9Nx"}`

## 网络连通性

```bash
# 在容器内测试 DNS 解析
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker exec sub-store nslookup sub.store 8.8.8.8"

# 测试到目标站点的 TCP 连通性
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker exec sub-store sh -c \"nc -zv host 443 -w 5 && echo OK || echo FAIL\""
```

## 容器内文件操作

```bash
# 上传测试脚本到容器
python3 .claude/skills/ssh-tools/scripts/copy.py nas /tmp/test.js /tmp/test.js
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker cp /tmp/test.js sub-store:/tmp/test.js"

# 从容器下载文件
python3 .claude/skills/ssh-tools/scripts/exec.py nas "docker cp sub-store:/app/data/export.json /tmp/sub_store_export.json"
```

## 依赖此 Skill 的 Skills

- （后续按需添加）
