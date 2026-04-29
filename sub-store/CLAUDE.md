# sub-store 测试环境

## 启动 Sub-Store 后端（xream/sub-store:http-meta 镜像）

```bash
docker stop sub-store && docker rm sub-store
docker run -d --name sub-store -p 3000:3000 -p 3001:3001 xream/sub-store:http-meta
```

端口：
- `3000`：后端 API
- `3001`：Web 界面
- `9876`：HTTP META 服务（容器内可用）

## 在容器内测试脚本逻辑

直接在容器内执行 Node.js 代码测试：

```bash
# 查看 Sub-Store API
docker exec sub-store curl http://127.0.0.1:3000/backend/api/v1/health

# 测试 META 启动
docker exec sub-store curl -X POST http://127.0.0.1:9876/start \
  -H 'Content-Type: application/json' \
  -d '{"proxies":[{"type":"vmess","server":"93.179.103.179","port":10038,"uuid":"xxx","alterId":0}],"timeout":15000}'

# 在容器内执行测试脚本
docker exec -i sub-store node << 'EOF'
// 容器内测试代码
EOF
```

## 测试脚本

Sub-Store 脚本位于 `sub-store/scripts/parser.js`，CDN 链接：

```
https://fastly.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@{commit}/sub-store/scripts/parser.js
```

当前 commit: `e0a261a`
当前 CDN: `https://fastly.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@e0a261a/sub-store/scripts/parser.js`

脚本功能：
- HTTP META 探测节点落地 region（国家/ISP）
- 单节点超时抛弃（latency > timeout 即丢弃）
- 支持 rename 模板
- 支持高级排序，按 region 分组编号
- 支持限制返回数量

缓存策略：
- 缓存 key 使用 proxy 完整配置（排除 name/uuid/password/index）的 MD5 hash
- 缓存命中时直接采信测试结果（由 Sub-Store 统一管理缓存时效）

在 Sub-Store 中配置脚本时，需设置：
- `http_meta_host`：META 服务地址，默认 `127.0.0.1`
- `http_meta_port`：META 服务端口，默认 `9876`
- `http_meta_start_delay`：初始延时，默认 `3000`
- `http_meta_proxy_timeout`：每节点预估耗时，默认 `10000`

## 常用参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| t / timeout | 单节点超时(ms) | 1000 |
| l / limit | 限制返回数量 | 0（不限制） |
| s / sort | 排序规则 | null |
| f / format | 格式化模板 | `{region_code} {isp_code}` |
| #noCache | 跳过读取缓存，强制重新探测（探测结果仍会更新缓存） | - |

## 停止服务

```bash
docker stop sub-store && docker rm sub-store
```