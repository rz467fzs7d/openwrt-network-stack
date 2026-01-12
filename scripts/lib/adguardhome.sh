#!/bin/bash
# adguardhome.sh - AdGuard Home 部署

# 部署 AdGuard Home
deploy_adguardhome() {
    log_step "2/6" "部署 AdGuard Home (DNS 过滤)"

    # 检查是否已安装
    if check_adguardhome_installed; then
        log_success "AdGuard Home 已安装"
        if ! ask_yes_no "是否重新配置" "n"; then
            log_info "保持现有配置"
            return 0
        fi
    else
        # 确认安装
        if ! ask_yes_no "是否安装 AdGuard Home" "y"; then
            log_warn "跳过 AdGuard Home 部署"
            return 0
        fi
    fi

    # 检查端口冲突
    if ! check_dns_port_available; then
        log_error "DNS 端口 53 被占用"
        return 1
    fi

    # 安装 AdGuard Home
    if ! check_adguardhome_installed; then
        if ! install_adguardhome; then
            log_error "AdGuard Home 安装失败"
            return 1
        fi
    fi

    # 配置 AdGuard Home
    if ! configure_adguardhome_initial; then
        log_error "AdGuard Home 配置失败"
        return 1
    fi

    # 禁用 dnsmasq DNS 功能
    if ! disable_dnsmasq_dns; then
        log_error "dnsmasq DNS 功能禁用失败"
        return 1
    fi

    # 启动服务
    if ! start_adguardhome_service; then
        log_error "AdGuard Home 启动失败"
        return 1
    fi

    log_success "AdGuard Home 部署完成"
    show_adguardhome_guide

    return 0
}

# 检查 AdGuard Home 是否已安装
check_adguardhome_installed() {
    if opkg list-installed | grep -q "adguardhome"; then
        local version=$(opkg list-installed adguardhome | awk '{print $3}')
        log_success "AdGuard Home 已安装: ${version}"
        return 0
    else
        log_info "AdGuard Home 未安装"
        return 1
    fi
}

# 检查 DNS 端口是否可用
check_dns_port_available() {
    log_info "检查 DNS 端口 ${AGH_DNS_PORT}..."

    # 检查 dnsmasq 是否占用端口 53
    if netstat -tuln 2>/dev/null | grep -q ":53 .*LISTEN"; then
        log_warn "端口 53 已被占用，通常是 dnsmasq"
        log_info "部署时将自动禁用 dnsmasq 的 DNS 功能"
        return 0
    fi

    log_success "DNS 端口可用"
    return 0
}

# 安装 AdGuard Home
install_adguardhome() {
    log_info "安装 AdGuard Home..."

    # 更新软件源
    log_info "更新软件包列表..."
    run_with_retry "opkg update"

    # 安装 AdGuard Home
    if ! opkg install adguardhome; then
        log_error "AdGuard Home 安装失败"
        log_info "尝试手动下载安装包"
        return 1
    fi

    log_success "AdGuard Home 安装完成"
    return 0
}

# 初始配置 AdGuard Home
configure_adguardhome_initial() {
    local config_file="/etc/adguardhome.yaml"

    log_info "配置 AdGuard Home..."

    # 备份现有配置
    if [ -f "${config_file}" ]; then
        backup_file "${config_file}"
    fi

    # 生成最小化配置，让用户首次访问时通过向导配置
    generate_adguardhome_config

    log_success "配置文件已生成: ${config_file}"
    return 0
}

# 生成 AdGuard Home 最小化配置
generate_adguardhome_config() {
    local config_file="/etc/adguardhome.yaml"

    log_info "生成初始配置: ${config_file}"

    cat > "${config_file}" <<EOF
# AdGuard Home 配置文件
# 自动生成 $(date '+%Y-%m-%d %H:%M:%S')
# 首次访问 Web 界面时将启动配置向导

bind_host: 0.0.0.0
bind_port: ${AGH_WEB_PORT}

users: []

http_proxy: ""
language: zh-cn
theme: auto

dns:
  bind_hosts:
    - 0.0.0.0
  port: ${AGH_DNS_PORT}

  # 上游 DNS 将在首次配置时设置
  upstream_dns:
    - 223.5.5.5
    - 119.29.29.29

  bootstrap_dns:
    - 223.5.5.5
    - 119.29.29.29

  cache_size: 4194304
  cache_ttl_min: 60
  cache_ttl_max: 86400
  cache_optimistic: true

tls:
  enabled: false

filters: []

whitelist_filters: []

user_rules: []

dhcp:
  enabled: false

log:
  enabled: true
  file: ""
  max_backups: 0
  max_size: 100
  max_age: 3

schema_version: 28
EOF

    log_success "初始配置已生成"
}

# 禁用 dnsmasq 服务
disable_dnsmasq_dns() {
    log_info "停止并禁用 dnsmasq 服务..."

    # 旁路由模式下不需要 DHCP 和 DNS 功能，完全停止 dnsmasq

    # 停止服务
    if check_service_status "dnsmasq"; then
        log_info "停止 dnsmasq 服务..."
        stop_service "dnsmasq"
    fi

    # 禁用自启动
    log_info "禁用 dnsmasq 自启动..."
    /etc/init.d/dnsmasq disable 2>/dev/null || true

    # 验证端口是否已释放
    sleep 2
    if netstat -tuln 2>/dev/null | grep -q ":53 .*LISTEN"; then
        log_error "端口 53 仍然被占用"
        log_info "尝试手动停止占用进程..."

        # 查找占用端口的进程
        local pid=$(netstat -tulnp 2>/dev/null | grep ":53 " | awk '{print $7}' | cut -d'/' -f1)
        if [ -n "${pid}" ]; then
            log_warn "强制停止进程 ${pid}"
            kill -9 ${pid} 2>/dev/null || true
            sleep 1
        fi

        # 再次检查
        if netstat -tuln 2>/dev/null | grep -q ":53 .*LISTEN"; then
            log_error "端口 53 仍被占用，请手动处理"
            return 1
        fi
    fi

    log_success "dnsmasq 服务已停止并禁用"
    return 0
}

# 启动 AdGuard Home 服务
start_adguardhome_service() {
    log_info "启动 AdGuard Home 服务..."

    # 停止服务（如果正在运行）
    if check_service_status "adguardhome"; then
        log_info "停止现有服务..."
        stop_service "adguardhome"
        sleep 2
    fi

    # 启动服务
    if ! start_service "adguardhome"; then
        log_error "AdGuard Home 启动失败"
        log_info "查看日志: logread | grep adguardhome"
        return 1
    fi

    # 启用自启动
    enable_service "adguardhome"

    # 等待服务启动
    log_info "等待服务启动..."
    local max_wait=30
    local elapsed=0

    while [ ${elapsed} -lt ${max_wait} ]; do
        if check_port_listening "${AGH_DNS_PORT}"; then
            echo ""
            log_success "AdGuard Home 服务已启动"
            return 0
        fi

        echo -ne "\r${BLUE}[INFO]${NC} 等待 DNS 端口 ${AGH_DNS_PORT} 启动... (${elapsed}s/${max_wait}s)  "
        sleep 2
        elapsed=$((elapsed + 2))
    done

    echo ""
    log_error "服务启动超时"
    return 1
}

# 验证 AdGuard Home 服务
verify_adguardhome() {
    log_info "验证 AdGuard Home 服务..."

    # 检查 DNS 端口
    if ! check_port_listening "${AGH_DNS_PORT}"; then
        log_error "DNS 端口 ${AGH_DNS_PORT} 未监听"
        return 1
    fi

    # 检查 Web 端口
    if ! check_port_listening "${AGH_WEB_PORT}"; then
        log_error "Web 端口 ${AGH_WEB_PORT} 未监听"
        return 1
    fi

    # 测试 DNS 查询
    if command -v nslookup >/dev/null 2>&1; then
        log_info "测试 DNS 查询..."
        if nslookup google.com 127.0.0.1 -port=${AGH_DNS_PORT} >/dev/null 2>&1; then
            log_success "DNS 查询正常"
        else
            log_warn "DNS 查询失败，请检查上游配置"
        fi
    fi

    # 测试 Web 访问
    local web_url="http://127.0.0.1:${AGH_WEB_PORT}/"

    if command -v curl >/dev/null 2>&1; then
        if curl -s -f -m 5 "${web_url}" >/dev/null; then
            log_success "Web 界面访问正常"
        else
            log_warn "Web 界面访问失败"
        fi
    fi

    log_success "AdGuard Home 服务验证完成"
    return 0
}

# 显示 AdGuard Home 配置指南
show_adguardhome_guide() {
    cat <<EOF

${BOLD}${GREEN}AdGuard Home 部署完成${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${BOLD}管理地址:${NC}
   ${CYAN}http://${OPENWRT_IP}:${AGH_WEB_PORT}${NC}

${BOLD}后续步骤:${NC}
   1. 访问管理界面完成初始化向导
   2. 设置管理员账号密码
   3. 配置上游 DNS: ${YELLOW}127.0.0.1:${CLASH_DNS_PORT}${NC} (OpenClash)
   4. 添加过滤列表（推荐: anti-AD）

${BOLD}详细文档:${NC}
   ${DIM}https://github.com/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/adguardhome/CONFIGURATION.md${NC}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
}
