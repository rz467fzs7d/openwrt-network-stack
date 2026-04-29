# sub-store 测试环境

## 启动 Sub-Store 后端

```bash
cd /Users/pgu/Workspace/openwrt-network-stack/sub-store/docker
docker compose up -d
```

端口：
- `3000`：后端 API
- `3001`：Web 界面

## HTTP META 服务

Sub-Store 脚本依赖 HTTP META 进行节点探测。META 需要单独启动：

- 默认端口：`9876`
- API 地址：`http://127.0.0.1:9876`

META 是独立程序，需自行安装并启动。

## 测试脚本

Sub-Store 脚本位于 `sub-store/scripts/sub-cleaner.js`，CDN 链接：

```
https://fastly.jsdelivr.net/gh/rz467fzs7d/openwrt-network-stack@{commit}/sub-store/scripts/sub-cleaner.js
```

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
| #noCache | 跳过缓存，强制重新探测 | - |

## 停止服务

```bash
cd /Users/pgu/Workspace/openwrt-network-stack/sub-store/docker
docker compose down
```