#!/bin/bash
# OpenWrt 网络栈一键部署脚本
# 版本: 1.0.0
# 作者: openwrt-network-stack
# 描述: 自动部署 AdGuard Home + OpenClash + Sub-Store

set -e

# ============================================
# 脚本路径
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${SCRIPT_DIR}/lib"
CONFIG_DIR="${SCRIPT_DIR}/config"

# ============================================
# 加载配置和库
# ============================================

# 加载默认配置
if [ -f "${CONFIG_DIR}/default.conf" ]; then
    source "${CONFIG_DIR}/default.conf"
else
    echo "错误: 未找到配置文件: ${CONFIG_DIR}/default.conf"
    exit 1
fi

# 加载用户自定义配置（如果存在）
if [ -f "${CONFIG_DIR}/custom.conf" ]; then
    source "${CONFIG_DIR}/custom.conf"
fi

# 加载库文件
for lib_file in "${LIB_DIR}"/*.sh; do
    if [ -f "${lib_file}" ]; then
        source "${lib_file}"
    fi
done

# ============================================
# 全局变量
# ============================================

DEPLOYMENT_START_TIME=$(date +%s)
DEPLOYMENT_STATUS="进行中"

# ============================================
# 帮助信息
# ============================================

show_help() {
    cat <<EOF
${BOLD}OpenWrt 网络栈一键部署脚本${NC}

${BOLD}用法:${NC}
  $0 [选项]

${BOLD}选项:${NC}
  -h, --help              显示此帮助信息
  -c, --config FILE       使用自定义配置文件
  -y, --yes               自动确认所有提示（使用默认配置）
  --skip-check            跳过系统检查
  --skip-network-check    跳过网络连通性检查

${BOLD}示例:${NC}
  $0                      # 交互式部署
  $0 -y                   # 自动部署（使用默认配置）
  $0 -c custom.conf       # 使用自定义配置文件

${BOLD}配置文件位置:${NC}
  ${CONFIG_DIR}/default.conf
  ${CONFIG_DIR}/custom.conf (可选)

${BOLD}日志位置:${NC}
  ${LOG_DIR}/openwrt-deploy-*.log

${BOLD}详细文档:${NC}
  https://github.com/${GITHUB_REPO}

EOF
}

# ============================================
# 横幅
# ============================================

show_banner() {
    cat <<'EOF'

   ___                  __        ____  ______
  / _ \ ___  ___ ___   / / /| /| / / / / / __/
 / // // _ \/ -_) _ \ | | / \/  V /|_/ |/ _/
/____// .__/\__/_//_/ | |__  __/\_\/_/|__/_/
     /_/               \_____/

  OpenWrt 网络栈一键部署
  AdGuard Home + OpenClash + Sub-Store

EOF
}

# ============================================
# 预检查
# ============================================

pre_deployment_check() {
    echo ""
    log_step "0/6" "系统环境检查"

    # 检查 root 权限
    check_root

    # 检查 OpenWrt 系统
    check_openwrt

    # 检查网络连通性
    if [ "${SKIP_NETWORK_CHECK}" != "true" ]; then
        if ! check_network; then
            log_error "网络连通性检查失败"
            if ! ask_yes_no "是否继续部署" "n"; then
                exit 1
            fi
        fi
    fi

    # 检查磁盘空间
    if ! check_disk_space; then
        log_error "磁盘空间不足"
        exit 1
    fi

    log_success "系统环境检查通过"
    echo ""
}

# ============================================
# 部署摘要
# ============================================

show_deployment_summary() {
    cat <<EOF

${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
${BOLD}${CYAN}  部署计划摘要${NC}
${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

${BOLD}网络配置:${NC}
  旁路由 IP:      ${CYAN}${OPENWRT_IP}${NC}
  主路由 IP:      ${CYAN}${MAIN_ROUTER_IP}${NC}

${BOLD}将要部署的组件:${NC}
  1. ${GREEN}AdGuard Home${NC}  - DNS 过滤和广告拦截
     DNS 端口:     ${CYAN}${AGH_DNS_PORT}${NC} (代替 dnsmasq)
     Web 端口:     ${CYAN}${AGH_WEB_PORT}${NC}

  2. ${GREEN}OpenClash${NC}      - 代理和智能分流
     DNS 端口:     ${CYAN}127.0.0.1:${CLASH_DNS_PORT}${NC} (作为 AGH 上游)
     代理端口:     ${CYAN}${CLASH_PROXY_PORT}${NC}
     ${YELLOW}(需要手动安装)${NC}

${BOLD}DNS 解析链:${NC}
  客户端 → AdGuard Home(:${AGH_DNS_PORT}) → OpenClash(:${CLASH_DNS_PORT}) → 上游 DNS

${BOLD}注意事项:${NC}
  - dnsmasq 将被完全停用并禁用自启动
  - OpenClash 需要手动安装后才能配置
  - 主路由需要设置 DHCP Option 6 (DNS) 为 ${CYAN}${OPENWRT_IP}${NC}

${BOLD}预计部署时间:${NC}
  约 ${CYAN}5-10 分钟${NC} (取决于网络速度)

${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

EOF

    confirm_continue "开始部署"
}

# ============================================
# 主部署流程
# ============================================

main_deployment() {
    local start_time=$(date +%s)

    # Stage 1: 确认网络配置
    if ! confirm_network_config; then
        log_error "网络配置失败"
        return 1
    fi

    # Stage 2: 部署 AdGuard Home
    if ! deploy_adguardhome; then
        log_error "AdGuard Home 部署失败"
        if ! ask_yes_no "是否继续部署其他组件" "y"; then
            return 1
        fi
    fi

    # Stage 3: 配置 OpenClash
    if ! configure_openclash; then
        log_warn "OpenClash 配置未完成"
        log_info "您可以稍后手动配置 OpenClash"
    fi

    # Stage 4: 配置主路由
    if ! configure_main_router; then
        log_warn "请记得配置主路由 DHCP 设置"
    fi

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    DEPLOYMENT_STATUS="完成"

    return 0
}

# ============================================
# 部署报告
# ============================================

show_deployment_report() {
    local end_time=$(date +%s)
    local total_duration=$((end_time - DEPLOYMENT_START_TIME))
    local minutes=$((total_duration / 60))
    local seconds=$((total_duration % 60))

    cat <<EOF

${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
${BOLD}${GREEN}  部署完成报告${NC}
${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

${BOLD}部署状态:${NC} ${GREEN}${DEPLOYMENT_STATUS}${NC}
${BOLD}总耗时:${NC}   ${CYAN}${minutes} 分 ${seconds} 秒${NC}

${BOLD}组件访问地址:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF

    # AdGuard Home
    if check_service_status "adguardhome" 2>/dev/null; then
        echo "  ${GREEN}✓${NC} AdGuard Home:  ${CYAN}http://${OPENWRT_IP}:${AGH_WEB_PORT}${NC}"
    else
        echo "  ${RED}✗${NC} AdGuard Home:  ${DIM}未运行${NC}"
    fi


    # OpenClash
    if check_service_status "openclash" 2>/dev/null; then
        echo "  ${GREEN}✓${NC} OpenClash:      ${CYAN}http://${OPENWRT_IP}/cgi-bin/luci/admin/services/openclash${NC}"
    else
        echo "  ${YELLOW}!${NC} OpenClash:      ${DIM}需要手动安装和配置${NC}"
    fi

    cat <<EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${BOLD}后续步骤:${NC}

  ${BOLD}1. 配置 AdGuard Home${NC}
     访问: ${CYAN}http://${OPENWRT_IP}:${AGH_WEB_PORT}${NC}
     - 设置管理员密码
     - 配置过滤规则
     - 设置上游 DNS: ${CYAN}127.0.0.1:${CLASH_DNS_PORT}${NC}



  ${BOLD}2. 配置主路由 DHCP${NC}
     - 设置 DNS 服务器: ${CYAN}${OPENWRT_IP}${NC}
     - 客户端重新获取 IP 地址

  ${BOLD}3. 测试验证${NC}
     ${DIM}nslookup google.com ${OPENWRT_IP}${NC}

${BOLD}文档和帮助:${NC}
  ${DIM}https://github.com/${GITHUB_REPO}${NC}

${BOLD}日志文件:${NC}
  ${DIM}${LOG_FILE}${NC}

${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

感谢使用 OpenWrt 网络栈一键部署脚本！

EOF
}

# ============================================
# 主函数
# ============================================

main() {
    # 解析命令行参数
    AUTO_YES=false
    SKIP_CHECK=false
    SKIP_NETWORK_CHECK=false
    CUSTOM_CONFIG=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -y|--yes)
                AUTO_YES=true
                shift
                ;;
            -c|--config)
                CUSTOM_CONFIG="$2"
                shift 2
                ;;
            --skip-check)
                SKIP_CHECK=true
                shift
                ;;
            --skip-network-check)
                SKIP_NETWORK_CHECK=true
                shift
                ;;
            *)
                echo "未知选项: $1"
                echo "使用 -h 或 --help 查看帮助"
                exit 1
                ;;
        esac
    done

    # 加载自定义配置
    if [ -n "${CUSTOM_CONFIG}" ]; then
        if [ -f "${CUSTOM_CONFIG}" ]; then
            source "${CUSTOM_CONFIG}"
            log_info "已加载自定义配置: ${CUSTOM_CONFIG}"
        else
            log_error "配置文件不存在: ${CUSTOM_CONFIG}"
            exit 1
        fi
    fi

    # 显示横幅
    show_banner

    # 初始化日志
    init_log

    # 预检查
    if [ "${SKIP_CHECK}" != "true" ]; then
        pre_deployment_check
    fi

    # 显示部署摘要
    show_deployment_summary

    # 执行部署
    if main_deployment; then
        show_deployment_report
        exit 0
    else
        log_error "部署过程中出现错误"
        log_info "查看日志: ${LOG_FILE}"
        exit 1
    fi
}

# ============================================
# 错误处理
# ============================================

trap 'echo ""; log_error "脚本异常退出"; exit 1' ERR INT TERM

# ============================================
# 启动脚本
# ============================================

main "$@"
