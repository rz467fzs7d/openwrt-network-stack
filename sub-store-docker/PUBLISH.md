# 发布指南

## 📦 项目结构

```
sub-store-docker/
├── .github/
│   └── workflows/
│       └── docker-build.yml      # GitHub Actions 自动构建
├── examples/
│   └── docker-compose.build.yml  # 本地���建示例
├── .dockerignore                 # Docker 构建忽略文件
├── .gitignore                    # Git 忽略文件
├── Dockerfile                    # 优化的 Dockerfile
├── docker-compose.yml            # Docker Compose 配置
├── LICENSE                       # MIT 许可证
├── README.md                     # 英文文档
└── README.zh-CN.md              # 中文文档
```

## 🚀 发布到 GitHub

### 1. 创建 GitHub 仓库

1. 访问 https://github.com/new
2. 仓库名称：`sub-store-docker`
3. 描述：`🐳 Optimized Docker image for Sub-Store (165MB vs 264MB, 37.5% smaller)`
4. 选择 Public
5. 不要勾选 "Initialize this repository with:"（我们已有文件）
6. 点击 "Create repository"

### 2. 初始化并推送代码

```bash
cd /Users/pgu/Library/CloudStorage/SynologyDrive-Workspace/homelab-helper/sub-store-docker

# 初始化 Git 仓库
git init

# 添加所有文件
git add .

# 创建首次提交
git commit -m "Initial commit: Optimized Sub-Store Docker image"

# 添加远程仓库（替换 rz467fzs7d）
git remote add origin https://github.com/rz467fzs7d/sub-store-docker.git

# 推送到 GitHub
git branch -M main
git push -u origin main
```

### 3. 配置 GitHub Actions Secrets（可选）

如果要启用自动构建和发布到 Docker Hub：

1. 访问仓库的 Settings → Secrets and variables → Actions
2. 添加以下 secrets：
   - `DOCKERHUB_USERNAME`: 你的 Docker Hub 用户名
   - `DOCKERHUB_TOKEN`: 你的 Docker Hub Access Token
     - 获取 Token: https://hub.docker.com/settings/security

### 4. 触发自动构建

推送代码后，GitHub Actions 会自动：
- ✅ 构建多平台镜像（amd64, arm64, armv7）
- ✅ 推送到 Docker Hub
- ✅ 更新 Docker Hub 描述

### 5. 创建 Release（可选）

```bash
# 打标签
git tag -a v1.0.0 -m "Release v1.0.0: Initial optimized image"

# 推送标签
git push origin v1.0.0
```

然后在 GitHub 仓库页面：
1. 点击 "Releases" → "Create a new release"
2. 选择刚才的标签 `v1.0.0`
3. 填写 Release notes
4. 点击 "Publish release"

## 🐳 发布到 Docker Hub（手动）

如果不使用 GitHub Actions，可以手动构建和推送：

### 1. 登录 Docker Hub

```bash
docker login
```

### 2. 构建镜像

```bash
# 单平台构建
docker build -t rz467fzs7d/sub-store:latest .

# 多平台构建（需要 buildx）
docker buildx build \
  --platform linux/amd64,linux/arm64,linux/arm/v7 \
  -t rz467fzs7d/sub-store:latest \
  --push \
  .
```

### 3. 推送到 Docker Hub

```bash
docker push rz467fzs7d/sub-store:latest
```

### 4. 添加额外标签

```bash
docker tag rz467fzs7d/sub-store:latest rz467fzs7d/sub-store:v1.0.0
docker push rz467fzs7d/sub-store:v1.0.0
```

## 📝 更新 README

发布后，记得更新 README.md 中的以下内容：

1. 将所有 `yourusername` 替换为你的 GitHub 用户名
2. 更新 Docker Hub 链接
3. 添加实际的徽章（badges）

```markdown
[![Docker Pulls](https://img.shields.io/docker/pulls/rz467fzs7d/sub-store)](https://hub.docker.com/r/rz467fzs7d/sub-store)
[![Docker Image Size](https://img.shields.io/docker/image-size/rz467fzs7d/sub-store/latest)](https://hub.docker.com/r/rz467fzs7d/sub-store)
[![GitHub Stars](https://img.shields.io/github/stars/rz467fzs7d/sub-store-docker)](https://github.com/rz467fzs7d/sub-store-docker)
```

## 🔄 后续更新流程

### 更新代码

```bash
# 修改文件后
git add .
git commit -m "Update: your changes description"
git push
```

### 发布新版本

```bash
# 打新标签
git tag -a v1.1.0 -m "Release v1.1.0: your changes"
git push origin v1.1.0

# 在 GitHub 上创建 Release
```

## 📢 推广

发布后可以在以下地方分享：

1. **Sub-Store Issues**: https://github.com/sub-store-org/Sub-Store/issues
   - 创建 issue 分享你的优化镜像

2. **Docker Hub**: https://hub.docker.com
   - 完善镜像描述
   - 添加使用说明

3. **社区论坛**:
   - V2EX
   - NodeSeek
   - Hostloc
   - 恩山论坛

4. **社交媒体**:
   - Twitter/X
   - Telegram 群组
   - Discord 社区

## ✅ 检查清单

发布前确认：

- [ ] 所有文件已创建
- [ ] README 中的用户名已更新
- [ ] Dockerfile 经过测试
- [ ] docker-compose.yml 可以正常运行
- [ ] .gitignore 和 .dockerignore 已配置
- [ ] LICENSE 文件已包含
- [ ] GitHub Actions workflow 已配置（如果需要）

## 📞 获取帮助

如果遇到问题：

1. 检查 GitHub Actions 日志
2. 检查 Docker Hub 构建日志
3. 在仓库中创建 Issue
4. 参考 Docker 官方文档

---

**祝发布顺利！** 🎉
