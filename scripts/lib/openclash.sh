#!/bin/bash
# openclash.sh - OpenClash 配置

# 配置 OpenClash
configure_openclash() {
    log_step "5/6" "配置 OpenClash (智能分流)"

    # 检查 OpenClash 是否已安装
    if ! check_openclash_installed; then
        show_openclash_install_guide
        if ! ask_yes_no "是否已手动安装 OpenClash" "n"; then
            log_warn "跳过 OpenClash 配置"
            return 0
        fi

        # 再次检查
        if ! check_openclash_installed; then
            log_error "未检测到 OpenClash，请先安装"
            return 1
        fi
    fi

    log_success "检测到 OpenClash"

    # 确认配置
    if ! ask_yes_no "是否配置 OpenClash" "y"; then
        log_warn "跳过 OpenClash 配置"
        return 0
    fi

    # 备份现有配置
    local config_dir="/etc/openclash"
    local config_file="${config_dir}/config.yaml"

    if [ -f "${config_file}" ]; then
        log_warn "检测到现有配置文件"
        if ask_yes_no "是否备份现有配置" "y"; then
            backup_file "${config_file}"
        fi

        if ! ask_yes_no "是否覆盖现有配置" "n"; then
            log_info "保持现有配置"
            show_openclash_manual_guide
            return 0
        fi
    fi

    # 下载配置模板
    if ! download_openclash_config; then
        log_error "配置模板下载失败"
        return 1
    fi

    # 验证配置
    if ! validate_openclash_config; then
        log_error "配置文件验证失败"
        return 1
    fi

    # 启动服务
    if ! start_openclash_service; then
        log_error "OpenClash 启动失败"
        return 1
    fi

    log_success "OpenClash 配置完成"
    show_openclash_config_guide

    return 0
}

# 检查 OpenClash 是否已安装
check_openclash_installed() {
    # 检查服务脚本
    if [ -f "/etc/init.d/openclash" ]; then
        return 0
    fi

    # 检查 LuCI 应用
    if opkg list-installed | grep -q "luci-app-openclash"; then
        return 0
    fi

    return 1
}

# 显示 OpenClash 安装指南
show_openclash_install_guide() {
    cat <<EOF

${YELLOW}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
${YELLOW}${BOLD}  OpenClash 需要手动安装${NC}
${YELLOW}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

${BOLD}方法 1: 通过 opkg 安装 (推荐)${NC}
  ${CYAN}opkg update${NC}
  ${CYAN}opkg install luci-app-openclash${NC}

${BOLD}方法 2: 通过 LuCI Web 界面${NC}
  1. 访问: ${CYAN}http://${OPENWRT_IP}${NC}
  2. 进入 ${CYAN}系统 → 软件包${NC}
  3. 点击 ${CYAN}更新列表${NC}
  4. 搜索 ${CYAN}openclash${NC}
  5. 点击 ${CYAN}安装${NC}

${BOLD}方法 3: 从 GitHub 下载 ipk 包${NC}
  访问: ${DIM}https://github.com/vernesong/OpenClash/releases${NC}

${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

安装完成后，请重新运行此脚本。

EOF
}

# 下载 OpenClash 配置模板
download_openclash_config() {
    local config_dir="/etc/openclash"
    local config_file="${config_dir}/config.yaml"
    local template_url="${CDN_BASE_URL}/clash/config/config-mihomo.yaml.example"

    log_info "下载配置模板..."

    # 确保目录存在
    mkdir -p "${config_dir}"

    # 下载模板
    if ! download_file "${template_url}" "${config_file}" "OpenClash 配置模板"; then
        return 1
    fi

    log_success "配置模板下载完成"
    return 0
}

# 验证 OpenClash 配置
validate_openclash_config() {
    local config_file="/etc/openclash/config.yaml"

    log_info "验证配置文件..."

    # 检查文件是否存在
    if [ ! -f "${config_file}" ]; then
        log_error "配置文件不存在: ${config_file}"
        return 1
    fi

    # 使用 mihomo 验证配置
    if command -v mihomo >/dev/null 2>&1; then
        if mihomo -t -d /etc/openclash >/dev/null 2>&1; then
            log_success "配置文件验证通过"
            return 0
        else
            log_error "配置文件格式错误"
            log_info "手动验证: mihomo -t -d /etc/openclash"
            return 1
        fi
    else
        log_warn "未找到 mihomo，跳过配置验证"
        return 0
    fi
}

# 启动 OpenClash 服务
start_openclash_service() {
    log_info "启动 OpenClash 服务..."

    # 停止服务（如果正在运行）
    if check_service_status "openclash"; then
        log_info "停止现有服务..."
        stop_service "openclash"
        sleep 2
    fi

    # 启动服务
    if ! start_service "openclash"; then
        log_error "OpenClash 启动失败"
        log_info "查看日志: logread | grep openclash"
        return 1
    fi

    # 启用自启动
    enable_service "openclash"

    # 等待服务启动
    log_info "等待服务启动..."
    local max_wait=30
    local elapsed=0

    while [ ${elapsed} -lt ${max_wait} ]; do
        if check_port_listening "${CLASH_DNS_PORT}"; then
            echo ""
            log_success "OpenClash 服务已启动"
            return 0
        fi

        echo -ne "\r${BLUE}[INFO]${NC} 等待 DNS 端口 ${CLASH_DNS_PORT} 启动... (${elapsed}s/${max_wait}s)  "
        sleep 2
        elapsed=$((elapsed + 2))
    done

    echo ""
    log_warn "服务启动超时，请检查日志"
    return 1
}

# 显示 OpenClash 手动配置指南
show_openclash_manual_guide() {
    cat <<EOF

${BOLD}${CYAN}OpenClash 手动配置指南${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${BOLD}方法 1: 通过 LuCI Web 界面配置${NC}
  1. 访问: ${CYAN}http://${OPENWRT_IP}/cgi-bin/luci/admin/services/openclash${NC}
  2. 进入 ${CYAN}配置文件管理${NC}
  3. 上传配置文件或在线编辑
  4. 填写 Sub-Store 订阅链接

${BOLD}方法 2: 通过命令行配置${NC}
  1. 下载配置模板:
     ${DIM}wget ${CDN_BASE_URL}/clash/config/config-mihomo.yaml.example \\
       -O /etc/openclash/config.yaml${NC}

  2. 编辑配置文件:
     ${DIM}vi /etc/openclash/config.yaml${NC}

  3. 修改 proxy-providers 部分:
     ${DIM}url: "YOUR_SUBSTORE_URL"${NC}

  4. 启动服务:
     ${DIM}/etc/init.d/openclash start${NC}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
}

# 显示 OpenClash 配置指南
show_openclash_config_guide() {
    cat <<EOF

${BOLD}${GREEN}OpenClash 后续配置步骤${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━���━━━━━━━━━

${BOLD}1. 配置订阅源${NC}
   访问 OpenClash 管理界面:
   ${CYAN}http://${OPENWRT_IP}/cgi-bin/luci/admin/services/openclash${NC}

   编辑配置文件，修改 ${YELLOW}proxy-providers${NC} 部分:
   ${DIM}proxy-providers:
     Provider1:
       type: http
       url: "http://127.0.0.1:${SUBSTORE_WEB_PORT}/api/sub?target=clash&url=..."
       interval: 600${NC}

   ${BOLD}提示:${NC} 在 Sub-Store 中复制订阅链接，粘贴到这里

${BOLD}2. 验证 DNS 配置${NC}
   确认配置文件中的 DNS 设置:
   ${DIM}dns:
     enable: true
     listen: 127.0.0.1:${CLASH_DNS_PORT}
     enhanced-mode: fake-ip${NC}

${BOLD}3. 测试服务${NC}
   ${CYAN}nslookup google.com 127.0.0.1 -port=${CLASH_DNS_PORT}${NC}

${BOLD}详细配置文档:${NC}
   ${DIM}https://github.com/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/clash/CONFIGURATION.md${NC}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
}
