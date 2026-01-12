#!/bin/bash
# substore.sh - Sub-Store 部署

# 部署 Sub-Store
deploy_substore() {
    log_step "4/6" "部署 Sub-Store (订阅管理)"

    # 检查 Docker 环境
    if ! check_docker_running; then
        log_error "Docker 服务未运行，请先安装 Docker"
        return 1
    fi

    # 确认部署
    if ! ask_yes_no "是否部署 Sub-Store" "y"; then
        log_warn "跳过 Sub-Store 部署"
        return 0
    fi

    # 创建工作目录
    log_info "创建 Sub-Store 目录: ${SUBSTORE_DIR}"
    mkdir -p "${SUBSTORE_DIR}/data"

    # 检查容器是否已存在
    local container_status=$(check_container_status "sub-store"; echo $?)
    if [ ${container_status} -eq 0 ]; then
        log_warn "Sub-Store 容器已存在且正在运行"
        if ask_yes_no "是否重新部署" "n"; then
            remove_container "sub-store"
        else
            log_info "保持现有容器"
            return 0
        fi
    elif [ ${container_status} -eq 2 ]; then
        log_warn "Sub-Store 容器已存在但未运行"
        remove_container "sub-store"
    fi

    # 生成 docker-compose.yml
    generate_substore_compose

    # 拉取镜像
    cd "${SUBSTORE_DIR}"
    if ! pull_docker_image "${SUBSTORE_IMAGE}" "Sub-Store 镜像"; then
        log_error "镜像拉取失败"
        return 1
    fi

    # 启动容器
    log_info "启动 Sub-Store 容器..."
    if ! docker-compose up -d; then
        log_error "Sub-Store 启动失败"
        log_info "查看日志: docker-compose logs"
        return 1
    fi

    # 等待服务启动
    log_info "等待服务启动..."
    sleep 5

    # 健康检查
    if ! check_container_health "sub-store" 30; then
        log_error "Sub-Store 健康检查失败"
        log_info "查看日志:"
        get_container_logs "sub-store" 20
        return 1
    fi

    # 验证服务
    if ! verify_substore; then
        log_error "Sub-Store 服务验证失败"
        return 1
    fi

    log_success "Sub-Store 部署完成"
    log_info "访问地址: http://${OPENWRT_IP}:${SUBSTORE_WEB_PORT}"

    return 0
}

# 生成 docker-compose.yml
generate_substore_compose() {
    local compose_file="${SUBSTORE_DIR}/docker-compose.yml"

    log_info "生成配置文件: ${compose_file}"

    cat > "${compose_file}" <<EOF
version: '3.8'

services:
  sub-store:
    image: ${SUBSTORE_IMAGE}
    container_name: sub-store
    restart: unless-stopped

    # 端口映射
    ports:
      - "${SUBSTORE_WEB_PORT}:3001"   # Web 界面
      - "${SUBSTORE_BACKEND_PORT}:3000"  # Backend API

    # 数据卷
    volumes:
      - ./data:/opt/app/data

    # 环境变量
    environment:
      - SUB_STORE_FRONTEND_BACKEND_PATH=/backend
      - TZ=${TIMEZONE}

    # 健康检查
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3001/"]
      interval: 30s
      timeout: 3s
      start_period: 10s
      retries: 3

    # 资源限制（可选）
    # deploy:
    #   resources:
    #     limits:
    #       cpus: '0.5'
    #       memory: 256M
EOF

    log_success "配置文件已生成"
}

# 验证 Sub-Store 服务
verify_substore() {
    log_info "验证 Sub-Store 服务..."

    # 检查端口监听
    local ports=("${SUBSTORE_WEB_PORT}" "${SUBSTORE_BACKEND_PORT}")
    for port in "${ports[@]}"; do
        if ! check_port_listening "${port}"; then
            log_error "端口 ${port} 未监听"
            return 1
        fi
    done

    # 测试 HTTP 访问
    local web_url="http://127.0.0.1:${SUBSTORE_WEB_PORT}/"

    if command -v curl >/dev/null 2>&1; then
        if curl -s -f -m 5 "${web_url}" >/dev/null; then
            log_success "Web 界面访问正常"
        else
            log_error "Web 界面访问失败"
            return 1
        fi
    elif command -v wget >/dev/null 2>&1; then
        if wget -q -O /dev/null -T 5 "${web_url}"; then
            log_success "Web 界面访问正常"
        else
            log_error "Web 界面访问失败"
            return 1
        fi
    fi

    return 0
}

# 检查端口是否监听
check_port_listening() {
    local port="$1"

    if netstat -tuln 2>/dev/null | grep -q ":${port} .*LISTEN"; then
        return 0
    elif ss -tuln 2>/dev/null | grep -q ":${port} "; then
        return 0
    else
        return 1
    fi
}

# 显示 Sub-Store 配置指南
show_substore_guide() {
    cat <<EOF

${BOLD}${GREEN}Sub-Store 配置指南${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. 访问 Web 界面:
   ${CYAN}http://${OPENWRT_IP}:${SUBSTORE_WEB_PORT}${NC}

2. 添加订阅:
   - 点击 "订阅" → "添加订阅"
   - 填入订阅链接和名称
   - 保存订阅

3. 配置节点重命名脚本 (可选):
   - 进入订阅详情
   - 点击 "操作器" → "添加脚本操作器"
   - 脚本地址:
     ${DIM}https://cdn.jsdelivr.net/gh/${GITHUB_REPO}@${GITHUB_BRANCH}/sub-store/scripts/node-renamer.js${NC}
   - 参数配置:
     ${DIM}{"format": "{region_code} {index:02d}"}${NC}

4. 获取订阅链接:
   - 点击订阅右上角的 "复制订阅链接"
   - 选择 "Clash" 格式
   - 这个链接将用于 OpenClash 配置

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
}
