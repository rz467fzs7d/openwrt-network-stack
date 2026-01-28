#!/bin/sh
#
# DNS Benchmark Testing Script - Shell Version
# 适用于 OpenWrt 等轻量级 Linux 环境
#
# 支持协议:
# - UDP (传统DNS,需要dig命令)
# - DoH (DNS over HTTPS,需要curl命令)
#
# 依赖工具:
# - dig (bind-tools/bind-dig包)
# - curl (可选,用于DoH测试)
# - bc (可选,用于精确计算)

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 默认配置
DOMAIN="baidu.com"
PROTOCOL="udp"
ROUNDS=3
TIMEOUT=5
VERBOSE=0
SHOW_IP=0

# DNS服务器列表
# 格式: 名称|IP或URL|协议|区域
DNS_SERVERS="
阿里DNS|223.5.5.5|udp|CN
阿里DNS|223.6.6.6|udp|CN
阿里DoH|https://dns.alidns.com/dns-query|doh|CN
DNSPod|119.29.29.29|udp|CN
DNSPod|119.28.28.28|udp|CN
DNSPod DoH|https://doh.pub/dns-query|doh|CN
114DNS|114.114.114.114|udp|CN
百度DNS|180.76.76.76|udp|CN
Google DNS|8.8.8.8|udp|US
Google DNS|8.8.4.4|udp|US
Google DoH|https://dns.google/dns-query|doh|US
Cloudflare|1.1.1.1|udp|US
Cloudflare|1.0.0.1|udp|US
Cloudflare DoH|https://cloudflare-dns.com/dns-query|doh|US
Quad9|9.9.9.9|udp|CH
AdGuard|94.140.14.14|udp|CY
"

# 临时文件
TMPDIR="/tmp/dns_test_$$"
RESULTS_FILE="$TMPDIR/results.txt"

# 清理函数
cleanup() {
    [ -d "$TMPDIR" ] && rm -rf "$TMPDIR"
}
trap cleanup EXIT INT TERM

# 初始化
init() {
    mkdir -p "$TMPDIR"
    : > "$RESULTS_FILE"
}

# 打印帮助
usage() {
    cat <<EOF
DNS 性能测试工具 - Shell 版本

用法: $0 [选项]

选项:
  -d DOMAIN       测试域名 (默认: baidu.com)
  -p PROTOCOL     协议 udp/doh/all (默认: udp)
  -r REGION       区域 CN/US/all (默认: all)
  -n ROUNDS       测试轮数 (默认: 3)
  -t TIMEOUT      超时时间(秒) (默认: 5)
  -i              显示解析的IP地址
  -v              详细输出
  -h              显示帮助

示例:
  $0 -d google.com -p udp -r CN
  $0 -d baidu.com -p all -n 5
  $0 -d facebook.com -p doh -i

依赖:
  - dig: opkg install bind-dig
  - curl: opkg install curl (DoH测试需要)
EOF
    exit 0
}

# 检查依赖
check_dependencies() {
    local missing=""

    if ! command -v dig >/dev/null 2>&1; then
        missing="$missing dig"
    fi

    if [ "$PROTOCOL" = "doh" ] || [ "$PROTOCOL" = "all" ]; then
        if ! command -v curl >/dev/null 2>&1; then
            missing="$missing curl"
        fi
    fi

    if [ -n "$missing" ]; then
        echo "${RED}错误: 缺少必需工具:$missing${NC}"
        echo "安装方法:"
        echo "  opkg update"
        [ -n "$(echo $missing | grep dig)" ] && echo "  opkg install bind-dig"
        [ -n "$(echo $missing | grep curl)" ] && echo "  opkg install curl"
        exit 1
    fi
}

# 测试UDP DNS
test_udp_dns() {
    local name="$1"
    local server="$2"
    local domain="$3"
    local result_file="$4"

    local total_time=0
    local success_count=0
    local min_time=999999
    local max_time=0
    local ips=""

    for i in $(seq 1 $ROUNDS); do
        local start=$(date +%s%N 2>/dev/null || echo "0")
        local output=$(dig +short @"$server" "$domain" +time=$TIMEOUT +tries=1 2>&1)
        local ret=$?
        local end=$(date +%s%N 2>/dev/null || echo "0")

        if [ "$start" != "0" ] && [ "$end" != "0" ]; then
            local elapsed=$((($end - $start) / 1000000))
        else
            # 如果不支持纳秒,使用粗略估计
            elapsed=$((TIMEOUT * 1000))
        fi

        if [ $ret -eq 0 ] && [ -n "$output" ]; then
            # 提取IP地址(过滤CNAME等)
            local ip=$(echo "$output" | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
            if [ -n "$ip" ]; then
                success_count=$((success_count + 1))
                total_time=$((total_time + elapsed))
                [ $elapsed -lt $min_time ] && min_time=$elapsed
                [ $elapsed -gt $max_time ] && max_time=$elapsed
                [ -z "$ips" ] && ips="$ip"
            fi
        fi

        [ $VERBOSE -eq 1 ] && echo "  第${i}轮: ${elapsed}ms (返回码: $ret)"
    done

    if [ $success_count -gt 0 ]; then
        local avg_time=$((total_time / success_count))
        local success_rate=$((success_count * 100 / ROUNDS))
        echo "$name|$server|udp|$avg_time|$min_time|$max_time|$success_rate|$ips" >> "$result_file"
    else
        echo "$name|$server|udp|99999|0|0|0|" >> "$result_file"
    fi
}

# 测试DoH DNS
test_doh_dns() {
    local name="$1"
    local url="$2"
    local domain="$3"
    local result_file="$4"

    local total_time=0
    local success_count=0
    local min_time=999999
    local max_time=0
    local ips=""

    for i in $(seq 1 $ROUNDS); do
        local start=$(date +%s%N 2>/dev/null || echo "0")
        local output=$(curl -s -m $TIMEOUT \
            -H "Accept: application/dns-json" \
            "${url}?name=${domain}&type=A" 2>&1)
        local ret=$?
        local end=$(date +%s%N 2>/dev/null || echo "0")

        if [ "$start" != "0" ] && [ "$end" != "0" ]; then
            local elapsed=$((($end - $start) / 1000000))
        else
            elapsed=$((TIMEOUT * 1000))
        fi

        if [ $ret -eq 0 ] && echo "$output" | grep -q '"Answer"'; then
            # ��单解析JSON获取IP(不依赖jq)
            local ip=$(echo "$output" | grep -o '"data":"[0-9.]*"' | head -1 | cut -d'"' -f4)
            if [ -n "$ip" ]; then
                success_count=$((success_count + 1))
                total_time=$((total_time + elapsed))
                [ $elapsed -lt $min_time ] && min_time=$elapsed
                [ $elapsed -gt $max_time ] && max_time=$elapsed
                [ -z "$ips" ] && ips="$ip"
            fi
        fi

        [ $VERBOSE -eq 1 ] && echo "  第${i}轮: ${elapsed}ms (返回码: $ret)"
    done

    if [ $success_count -gt 0 ]; then
        local avg_time=$((total_time / success_count))
        local success_rate=$((success_count * 100 / ROUNDS))
        echo "$name|$url|doh|$avg_time|$min_time|$max_time|$success_rate|$ips" >> "$result_file"
    else
        echo "$name|$url|doh|99999|0|0|0|" >> "$result_file"
    fi
}

# 运行测试
run_tests() {
    local region_filter="$1"
    local protocol_filter="$2"

    echo "${BLUE}🚀 开始DNS性能测试...${NC}"
    echo "测试域名: $DOMAIN"
    echo "测试协议: $protocol_filter"
    echo "测试轮数: $ROUNDS"
    echo ""

    local count=0
    echo "$DNS_SERVERS" | while IFS='|' read -r name server proto region; do
        # 跳过空行
        [ -z "$name" ] && continue

        # 过滤区域
        if [ "$region_filter" != "all" ] && [ "$region" != "$region_filter" ]; then
            continue
        fi

        # 过滤协议
        if [ "$protocol_filter" != "all" ] && [ "$proto" != "$protocol_filter" ]; then
            continue
        fi

        count=$((count + 1))
        printf "${YELLOW}测试 [$count] %s (%s)...${NC}\n" "$name" "$proto"

        if [ "$proto" = "udp" ]; then
            test_udp_dns "$name" "$server" "$DOMAIN" "$RESULTS_FILE"
        elif [ "$proto" = "doh" ]; then
            test_doh_dns "$name" "$server" "$DOMAIN" "$RESULTS_FILE"
        fi
    done
}

# 打印结果
print_results() {
    echo ""
    echo "${BLUE}===============================================================================${NC}"
    echo "${BLUE}DNS 性能测试结果${NC}"
    echo "${BLUE}===============================================================================${NC}"
    printf "%-4s %-20s %-8s %-12s %-12s %-12s %-8s" "排名" "DNS服务商" "协议" "平均(ms)" "最小(ms)" "最大(ms)" "成功率"
    [ $SHOW_IP -eq 1 ] && printf " %-15s" "解析IP"
    echo ""
    echo "-------------------------------------------------------------------------------"

    # 按平均延迟排序
    local rank=1
    sort -t'|' -k4 -n "$RESULTS_FILE" | while IFS='|' read -r name server proto avg min max rate ip; do
        # 跳过失败的结果
        [ "$avg" = "99999" ] && continue

        # 生成排名标记
        local medal
        case $rank in
            1) medal="${GREEN}🥇${NC}" ;;
            2) medal="${GREEN}🥈${NC}" ;;
            3) medal="${GREEN}🥉${NC}" ;;
            *) medal="$rank." ;;
        esac

        printf "${medal} %-20s %-8s %10s  %10s  %10s  %6s%%" \
            "$name" "$proto" "$avg" "$min" "$max" "$rate"
        [ $SHOW_IP -eq 1 ] && [ -n "$ip" ] && printf " %-15s" "$ip"
        echo ""

        rank=$((rank + 1))
    done

    # 打印失败的测试
    local failed_count=$(grep -c '|99999|' "$RESULTS_FILE" 2>/dev/null | head -1 || echo "0")
    if [ "$failed_count" -gt 0 ] 2>/dev/null; then
        echo ""
        echo "${RED}失败的测试 ($failed_count):${NC}"
        grep '|99999|' "$RESULTS_FILE" | while IFS='|' read -r name server proto avg min max rate ip; do
            echo "  ${RED}✗${NC} $name ($proto)"
        done
    fi

    echo ""
}

# 打印推荐
print_recommendations() {
    echo "${BLUE}===============================================================================${NC}"
    echo "${BLUE}🎯 DNS 推荐${NC}"
    echo "${BLUE}===============================================================================${NC}"

    # 最快的国内DNS
    local fastest_cn=$(grep '|CN$' "$RESULTS_FILE" 2>/dev/null | grep -v '|99999|' | sort -t'|' -k4 -n | head -1)
    if [ -n "$fastest_cn" ]; then
        local name=$(echo "$fastest_cn" | cut -d'|' -f1)
        local server=$(echo "$fastest_cn" | cut -d'|' -f2)
        local proto=$(echo "$fastest_cn" | cut -d'|' -f3)
        local avg=$(echo "$fastest_cn" | cut -d'|' -f4)
        echo "${GREEN}🚀 最快国内DNS:${NC} $name ($proto) - ${avg}ms"
        echo "   服务器: $server"
        echo ""
    fi

    # 最快的国际DNS
    local fastest_intl=$(grep -v '|CN$' "$RESULTS_FILE" 2>/dev/null | grep -v '|99999|' | sort -t'|' -k4 -n | head -1)
    if [ -n "$fastest_intl" ]; then
        local name=$(echo "$fastest_intl" | cut -d'|' -f1)
        local server=$(echo "$fastest_intl" | cut -d'|' -f2)
        local proto=$(echo "$fastest_intl" | cut -d'|' -f3)
        local avg=$(echo "$fastest_intl" | cut -d'|' -f4)
        echo "${GREEN}🌐 最快国际DNS:${NC} $name ($proto) - ${avg}ms"
        echo "   服务器: $server"
        echo ""
    fi

    # 最可靠的DNS (成功率最高)
    local most_reliable=$(grep -v '|99999|' "$RESULTS_FILE" 2>/dev/null | sort -t'|' -k7 -nr | head -1)
    if [ -n "$most_reliable" ]; then
        local name=$(echo "$most_reliable" | cut -d'|' -f1)
        local rate=$(echo "$most_reliable" | cut -d'|' -f7)
        if [ "$rate" = "100" ]; then
            echo "${GREEN}✓ 最可靠DNS:${NC} $name - 成功率 ${rate}%"
            echo ""
        fi
    fi
}

# 污染检测
detect_pollution() {
    echo "${BLUE}🔍 检测 $DOMAIN 的 DNS 污染...${NC}"
    echo ""

    # 测试国内DNS
    echo "测试国内 DNS..."
    local cn_ips=""
    echo "$DNS_SERVERS" | grep '|CN$' | grep '|udp|' | head -3 | while IFS='|' read -r name server proto region; do
        [ -z "$name" ] && continue
        local ip=$(dig +short @"$server" "$DOMAIN" +time=$TIMEOUT +tries=1 2>/dev/null | grep -E '^[0-9.]+$' | head -1)
        [ -n "$ip" ] && echo "$ip"
    done > "$TMPDIR/cn_ips.txt"

    # 测试国际DNS
    echo "测试国际 DNS..."
    echo "$DNS_SERVERS" | grep -v '|CN$' | grep '|udp|' | head -3 | while IFS='|' read -r name server proto region; do
        [ -z "$name" ] && continue
        local ip=$(dig +short @"$server" "$DOMAIN" +time=$TIMEOUT +tries=1 2>/dev/null | grep -E '^[0-9.]+$' | head -1)
        [ -n "$ip" ] && echo "$ip"
    done > "$TMPDIR/intl_ips.txt"

    # 比较结果
    local cn_ips=$(sort -u "$TMPDIR/cn_ips.txt" | tr '\n' ' ')
    local intl_ips=$(sort -u "$TMPDIR/intl_ips.txt" | tr '\n' ' ')

    echo ""
    echo "国内DNS解析结果: ${cn_ips:-无}"
    echo "国际DNS解析结果: ${intl_ips:-无}"
    echo ""

    if [ -n "$cn_ips" ] && [ -n "$intl_ips" ] && [ "$cn_ips" != "$intl_ips" ]; then
        echo "${RED}⚠️  检测到 DNS 污染${NC}"
        echo "建议: 使用 DoH/DoT 或者配置代理访问"
    else
        echo "${GREEN}✅ 未检测到 DNS 污染${NC}"
    fi
}

# 主函数
main() {
    local region="all"
    local detect_poll=0

    # 解析参数
    while getopts "d:p:r:n:t:ivhP" opt; do
        case $opt in
            d) DOMAIN="$OPTARG" ;;
            p) PROTOCOL="$OPTARG" ;;
            r) region="$OPTARG" ;;
            n) ROUNDS="$OPTARG" ;;
            t) TIMEOUT="$OPTARG" ;;
            i) SHOW_IP=1 ;;
            v) VERBOSE=1 ;;
            P) detect_poll=1 ;;
            h) usage ;;
            *) usage ;;
        esac
    done

    # 初始化
    init

    # 检查依赖
    check_dependencies

    # 污染检测模式
    if [ $detect_poll -eq 1 ]; then
        detect_pollution
        exit 0
    fi

    # 运行测试
    run_tests "$region" "$PROTOCOL"

    # 打印结果
    print_results
    print_recommendations
}

# 运行主函数
main "$@"
