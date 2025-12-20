# 📋 待办事项

## ⚡ 优先级高（必须完成）

### 1. 生成 Docker Hub Access Token
- [ ] 访问 https://hub.docker.com/settings/security
- [ ] 点击 "New Access Token"
- [ ] 描述填写：`GitHub Actions for sub-store-docker`
- [ ] 权限选择：**Read, Write, Delete**
- [ ] 点击 "Generate" 生成
- [ ] ⚠️ **立即复制 token**（只会显示一次）

### 2. 配置 GitHub Actions Secrets
- [ ] 访问 https://github.com/rz467fzs7d/sub-store-docker/settings/secrets/actions
- [ ] 点击 "New repository secret"
- [ ] 添加第一个 secret：
  - Name: `DOCKERHUB_USERNAME`
  - Value: `rz467fzs7d`
- [ ] 添加第二个 secret：
  - Name: `DOCKERHUB_TOKEN`
  - Value: `<刚才复制的 token>`
- [ ] 保存

### 3. 测试自动构建
- [ ] 方法1：推送一个小改动触发 workflow
  ```bash
  cd /path/to/sub-store-docker  # 替换为你的项目路径
  echo "# Test commit" >> README.md
  git add README.md
  git commit -m "test: trigger GitHub Actions"
  git push
  ```
- [ ] 方法2：在 Actions 页面手动触发 workflow
  - 访问 https://github.com/rz467fzs7d/sub-store-docker/actions
  - 选择 "Build and Push Docker Image"
  - 点击 "Run workflow"
- [ ] 检查构建日志
- [ ] 验证镜像已推送到 Docker Hub

---

## 📝 优先级中（推荐完成）

### 4. 创建 GitHub Release v1.0.0
- [ ] 打标签
  ```bash
  cd /path/to/sub-store-docker  # 替换为你的项目路径
  git tag -a v1.0.0 -m "Release v1.0.0: Initial optimized image (165MB)"
  git push origin v1.0.0
  ```
- [ ] 在 GitHub 创建 Release
  - 访问 https://github.com/rz467fzs7d/sub-store-docker/releases/new
  - 选择标签 `v1.0.0`
  - 标题：`v1.0.0 - Initial Optimized Release`
  - 描述：参考 README.md 中的特性说明
  - 点击 "Publish release"

### 5. 完善文档
- [ ] 添加 OpenWrt 旁路由部署说明
  - DNS 配置说明
  - 防火墙配置说明
  - 网络模式选择
- [ ] 添加实际使用截图（可选）
- [ ] 更新徽章（badges）为真实数据

---

## 🌟 优先级低（可选）

### 6. 社区分享
- [ ] Sub-Store 官方仓库
  - 创建 Issue 分享优化镜像
  - 链接：https://github.com/sub-store-org/Sub-Store/issues
- [ ] 中文社区
  - [ ] V2EX
  - [ ] NodeSeek
  - [ ] Hostloc
  - [ ] 恩山论坛
- [ ] 国际社区
  - [ ] Reddit r/docker
  - [ ] Twitter/X
  - [ ] Telegram 群组

### 7. 持续优化
- [ ] 添加更多平台支持（armv6 等）
- [ ] 使用 UPX 压缩二进制文件（可能减少 15MB）
- [ ] 评估是否需要 shoutrrr（可能减少 8.7MB）
- [ ] 添加多版本标签支持（如 v1.0.0, v1.0, v1, latest）

---

## 🔑 关键信息

- **GitHub 仓库**: https://github.com/rz467fzs7d/sub-store-docker
- **Docker Hub 用户**: rz467fzs7d
- **Docker Hub 仓库**: https://hub.docker.com/r/rz467fzs7d/sub-store (待创建)
- **项目路径**: `/path/to/sub-store-docker/` (替换为你的实际路径)
- **优化成果**: 264MB → 165MB (-37.5%, -99MB)

---

## 📅 更新日志

- **2025-12-18**:
  - ✅ 项目创建
  - ✅ 推送到 GitHub
  - ✅ Docker Hub 账号注册
  - ⏳ 等待配置 GitHub Actions
