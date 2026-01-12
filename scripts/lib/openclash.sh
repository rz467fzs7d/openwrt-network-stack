#!/bin/bash
# openclash.sh - OpenClash 配置

# 配置 OpenClash
configure_openclash() {
    log_step "4/5" "配置 OpenClash (智能分流)"

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

    # 询问用户订阅地址
    local subscription_url=""
    echo ""
    while true; do
        subscription_url=$(ask_input "请输入订阅地址" "")
        if [ -n "${subscription_url}" ]; then
            break
        fi
        log_warn "订阅地址不能为空"
    done

    log_info "订阅地址: ${subscription_url}"

    # 生成配置文件
    if ! generate_openclash_config "${subscription_url}"; then
        log_error "配置文件生成失败"
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

# 生成 OpenClash 配置文件
generate_openclash_config() {
    local subscription_url="$1"
    local config_dir="/etc/openclash"
    local config_file="${config_dir}/config.yaml"

    log_info "生成 OpenClash 配置文件..."

    # 确保目录存在
    mkdir -p "${config_dir}"

    # 生成配置文件，自动设置核心参数
    # OpenClash 不劫持 DNS，只作为 AdGuard Home 的上游
    cat > "${config_file}" <<EOF
# OpenClash 配置文件
# 自动生成 $(date '+%Y-%m-%d %H:%M:%S')
# 作为 AdGuard Home 的上游 DNS，不劫持系统 DNS

# ============================================
# 端口配置
# ============================================
port: ${CLASH_PROXY_PORT}
socks-port: 7891
mixed-port: 7892

# 外部控制
external-controller: 0.0.0.0:9090
secret: ""

# ============================================
# 运行模式
# ============================================
mode: rule
ipv6: false
log-level: info

# 允许局域网连接
allow-lan: true
bind-address: "*"

# ============================================
# DNS 配置
# ============================================
dns:
  enable: true
  # 监听本地端口，作为 AdGuard Home 的上游
  listen: 127.0.0.1:${CLASH_DNS_PORT}
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16

  # Fake-IP 过滤
  fake-ip-filter:
    - "*.lan"
    - "*.local"
    - "+.msftconnecttest.com"
    - "+.msftncsi.com"

  # 默认 DNS 服务器
  default-nameserver:
    - 223.5.5.5
    - 119.29.29.29

  # 主 DNS 服务器
  nameserver:
    - 223.5.5.5
    - 119.29.29.29

  # fallback DNS（国外域名）
  fallback:
    - https://1.1.1.1/dns-query
    - https://8.8.8.8/dns-query

  fallback-filter:
    geoip: true
    geoip-code: CN

# ============================================
# 代理提供者（订阅源）
# ============================================
proxy-providers:
  Main:
    type: http
    url: "${subscription_url}"
    interval: 3600
    path: ./proxies/main.yaml
    health-check:
      enable: true
      interval: 600
      url: http://www.gstatic.com/generate_204

# ============================================
# 代理组
# ============================================
proxy-groups:
  # 主选择组
  - name: "PROXY"
    type: select
    use:
      - Main
    proxies:
      - "Auto"
      - "DIRECT"

  # 自动选择组
  - name: "Auto"
    type: url-test
    use:
      - Main
    url: http://www.gstatic.com/generate_204
    interval: 300

# ============================================
# 规则集
# ============================================
rule-providers:
  reject:
    type: http
    behavior: domain
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/reject.txt"
    path: ./ruleset/reject.yaml
    interval: 86400

  icloud:
    type: http
    behavior: domain
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/icloud.txt"
    path: ./ruleset/icloud.yaml
    interval: 86400

  apple:
    type: http
    behavior: domain
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/apple.txt"
    path: ./ruleset/apple.yaml
    interval: 86400

  google:
    type: http
    behavior: domain
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/google.txt"
    path: ./ruleset/google.yaml
    interval: 86400

  proxy:
    type: http
    behavior: domain
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/proxy.txt"
    path: ./ruleset/proxy.yaml
    interval: 86400

  direct:
    type: http
    behavior: domain
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/direct.txt"
    path: ./ruleset/direct.yaml
    interval: 86400

  cncidr:
    type: http
    behavior: ipcidr
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/cncidr.txt"
    path: ./ruleset/cncidr.yaml
    interval: 86400

  lancidr:
    type: http
    behavior: ipcidr
    url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/lancidr.txt"
    path: ./ruleset/lancidr.yaml
    interval: 86400

# ============================================
# 规则
# ============================================
rules:
  # 广告拦截
  - RULE-SET,reject,REJECT

  # Apple 服务
  - RULE-SET,icloud,DIRECT
  - RULE-SET,apple,DIRECT

  # Google 服务
  - RULE-SET,google,PROXY

  # 代理域名
  - RULE-SET,proxy,PROXY

  # 国内域名
  - RULE-SET,direct,DIRECT

  # 局域网
  - RULE-SET,lancidr,DIRECT

  # 国内 IP
  - RULE-SET,cncidr,DIRECT

  # GeoIP CN
  - GEOIP,CN,DIRECT

  # 最终规则
  - MATCH,PROXY
EOF

    log_success "配置文件已生成: ${config_file}"
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

${BOLD}通过 LuCI Web 界面配置${NC}
  1. 访问: ${CYAN}http://${OPENWRT_IP}/cgi-bin/luci/admin/services/openclash${NC}
  2. 进入 ${CYAN}配置文件管理${NC}
  3. 上传配置文件或在线编辑
  4. 填写订阅链接

${BOLD}核心参数配置${NC}
  - DNS 端口: ${CYAN}127.0.0.1:${CLASH_DNS_PORT}${NC} (作为 AdGuard Home 上游)
  - 代理端口: ${CYAN}${CLASH_PROXY_PORT}${NC}
  - DNS 模式: ${CYAN}fake-ip${NC}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
}

# 显示 OpenClash 配置指南
show_openclash_config_guide() {
    cat <<EOF

${BOLD}${GREEN}OpenClash 配置完成${NC}
━━━━���━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${BOLD}管理地址:${NC}
   LuCI: ${CYAN}http://${OPENWRT_IP}/cgi-bin/luci/admin/services/openclash${NC}
   面板: ${CYAN}http://${OPENWRT_IP}:9090/ui${NC}

${BOLD}核心参数已自动配置:${NC}
   - DNS 端口: ${CYAN}127.0.0.1:${CLASH_DNS_PORT}${NC} (作为 AdGuard Home 上游)
   - 代理端口: ${CYAN}${CLASH_PROXY_PORT}${NC}
   - DNS 模式: ${CYAN}fake-ip${NC}
   - 规则模式: ${CYAN}rule${NC}

${BOLD}DNS 解析链:${NC}
   客户端 → AdGuard Home(:53) → OpenClash(:${CLASH_DNS_PORT}) → 上游 DNS

${BOLD}后续步骤:${NC}
   1. 访问管理界面检查代理节点
   2. 更新规则集（如需要）
   3. 测试代理连接

${BOLD}详细文档:${NC}
   ${DIM}https://github.com/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/clash/CONFIGURATION.md${NC}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
}
