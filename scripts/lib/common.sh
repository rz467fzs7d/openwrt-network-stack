#!/bin/bash
# common.sh - 通用函数库

# ============================================
# 颜色和样式
# ============================================

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# 样式定义
BOLD='\033[1m'
DIM='\033[2m'
UNDERLINE='\033[4m'

# ============================================
# 日志函数
# ============================================

# 初始化日志
init_log() {
    local timestamp=$(date +%Y%m%d-%H%M%S)
    LOG_FILE="${LOG_DIR}/openwrt-deploy-${timestamp}.log"
    mkdir -p "${LOG_DIR}"
    touch "${LOG_FILE}"
    echo "部署日志: ${LOG_FILE}"
}

# 记录到日志文件
log_to_file() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] ${message}" >> "${LOG_FILE}"
}

# 信息日志
log_info() {
    local message="$1"
    echo -e "${BLUE}[INFO]${NC} ${message}"
    log_to_file "[INFO] ${message}"
}

# 成功日志
log_success() {
    local message="$1"
    echo -e "${GREEN}[SUCCESS]${NC} ${message}"
    log_to_file "[SUCCESS] ${message}"
}

# 警告日志
log_warn() {
    local message="$1"
    echo -e "${YELLOW}[WARN]${NC} ${message}"
    log_to_file "[WARN] ${message}"
}

# 错误日志
log_error() {
    local message="$1"
    echo -e "${RED}[ERROR]${NC} ${message}" >&2
    log_to_file "[ERROR] ${message}"
}

# 步骤标题
log_step() {
    local step="$1"
    local title="$2"
    echo ""
    echo -e "${PURPLE}${BOLD}[${step}]${NC} ${WHITE}${title}${NC}"
    echo "============================================"
    log_to_file "[STEP ${step}] ${title}"
}

# ============================================
# 交互函数
# ============================================

# 询问是/否
ask_yes_no() {
    local prompt="$1"
    local default="${2:-n}" # 默认为 No

    if [ "${default}" = "y" ]; then
        local options="[Y/n]"
        local default_val="y"
    else
        local options="[y/N]"
        local default_val="n"
    fi

    while true; do
        echo -ne "${CYAN}${prompt} ${options}:${NC} "
        read -r response
        response=${response:-${default_val}}

        case "${response}" in
            [Yy]* ) return 0;;
            [Nn]* ) return 1;;
            * ) echo "请输入 y 或 n";;
        esac
    done
}

# 询问输入（带默认值）
ask_input() {
    local prompt="$1"
    local default="$2"
    local response

    echo -ne "${CYAN}${prompt}${NC}"
    if [ -n "${default}" ]; then
        echo -ne " ${DIM}[默认: ${default}]${NC}"
    fi
    echo -ne ": "

    read -r response
    echo "${response:-${default}}"
}

# 确认继续
confirm_continue() {
    local message="${1:-是否继续}"
    if ! ask_yes_no "${message}" "y"; then
        log_warn "用户取消操作"
        exit 0
    fi
}

# ============================================
# 系统检查函数
# ============================================

# 检查是否为 root 用户
check_root() {
    if [ "$(id -u)" != "0" ]; then
        log_error "此脚本需要 root 权限运行"
        log_info "请使用: sudo $0"
        exit 1
    fi
}

# 检查是否为 OpenWrt 系统
check_openwrt() {
    if [ ! -f /etc/openwrt_release ]; then
        log_error "当前系统不是 OpenWrt"
        log_info "此脚本仅支持 OpenWrt 系统"
        exit 1
    fi

    # 读取版本信息
    source /etc/openwrt_release
    log_info "检测到 OpenWrt 系统: ${DISTRIB_DESCRIPTION}"

    # 检查版本号
    local version_major=$(echo "${DISTRIB_RELEASE}" | cut -d. -f1)
    if [ "${version_major}" -lt 23 ]; then
        log_warn "建议使用 OpenWrt 23.05 或更高版本"
        confirm_continue "是否继续部署"
    fi
}

# 检查网络连通性
check_network() {
    log_info "检查网络连通性..."

    # 测试 DNS
    if ! nslookup github.com >/dev/null 2>&1; then
        log_error "无法解析域名，请检查 DNS 配置"
        return 1
    fi

    # 测试外网连接
    local test_urls=(
        "8.8.8.8"
        "www.google.com"
        "cdn.jsdelivr.net"
    )

    for url in "${test_urls[@]}"; do
        if ping -c 1 -W 3 "${url}" >/dev/null 2>&1; then
            log_success "网络连接正常 (${url})"
            return 0
        fi
    done

    log_error "无法连接外网，请检查网络配置"
    return 1
}

# 检查磁盘空间
check_disk_space() {
    local required_mb=500
    local available_kb=$(df / | tail -1 | awk '{print $4}')
    local available_mb=$((available_kb / 1024))

    log_info "检查磁盘空间..."
    log_info "可用空间: ${available_mb} MB"

    if [ "${available_mb}" -lt "${required_mb}" ]; then
        log_error "磁盘空间不足 (需要至少 ${required_mb} MB)"
        log_info "可用空间: ${available_mb} MB"
        return 1
    fi

    log_success "磁盘空间充足"
    return 0
}

# 检查端口占用
check_port() {
    local port="$1"
    local service_name="${2:-}"

    if netstat -tuln 2>/dev/null | grep -q ":${port} "; then
        if [ -n "${service_name}" ]; then
            log_warn "端口 ${port} 已被占用 (${service_name})"
        else
            log_warn "端口 ${port} 已被占用"
        fi
        return 1
    fi
    return 0
}

# ============================================
# 命令执行函数
# ============================================

# 带重试的命令执行
run_with_retry() {
    local cmd="$1"
    local max_attempts="${2:-${MAX_RETRY}}"
    local attempt=1

    while [ ${attempt} -le ${max_attempts} ]; do
        log_info "执行命令 (尝试 ${attempt}/${max_attempts}): ${cmd}"

        if eval "${cmd}"; then
            return 0
        fi

        if [ ${attempt} -lt ${max_attempts} ]; then
            log_warn "命令执行失败，${RETRY_INTERVAL} 秒后重试..."
            sleep ${RETRY_INTERVAL}
        fi

        attempt=$((attempt + 1))
    done

    log_error "命令执行失败，已重试 ${max_attempts} 次"
    return 1
}

# 安全执行命令（失败则退出）
run_or_exit() {
    local cmd="$1"
    local error_msg="${2:-命令执行失败}"

    if ! eval "${cmd}"; then
        log_error "${error_msg}"
        log_error "执行的命令: ${cmd}"
        exit 1
    fi
}

# ============================================
# 文件操作函数
# ============================================

# 备份文件
backup_file() {
    local file="$1"

    if [ ! -f "${file}" ]; then
        return 0
    fi

    local timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_path="${BACKUP_DIR}/$(basename ${file}).backup-${timestamp}"

    mkdir -p "${BACKUP_DIR}"

    if cp "${file}" "${backup_path}"; then
        log_success "已备份: ${file} -> ${backup_path}"
        return 0
    else
        log_error "备份失败: ${file}"
        return 1
    fi
}

# 下载文件（带重试）
download_file() {
    local url="$1"
    local output="$2"
    local description="${3:-文件}"

    log_info "下载 ${description}: ${url}"

    # 尝试使用 wget
    if command -v wget >/dev/null 2>&1; then
        if run_with_retry "wget -q -O '${output}' '${url}'"; then
            log_success "下载完成: ${output}"
            return 0
        fi
    fi

    # 尝试使用 curl
    if command -v curl >/dev/null 2>&1; then
        if run_with_retry "curl -sL -o '${output}' '${url}'"; then
            log_success "下载完成: ${output}"
            return 0
        fi
    fi

    log_error "下载失败: ${url}"
    return 1
}

# ============================================
# 服务管理函数
# ============================================

# 启动服务
start_service() {
    local service="$1"

    log_info "启动服务: ${service}"

    if /etc/init.d/${service} start; then
        log_success "服务已启动: ${service}"
        return 0
    else
        log_error "服务启动失败: ${service}"
        return 1
    fi
}

# 停止服务
stop_service() {
    local service="$1"

    log_info "停止服务: ${service}"

    if /etc/init.d/${service} stop; then
        log_success "服务已停止: ${service}"
        return 0
    else
        log_error "服务停止失败: ${service}"
        return 1
    fi
}

# 重启服务
restart_service() {
    local service="$1"

    log_info "重启服务: ${service}"

    if /etc/init.d/${service} restart; then
        log_success "服务已重启: ${service}"
        return 0
    else
        log_error "服务重启失败: ${service}"
        return 1
    fi
}

# 启用服务自启动
enable_service() {
    local service="$1"

    log_info "设置服务自启动: ${service}"

    if /etc/init.d/${service} enable; then
        log_success "服务自启动已启用: ${service}"
        return 0
    else
        log_error "启用服务自启动失败: ${service}"
        return 1
    fi
}

# 检查服务状态
check_service_status() {
    local service="$1"

    if /etc/init.d/${service} status >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# ============================================
# 进度显示
# ============================================

# 显示进度
show_progress() {
    local current="$1"
    local total="$2"
    local message="$3"

    local percentage=$((current * 100 / total))
    echo -ne "\r${BLUE}[${current}/${total}]${NC} ${message} (${percentage}%)  "

    if [ ${current} -eq ${total} ]; then
        echo ""
    fi
}

# ============================================
# IP 地址验证
# ============================================

# 验证 IP 地址格式
validate_ip() {
    local ip="$1"
    local regex='^([0-9]{1,3}\.){3}[0-9]{1,3}$'

    if [[ ! ${ip} =~ ${regex} ]]; then
        return 1
    fi

    # 检查每个字段是否在 0-255 范围内
    local IFS='.'
    read -ra octets <<< "${ip}"
    for octet in "${octets[@]}"; do
        if [ ${octet} -gt 255 ]; then
            return 1
        fi
    done

    return 0
}

# ============================================
# 清理函数
# ============================================

# 清理临时文件
cleanup() {
    log_info "清理临时文件..."
    # 在这里添加需要清理的临时文件
}

# 注册退出时的清理函数
trap cleanup EXIT
