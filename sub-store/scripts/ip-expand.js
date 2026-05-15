/**
 * ip-expand.js
 *
 * Sub-Store 节点 IP 拍平脚本
 *
 * 功能：
 * - 对支持的协议（ss、ssr、trojan、vmess、vless）解析 server 域名的所有 A/AAAA 记录
 * - 每个 IP 生成一个独立节点，server 替换为该 IP，名称追加 IP 后缀
 * - 不支持的协议直接透传
 *
 * 参数：
 * - protocols      支持拍平的协议列表（逗号分隔）  默认: ss,ssr
 * - ip_map         静态 server->IP 映射，格式:     默认: 空（走 DNS）
 *                  host1:ip1,ip2;host2:ip3,ip4
 *                  指定后对匹配的 server 直接用此映射，不发 DNS 请求
 * - dns_server     DNS 服务器地址                  默认: 1.1.1.1
 * - dns_port       DNS 服务器端口                  默认: 53
 * - concurrency    并发 DNS 查询数                 默认: 10
 * - timeout        单次 DNS 查询超时(ms)           默认: 3000
 * - ipv6           是否包含 AAAA 记录              默认: false
 * - name_suffix    节点名后缀模板，{ip} 替换为 IP  默认: ' {ip}'
 * - skip_if_ip     server 本身已是 IP 时跳过拍平   默认: true
 *
 * 使用示例（mode: link）：
 * https://cdn地址#protocols=ss,ssr&ip_map=example.com=1.2.3.4,5.6.7.8
 * https://cdn地址#protocols=ss,ssr&ipv6=false&name_suffix= [{ip}]
 */

const SUPPORTED_PROTOCOLS_DEFAULT = ['ss', 'ssr'];

async function operator(proxies = [], targetPlatform, context) {
    const $ = $substore;

    const protocols = ($arguments.protocols ?? SUPPORTED_PROTOCOLS_DEFAULT.join(','))
        .split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
    const staticIpMap = parseIpMap($arguments.ip_map ?? '');
    const dnsServer = $arguments.dns_server ?? '1.1.1.1';
    const dnsPort = parseInt($arguments.dns_port ?? 53);
    const concurrency = parseInt($arguments.concurrency ?? 10);
    const timeout = parseInt($arguments.timeout ?? 3000);
    const includeIPv6 = ($arguments.ipv6 ?? 'false') === 'true';
    const nameSuffix = $arguments.name_suffix ?? ' {ip}';
    const skipIfIp = ($arguments.skip_if_ip ?? 'true') !== 'false';
    const keepOriginal = ($arguments.keep_original ?? 'false') === 'true';

    $.info(`[IP-EXPAND] protocols=${protocols.join(',')} static_map=${Object.keys(staticIpMap).length} dns=${dnsServer}:${dnsPort} ipv6=${includeIPv6} keep_original=${keepOriginal} concurrency=${concurrency}`);

    // 分离需要拍平的节点和直接透传的节点
    const toExpand = [];
    const passthrough = [];

    for (let i = 0; i < proxies.length; i++) {
        const proxy = proxies[i];
        const type = (proxy.type || '').toLowerCase();
        if (protocols.includes(type)) {
            toExpand.push({ proxy, originalIndex: i });
        } else {
            passthrough.push({ proxy, originalIndex: i });
        }
    }

    $.info(`[IP-EXPAND] 需拍平: ${toExpand.length}, 直接透传: ${passthrough.length}`);

    // 并发 DNS 查询
    const expandResults = new Array(toExpand.length).fill(null);

    await executeAsyncTasks(
        toExpand.map((item, i) => async () => {
            const { proxy } = item;
            const server = proxy.server;

            if (!server) {
                expandResults[i] = [proxy];
                return;
            }

            // server 已是 IP，按参数决定是否跳过
            if (skipIfIp && isIPAddress(server)) {
                $.info(`[IP-EXPAND][${proxy.name}] server=${server} 已是 IP，跳过`);
                expandResults[i] = [proxy];
                return;
            }

            // 优先查静态映射
            let ips = staticIpMap[server] ?? null;
            if (ips) {
                $.info(`[IP-EXPAND][${proxy.name}] ${server} -> [${ips.join(', ')}] (static)`);
            } else {
                try {
                    ips = await resolveDNS(server, dnsServer, dnsPort, includeIPv6, timeout);
                    $.info(`[IP-EXPAND][${proxy.name}] ${server} -> [${ips.join(', ')}]`);
                } catch (e) {
                    $.error(`[IP-EXPAND][${proxy.name}] DNS 查询失败: ${e.message || String(e)}`);
                    expandResults[i] = [proxy];
                    return;
                }
            }

            if (!ips.length) {
                $.info(`[IP-EXPAND][${proxy.name}] 无解析结果，保留原节点`);
                expandResults[i] = [proxy];
                return;
            }

            const expanded = ips.map(ip => {
                const cloned = deepClone(proxy);
                cloned.server = ip;
                cloned.name = proxy.name + nameSuffix.replace('{ip}', ip);
                return cloned;
            });
            expandResults[i] = keepOriginal ? [proxy, ...expanded] : expanded;
        }),
        { concurrency }
    );

    // 按原始顺序重建结果：透传节点保持原位，拍平节点展开插入
    // 用 originalIndex 排序后合并
    const allItems = [
        ...passthrough.map(item => ({ originalIndex: item.originalIndex, nodes: [item.proxy] })),
        ...toExpand.map((item, i) => ({ originalIndex: item.originalIndex, nodes: expandResults[i] || [item.proxy] })),
    ];

    allItems.sort((a, b) => a.originalIndex - b.originalIndex);

    const result = [];
    for (const item of allItems) {
        result.push(...item.nodes);
    }

    $.info(`[IP-EXPAND] 完成: 输入 ${proxies.length} 节点 -> 输出 ${result.length} 节点`);
    return result;
}

// ============================================================
// DNS 查询（通过 DoH: Cloudflare / Google）
// ============================================================
async function resolveDNS(hostname, dnsServer, dnsPort, includeIPv6, timeout) {
    // Sub-Store 环境无法直接发 UDP DNS，使用 DoH（DNS over HTTPS）
    // 优先用参数指定的 dns_server 对应的 DoH 端点
    const dohUrl = getDohUrl(dnsServer);

    const types = ['A'];
    if (includeIPv6) types.push('AAAA');

    const ips = [];
    for (const type of types) {
        const url = `${dohUrl}?name=${encodeURIComponent(hostname)}&type=${type}`;
        try {
            const res = await httpRequest({
                method: 'get',
                url,
                headers: { Accept: 'application/dns-json' },
                timeout,
            });
            const body = JSON.parse(String(res.body));
            if (body.Answer) {
                for (const record of body.Answer) {
                    // type 1 = A, type 28 = AAAA
                    if ((type === 'A' && record.type === 1) || (type === 'AAAA' && record.type === 28)) {
                        const ip = record.data.trim();
                        if (ip && !ips.includes(ip)) ips.push(ip);
                    }
                }
            }
        } catch (e) {
            $substore.error(`[IP-EXPAND] DoH ${type} 查询失败 hostname=${hostname}: ${e.message || String(e)}`);
        }
    }

    return ips;
}

function getDohUrl(dnsServer) {
    const map = {
        '1.1.1.1': 'https://cloudflare-dns.com/dns-query',
        '1.0.0.1': 'https://cloudflare-dns.com/dns-query',
        '8.8.8.8': 'https://dns.google/resolve',
        '8.8.4.4': 'https://dns.google/resolve',
        '223.5.5.5': 'https://dns.alidns.com/resolve',
        '119.29.29.29': 'https://doh.pub/dns-query',
    };
    return map[dnsServer] ?? 'https://cloudflare-dns.com/dns-query';
}

function isIPAddress(str) {
    // IPv4
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(str)) return true;
    // IPv6（简单判断）
    if (/^[0-9a-fA-F:]+$/.test(str) && str.includes(':')) return true;
    return false;
}

// 解析 ip_map 参数: "host1:ip1,ip2;host2:ip3" -> { host1: ['ip1','ip2'], host2: ['ip3'] }
function parseIpMap(raw) {
    const map = {};
    if (!raw) return map;
    for (const entry of raw.split(';')) {
        const colon = entry.indexOf(':');
        if (colon === -1) continue;
        const host = entry.substring(0, colon).trim();
        const ips = entry.substring(colon + 1).split(',').map(s => s.trim()).filter(Boolean);
        if (host && ips.length) map[host] = ips;
    }
    return map;
}

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

async function httpRequest(opt = {}) {
    const reqMethod = opt.method || 'get';
    const reqTimeout = parseFloat(opt.timeout || 5000);
    const reqRetries = parseFloat(opt.retries ?? 1);
    const reqRetryDelay = parseFloat(opt.retry_delay ?? 1000);

    let count = 0;
    const fn = async () => {
        try {
            return await $substore.http[reqMethod]({ ...opt, timeout: reqTimeout });
        } catch (e) {
            if (count < reqRetries) {
                count++;
                await $substore.wait(reqRetryDelay * count);
                return fn();
            }
            throw e;
        }
    };
    return fn();
}

function executeAsyncTasks(tasks, { concurrency = 1 } = {}) {
    return new Promise((resolve, reject) => {
        let running = 0;
        let index = 0;

        function executeNext() {
            while (index < tasks.length && running < concurrency) {
                const taskIndex = index++;
                running++;
                tasks[taskIndex]()
                    .catch(e => $substore.error(e))
                    .finally(() => {
                        running--;
                        executeNext();
                    });
            }
            if (running === 0) resolve();
        }

        executeNext();
    });
}
