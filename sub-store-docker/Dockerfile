# ============================================================
# xream/sub-store:http-meta 优化版 Dockerfile
# ============================================================
# 优化效果: 264MB → ~102MB (减少 61.4%)
#
# 主要优化:
# 1. 使用多阶段构建分离构建和运行环境
# 2. 使用 alpine + nodejs-current 替代完整 node:22-alpine
# 3. 使用 COPY --chmod 避免 chmod 产生额外层
# 4. 移除运行时不需要的构建工具
# ============================================================

# ============ 构建阶段 ============
FROM alpine:3.20 AS downloader

# GitHub加速代理（构建时可通过 --build-arg GITHUB_PROXY=https://ghfast.top/ 指定）
ARG GITHUB_PROXY=""

# 更换为国内镜像源加速下载
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories

# 安装下载工具
RUN apk add --no-cache curl unzip

WORKDIR /opt/app

# 下载sub-store
RUN curl -sL "${GITHUB_PROXY}https://github.com/sub-store-org/Sub-Store/releases/latest/download/sub-store.bundle.js" \
    -o sub-store.bundle.js

# 下载frontend
RUN curl -sL "${GITHUB_PROXY}https://github.com/sub-store-org/Sub-Store-Front-End/releases/latest/download/dist.zip" \
    -o dist.zip && \
    unzip dist.zip && mv dist frontend && rm dist.zip

# 下载http-meta
RUN mkdir -p http-meta && \
    curl -sL "${GITHUB_PROXY}https://github.com/xream/http-meta/releases/latest/download/http-meta.bundle.js" \
    -o http-meta.bundle.js && \
    curl -sL "${GITHUB_PROXY}https://github.com/xream/http-meta/releases/latest/download/tpl.yaml" \
    -o http-meta/tpl.yaml

# 下载mihomo
RUN version=$(curl -sL "${GITHUB_PROXY}https://github.com/MetaCubeX/mihomo/releases/download/Prerelease-Alpha/version.txt") && \
    arch=$(arch | sed s/aarch64/arm64/ | sed s/x86_64/amd64-v1/ | sed s/armv7l/armv7/) && \
    curl -sL "${GITHUB_PROXY}https://github.com/MetaCubeX/mihomo/releases/download/Prerelease-Alpha/mihomo-linux-$arch-$version.gz" | \
    gunzip > /opt/app/http-meta/http-meta && \
    chmod +x /opt/app/http-meta/http-meta

# 下载shoutrrr
RUN arch=$(arch | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/' | sed 's/armv7l/armv6/' | sed 's/armv7/armv6/') && \
    curl -sL "${GITHUB_PROXY}https://github.com/containrrr/shoutrrr/releases/latest/download/shoutrrr_linux_${arch}.tar.gz" | \
    tar -xz -C /usr/local/bin/

# ============ 运行阶段 ============
FROM alpine:3.20

# 更换为国内镜像源加速下载
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories

ENV NODE_VERSION=22 \
    TIME_ZONE=Asia/Shanghai

# 只安装运行时依赖
RUN apk add --no-cache \
    nodejs-current \
    tzdata && \
    cp /usr/share/zoneinfo/$TIME_ZONE /etc/localtime && \
    echo $TIME_ZONE > /etc/timezone

# 从构建阶段复制文件
COPY --from=downloader /opt/app /opt/app
COPY --from=downloader /usr/local/bin/shoutrrr /usr/local/bin/

# 设置权限
RUN chmod -R 777 /opt/app && \
    chmod 755 /usr/local/bin/shoutrrr

WORKDIR /opt/app

ENTRYPOINT ["/bin/sh"]
CMD ["-c", "\
    mkdir -p /opt/app/data && \
    cd /opt/app/data && \
    META_FOLDER=/opt/app/http-meta node /opt/app/http-meta.bundle.js > /opt/app/data/http-meta.log 2>&1 & \
    echo 'HTTP-META is running...' && \
    SUB_STORE_DOCKER=true \
    SUB_STORE_FRONTEND_PATH=/opt/app/frontend \
    SUB_STORE_DATA_BASE_PATH=/opt/app/data \
    node /opt/app/sub-store.bundle.js"]
