#!/bin/bash
# network.sh - 网络配置

# 配置主路由 DHCP
configure_main_router() {
    log_step "6/6" "配置主路由 DHCP"

    log_info "主路由配置说明:"
    echo ""
    echo "需要在主路由上配置 DHCP Option 6 (DNS)，将客户端 DNS 指向旁路由："
    echo ""
    echo "  ${CYAN}DNS 服务器: ${OPENWRT_IP}${NC}"
    echo ""

    # 检测当前网关
    local current_gateway=$(get_default_gateway)
    if [ -n "${current_gateway}" ]; then
        log_info "检测到主路由 IP: ${current_gateway}"
        if [ "${current_gateway}" != "${MAIN_ROUTER_IP}" ]; then
            log_warn "主路由 IP 与配置不符"
            log_info "配置中的主路由: ${MAIN_ROUTER_IP}"
            log_info "检测到的主路由: ${current_gateway}"

            if ask_yes_no "是否更新配置中的主路由 IP" "y"; then
                MAIN_ROUTER_IP="${current_gateway}"
                log_success "已更新主路由 IP: ${MAIN_ROUTER_IP}"
            fi
        fi
    fi

    # 显示配置指南
    show_main_router_guide

    # 等待用户确认
    if ask_yes_no "是否已完成主路由配置" "n"; then
        log_success "主路由配置确认完成"
        return 0
    else
        log_warn "请完成主路由配置后再继续"
        log_info "配置完成后，客户端需重新获取 IP 地址"
        return 1
    fi
}

# 显示主路由配置指南
show_main_router_guide() {
    cat <<EOF

${BOLD}${CYAN}主路由 DHCP 配置指南${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${BOLD}方法 1: 通过路由器 Web 界面配置 (推荐)${NC}

  1. 登录主路由管理界面
     ${DIM}通常是: http://${MAIN_ROUTER_IP}${NC}

  2. 进入 DHCP 设置
     ${DIM}位置可能在: 网络设置 → DHCP 服务器${NC}

  3. 设置主 DNS 服务器
     ${CYAN}主 DNS: ${OPENWRT_IP}${NC}
     ${DIM}备用 DNS: ${MAIN_ROUTER_IP} (可选)${NC}

  4. 保存并重启 DHCP 服务

${BOLD}方法 2: OpenWrt 主路由命令行配置${NC}

  如果主路由也是 OpenWrt，可以使用命令:

  ${DIM}# 设置 DHCP Option 6 (DNS)
  uci set dhcp.lan.dhcp_option='6,${OPENWRT_IP}'
  uci commit dhcp
  /etc/init.d/dnsmasq restart${NC}

${BOLD}方法 3: 其他品牌路由器参考${NC}

  ${DIM}小米路由器: 高级设置 → DHCP → DNS 设置
  华硕路由器: 内部网络 (LAN) → DHCP 服务器
  TP-Link: 网络参数 → DHCP 服务器
  Netgear: 高级 → 设置 → LAN 设置${NC}

${BOLD}验证配置${NC}

  配置完成后，客户端重新获取 IP:
  ${CYAN}# Windows
  ipconfig /release
  ipconfig /renew

  # Linux/macOS
  sudo dhclient -r
  sudo dhclient${NC}

  检查 DNS 服务器:
  ${CYAN}# Windows
  ipconfig /all | findstr DNS

  # Linux/macOS
  cat /etc/resolv.conf${NC}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${YELLOW}${BOLD}重要提示:${NC}
- 配置后需要客户端重新获取 IP 地址才能生效
- 确保旁路由 IP (${OPENWRT_IP}) 在主路由的 DHCP 地址池外
- 建议设置主路由 DHCP 地址池: ${CLIENT_IP_START} - ${CLIENT_IP_END}

EOF
}

# 获取默认网关
get_default_gateway() {
    # 尝试多种方法获取网关
    local gateway=""

    # 方法 1: route 命令
    if command -v route >/dev/null 2>&1; then
        gateway=$(route -n | grep '^0.0.0.0' | awk '{print $2}' | head -1)
    fi

    # 方法 2: ip route 命令
    if [ -z "${gateway}" ] && command -v ip >/dev/null 2>&1; then
        gateway=$(ip route | grep '^default' | awk '{print $3}' | head -1)
    fi

    echo "${gateway}"
}

# 获取当前 IP 地址
get_current_ip() {
    local interface="${1:-lan}"
    local ip=""

    # 尝试从网络接口获取
    if command -v ip >/dev/null 2>&1; then
        ip=$(ip addr show "${interface}" 2>/dev/null | grep 'inet ' | awk '{print $2}' | cut -d'/' -f1 | head -1)
    fi

    # 备用方法：从 uci 配置读取
    if [ -z "${ip}" ]; then
        ip=$(uci get network.lan.ipaddr 2>/dev/null)
    fi

    echo "${ip}"
}

# 检测网络配置
detect_network_config() {
    log_info "检测当前网络配置..."

    # 获取当前 IP
    local current_ip=$(get_current_ip)
    if [ -n "${current_ip}" ]; then
        log_info "当前 LAN IP: ${current_ip}"

        if [ "${current_ip}" != "${OPENWRT_IP}" ]; then
            log_warn "当前 IP 与配置不符"
            log_info "配置中的 IP: ${OPENWRT_IP}"
            log_info "当前 IP: ${current_ip}"
        fi
    fi

    # 获取网关
    local gateway=$(get_default_gateway)
    if [ -n "${gateway}" ]; then
        log_info "当前网关: ${gateway}"
    fi

    # 获取子网掩码
    local netmask=$(uci get network.lan.netmask 2>/dev/null || echo "255.255.255.0")
    log_info "子网掩码: ${netmask}"

    return 0
}

# 确认网络配置
confirm_network_config() {
    log_step "1/6" "确认网络配置"

    # 显示当前配置
    echo ""
    echo "${BOLD}当前网络配置:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  旁路由 IP:     ${CYAN}${OPENWRT_IP}${NC}"
    echo "  主路由 IP:     ${CYAN}${MAIN_ROUTER_IP}${NC}"
    echo "  客户端范围:    ${CYAN}${CLIENT_IP_START} - ${CLIENT_IP_END}${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # 检测当前配置
    detect_network_config
    echo ""

    # 询问是否使用默认配置
    if ask_yes_no "是否使用以上配置" "y"; then
        log_success "使用默认配置"
        return 0
    fi

    # 自定义配置
    log_info "自定义网络配置"
    echo ""

    # 输入旁路由 IP
    while true; do
        local new_ip=$(ask_input "旁路由 IP" "${OPENWRT_IP}")
        if validate_ip "${new_ip}"; then
            OPENWRT_IP="${new_ip}"
            log_success "旁路由 IP 已设置: ${OPENWRT_IP}"
            break
        else
            log_error "无效的 IP 地址格式"
        fi
    done

    # 输入主路由 IP
    while true; do
        local new_gateway=$(ask_input "主路由 IP" "${MAIN_ROUTER_IP}")
        if validate_ip "${new_gateway}"; then
            MAIN_ROUTER_IP="${new_gateway}"
            log_success "主路由 IP 已设置: ${MAIN_ROUTER_IP}"
            break
        else
            log_error "无效的 IP 地址格式"
        fi
    done

    # 确认配置
    echo ""
    echo "${BOLD}新的网络配置:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  旁路由 IP:     ${CYAN}${OPENWRT_IP}${NC}"
    echo "  主路由 IP:     ${CYAN}${MAIN_ROUTER_IP}${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    confirm_continue "确认使用新配置"

    return 0
}

# 验证网络连通性
verify_network_connectivity() {
    log_info "验证网络连通性..."

    # 测试到主路由的连接
    if ping -c 1 -W 3 "${MAIN_ROUTER_IP}" >/dev/null 2>&1; then
        log_success "主路由连接正常: ${MAIN_ROUTER_IP}"
    else
        log_warn "无法连接到主路由: ${MAIN_ROUTER_IP}"
    fi

    # 测试���网连接
    if check_network; then
        log_success "外网连接正常"
    else
        log_warn "外网连接异常"
    fi

    return 0
}

# 检查 IP 冲突
check_ip_conflict() {
    local ip="$1"

    log_info "检查 IP 冲突: ${ip}"

    # 使用 arping 检测（如果可用）
    if command -v arping >/dev/null 2>&1; then
        if arping -c 2 -w 3 -I br-lan "${ip}" 2>/dev/null | grep -q "Unicast reply"; then
            log_warn "检测到 IP 冲突: ${ip}"
            return 1
        fi
    fi

    # 使用 ping 检测
    if ping -c 1 -W 2 "${ip}" >/dev/null 2>&1; then
        local current_ip=$(get_current_ip)
        if [ "${ip}" != "${current_ip}" ]; then
            log_warn "IP 地址可能已被使用: ${ip}"
            return 1
        fi
    fi

    log_success "未检测到 IP 冲突"
    return 0
}

# 配置静态 IP（如果需要）
configure_static_ip() {
    local target_ip="$1"
    local current_ip=$(get_current_ip)

    if [ "${current_ip}" = "${target_ip}" ]; then
        log_info "IP 地址已正确配置: ${target_ip}"
        return 0
    fi

    log_info "配置静态 IP: ${target_ip}"

    # 备份网络配置
    backup_file "/etc/config/network"

    # 设置 LAN IP
    uci set network.lan.ipaddr="${target_ip}"
    uci set network.lan.gateway="${MAIN_ROUTER_IP}"
    uci commit network

    log_warn "网络配置已更改，需要重启网络服务"
    if ask_yes_no "是否现在重启网络服务" "n"; then
        log_warn "重启网络服务可能会断开当前连接"
        confirm_continue "确认重启"

        restart_service "network"

        log_info "等待网络恢复..."
        sleep 10

        log_success "网络服务已重启"
        log_info "新的 IP 地址: ${target_ip}"
        log_warn "如果连接断开，请使用新 IP 重新连接"
    else
        log_warn "请手动重启网络服务: /etc/init.d/network restart"
    fi

    return 0
}
