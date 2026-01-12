#!/bin/bash
# docker.sh - Docker 安装和配置

# 检查 Docker 是否已安装
check_docker_installed() {
    if command -v docker >/dev/null 2>&1; then
        local version=$(docker --version 2>/dev/null | awk '{print $3}' | tr -d ',')
        log_success "Docker 已安装: ${version}"
        return 0
    else
        log_info "Docker 未安装"
        return 1
    fi
}

# 检查 docker-compose 是否已安装
check_docker_compose_installed() {
    if command -v docker-compose >/dev/null 2>&1; then
        local version=$(docker-compose --version 2>/dev/null | awk '{print $3}' | tr -d ',')
        log_success "docker-compose 已安装: ${version}"
        return 0
    else
        log_info "docker-compose 未安装"
        return 1
    fi
}

# 安装 Docker
install_docker() {
    log_step "3/6" "安装 Docker 环境"

    # 检查是否已安装
    if check_docker_installed && check_docker_compose_installed; then
        log_success "Docker 环境已就绪"
        return 0
    fi

    # 询问是否安装
    if ! ask_yes_no "是否安装 Docker 环境" "y"; then
        log_error "Docker 是 Sub-Store 运行的必要组件"
        return 1
    fi

    # 更新软件源
    log_info "更新软件包列表..."
    run_with_retry "opkg update"

    # 安装 Docker
    if ! check_docker_installed; then
        log_info "安装 Docker..."
        if ! opkg install docker dockerd; then
            log_error "Docker 安装失败"
            return 1
        fi
    fi

    # 安装 docker-compose
    if ! check_docker_compose_installed; then
        log_info "安装 docker-compose..."
        if ! opkg install docker-compose; then
            log_error "docker-compose 安装失败"
            return 1
        fi
    fi

    # 启动 Docker 服务
    log_info "启动 Docker 服务..."
    start_service "dockerd"
    enable_service "dockerd"

    # 等待服务启动
    sleep 3

    # 验证安装
    if docker --version >/dev/null 2>&1 && docker-compose --version >/dev/null 2>&1; then
        log_success "Docker 环境安装完成"
        return 0
    else
        log_error "Docker 环境验证失败"
        return 1
    fi
}

# 配置 Docker 防火墙规则（旁路由专用）
configure_docker_firewall() {
    log_info "配置 Docker 网络规则..."

    local rule="iptables -t nat -A POSTROUTING -s 172.17.0.0/16 ! -o docker0 -j MASQUERADE"

    # 检查规则是否已存在
    if iptables -t nat -C POSTROUTING -s 172.17.0.0/16 ! -o docker0 -j MASQUERADE 2>/dev/null; then
        log_info "防火墙规则已存在"
        return 0
    fi

    # 添加规则
    log_info "添加 MASQUERADE 规则..."
    if ! eval "${rule}"; then
        log_error "添加防火墙规则失败"
        return 1
    fi

    # 持久化规则
    local firewall_user="/etc/firewall.user"

    # 备份原文件
    backup_file "${firewall_user}"

    # 检查是否已添加
    if grep -q "docker0 -j MASQUERADE" "${firewall_user}" 2>/dev/null; then
        log_info "规则已持久化"
    else
        log_info "持久化防火墙规则..."
        echo "" >> "${firewall_user}"
        echo "# Docker 容器网络规则" >> "${firewall_user}"
        echo "${rule}" >> "${firewall_user}"
    fi

    # 重启防火墙
    restart_service "firewall"

    log_success "Docker 防火墙规则配置完成"
    return 0
}

# 检查 Docker 服务状态
check_docker_running() {
    if ! check_service_status "dockerd"; then
        log_error "Docker 服务未运行"
        return 1
    fi

    # 测试 Docker 命令
    if ! docker ps >/dev/null 2>&1; then
        log_error "Docker 服务异常"
        return 1
    fi

    log_success "Docker 服务运行正常"
    return 0
}

# 拉取 Docker 镜像
pull_docker_image() {
    local image="$1"
    local description="${2:-Docker 镜像}"

    log_info "拉取 ${description}: ${image}"

    if ! run_with_retry "docker pull ${image}"; then
        log_error "镜像拉取失败: ${image}"
        return 1
    fi

    log_success "镜像拉取完成: ${image}"
    return 0
}

# 停止并删除容器
remove_container() {
    local container_name="$1"

    # 检查容器是否存在
    if ! docker ps -a --format '{{.Names}}' | grep -q "^${container_name}$"; then
        return 0
    fi

    log_info "删除旧容器: ${container_name}"

    # 停止容器
    docker stop "${container_name}" 2>/dev/null

    # 删除容器
    if docker rm "${container_name}" 2>/dev/null; then
        log_success "容器已删除: ${container_name}"
    else
        log_warn "容器删除失败: ${container_name}"
    fi
}

# 检查容器状态
check_container_status() {
    local container_name="$1"

    # 检查容器是否存在
    if ! docker ps -a --format '{{.Names}}' | grep -q "^${container_name}$"; then
        return 1
    fi

    # 检查容器是否运行
    if docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
        return 0
    else
        return 2
    fi
}

# 获取容器日志
get_container_logs() {
    local container_name="$1"
    local lines="${2:-50}"

    docker logs --tail "${lines}" "${container_name}" 2>&1
}

# 检查容器健康状态
check_container_health() {
    local container_name="$1"
    local max_wait="${2:-30}"
    local elapsed=0

    log_info "等待容器健康检查: ${container_name}"

    while [ ${elapsed} -lt ${max_wait} ]; do
        local health=$(docker inspect --format='{{.State.Health.Status}}' "${container_name}" 2>/dev/null)

        case "${health}" in
            "healthy")
                log_success "容器健康: ${container_name}"
                return 0
                ;;
            "unhealthy")
                log_error "容器不健康: ${container_name}"
                return 1
                ;;
            "starting")
                echo -ne "\r${BLUE}[INFO]${NC} 容器启动中... (${elapsed}s/${max_wait}s)  "
                sleep 2
                elapsed=$((elapsed + 2))
                ;;
            *)
                # 没有健康检查，检查容器是否运行
                if check_container_status "${container_name}"; then
                    echo ""
                    log_success "容器运行中: ${container_name}"
                    return 0
                else
                    log_error "容器未运行: ${container_name}"
                    return 1
                fi
                ;;
        esac
    done

    echo ""
    log_warn "健康检查超时: ${container_name}"
    return 2
}
