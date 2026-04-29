/**
 * parser.js
 *
 * Sub-Store 节点格式化脚本 - 探测、抛弃、重命名、排序 一次完成
 *
 * 功能特性：
 * - HTTP META 探测节点落地 region（国家/ISP）
 * - 单节点超时抛弃（latency > timeout 即丢弃）
 * - 支持 rename 模板（兼容 node-renamer 语法）
 * - 支持高级排序，按 region 分组编号
 * - 支持限制返回数量
 *
 * HTTP META 参数
 * - http_meta_protocol    协议            默认: http
 * - http_meta_host        服务地址        默认: 127.0.0.1
 * - http_meta_port         端口            默认: 9876
 * - http_meta_authorization Authorization 默认: 空
 * - http_meta_start_delay 初始延时(ms)    默认: 3000
 * - http_meta_proxy_timeout 每节点预估耗时(ms) 默认: 10000
 *
 * 探测参数
 * - api         测落地的 API  默认: http://ip-api.com/json?lang=zh-CN
 * - method      请求方法      默认: get
 * - concurrency 并发数        默认: 10
 * - timeout / t 单节点超时(ms) 默认: 1000，latency > timeout 则丢弃
 * - retries     重试次数      默认: 1
 * - retry_delay 重试延时(ms)  默认: 1000
 *
 * Rename 参数
 * - format / f   格式化模板    默认: {region_code} {isp_code}
 * - connector / c 占位符连接符 默认: ' '
 *
 * Sort 参数
 * - sort / s   排序规则
 *   新语法: {region} ASC, {tag(IPLC)} DESC, {index} ASC
 *   兼容旧语法: region_code ASC, tag(IPLC) DESC
 *
 * 过滤参数
 * - remove_failed 移除失败节点 默认: true
 * - limit / l     限制返回数量 默认: 0（不限制）
 *
 * 缓存策略：
 * - 缓存命中时直接采信测试结果（由 Sub-Store 统一管理缓存时效）
 *
 * 使用示例（mode: link）：
 * https://cdn地址#f={region}{i:2d}{tag}&c=-&s={region}ASC&t=800&l=20&remove_failed=true
 */

// ============================================================
// 参数别名（对外提供的入参别名）
// ============================================================
const PARAM_ALIAS = {
    format: 'f',
    connector: 'c',
    sort: 's',
    timeout: 't',
    limit: 'l',
    debug: 'd',
};

// 占位符别名
const PLACEHOLDER_ALIAS = {
    'region': 'region_code',
    'i': 'index',
};

// 规范化占位符（替换别名，replaceAll = true）
function normalizePlaceholder(str) {
    if (!str) return str;
    let result = str;
    for (const [alias, standard] of Object.entries(PLACEHOLDER_ALIAS)) {
        result = result.replace(new RegExp(`\\{${alias}\\}`, 'g'), `{${standard}}`);
        result = result.replace(new RegExp(`\\{${alias}:`, 'g'), `{${standard}:`);
    }
    return result;
}

// ============================================================
// 常量
// ============================================================
const ISP_MAP = {
    'ATT': { keywords: ['att', 'at&t'], code: 'ATT', name: 'AT&T' },
    'Hinet': { keywords: ['hinet'], code: 'HINET', name: 'Hinet' },
    'NTT': { keywords: ['ntt'], code: 'NTT', name: 'NTT' },
    'Softbank': { keywords: ['softbank'], code: 'SOFTBANK', name: 'SoftBank' },
    'KT': { keywords: ['kt'], code: 'KT', name: 'KT' },
    'SK': { keywords: ['sk'], code: 'SK', name: 'SK' },
    'Singtel': { keywords: ['singtel'], code: 'SINGTEL', name: 'Singtel' },
    'Starhub': { keywords: ['starhub'], code: 'STARHUB', name: 'Starhub' },
    'TMNet': { keywords: ['tmnet'], code: 'TMNET', name: 'TMNet' },
    'CMCC': { keywords: ['cmcc', '中国移动'], code: 'CMCC', name: 'China Mobile' },
    'CU': { keywords: ['cu', '中国联通'], code: 'CU', name: 'China Unicom' },
    'CT': { keywords: ['ct', '中国电信'], code: 'CT', name: 'China Telecom' },
};

const REGION_MAP = {
    'HK': { alias: ['香港', 'hong kong', 'hk'], flag: '🇭🇰', code: 'HK', name_cn: '香港', name_en: 'Hong Kong' },
    'TW': { alias: ['台湾', 'taiwan', 'tw'], flag: '🇹🇼', code: 'TW', name_cn: '台湾', name_en: 'Taiwan' },
    'MO': { alias: ['澳门', 'macau', 'mo'], flag: '🇲🇴', code: 'MO', name_cn: '澳门', name_en: 'Macao' },
    'JP': { alias: ['日本', 'japan', 'jp'], flag: '🇯🇵', code: 'JP', name_cn: '日本', name_en: 'Japan' },
    'US': { alias: ['美国', 'united states', 'us'], flag: '🇺🇸', code: 'US', name_cn: '美国', name_en: 'United States' },
    'SG': { alias: ['新加坡', 'singapore', 'sg'], flag: '🇸🇬', code: 'SG', name_cn: '新加坡', name_en: 'Singapore' },
    'KR': { alias: ['韩国', 'korea', 'kr'], flag: '🇰🇷', code: 'KR', name_cn: '韩国', name_en: 'Korea' },
    'UK': { alias: ['英国', 'united kingdom', 'uk'], flag: '🇬🇧', code: 'UK', name_cn: '英国', name_en: 'United Kingdom' },
    'DE': { alias: ['德国', 'germany', 'de'], flag: '🇩🇪', code: 'DE', name_cn: '德国', name_en: 'Germany' },
    'FR': { alias: ['法国', 'france', 'fr'], flag: '🇫🇷', code: 'FR', name_cn: '法国', name_en: 'France' },
    'CA': { alias: ['加拿大', 'canada', 'ca'], flag: '🇨🇦', code: 'CA', name_cn: '加拿大', name_en: 'Canada' },
    'AU': { alias: ['澳大利亚', 'australia', 'au'], flag: '🇦🇺', code: 'AU', name_cn: '澳大利亚', name_en: 'Australia' },
    'NL': { alias: ['荷兰', 'netherlands', 'nl'], flag: '🇳🇱', code: 'NL', name_cn: '荷兰', name_en: 'Netherlands' },
    'IN': { alias: ['印度', 'india', 'in'], flag: '🇮🇳', code: 'IN', name_cn: '印度', name_en: 'India' },
    'RU': { alias: ['俄罗斯', 'russia', 'ru'], flag: '🇷🇺', code: 'RU', name_cn: '俄罗斯', name_en: 'Russia' },
    'BR': { alias: ['巴西', 'brazil', 'br'], flag: '🇧🇷', code: 'BR', name_cn: '巴西', name_en: 'Brazil' },
    'IT': { alias: ['意大利', 'italy', 'it'], flag: '🇮🇹', code: 'IT', name_cn: '意大利', name_en: 'Italy' },
    'ES': { alias: ['西班牙', 'spain', 'es'], flag: '🇪🇸', code: 'ES', name_cn: '西班牙', name_en: 'Spain' },
    'SE': { alias: ['瑞典', 'sweden', 'se'], flag: '🇸🇪', code: 'SE', name_cn: '瑞典', name_en: 'Sweden' },
    'CH': { alias: ['瑞士', 'switzerland', 'ch'], flag: '🇨🇭', code: 'CH', name_cn: '瑞士', name_en: 'Switzerland' },
    'NO': { alias: ['挪威', 'norway', 'no'], flag: '🇳🇴', code: 'NO', name_cn: '挪威', name_en: 'Norway' },
    'FI': { alias: ['芬兰', 'finland', 'fi'], flag: '🇫🇮', code: 'FI', name_cn: '芬兰', name_en: 'Finland' },
    'DK': { alias: ['丹麦', 'denmark', 'dk'], flag: '🇩🇰', code: 'DK', name_cn: '丹麦', name_en: 'Denmark' },
    'PL': { alias: ['波兰', 'poland', 'pl'], flag: '🇵🇱', code: 'PL', name_cn: '波兰', name_en: 'Poland' },
    'AT': { alias: ['奥地利', 'austria', 'at'], flag: '🇦🇹', code: 'AT', name_cn: '奥地利', name_en: 'Austria' },
    'TH': { alias: ['泰国', 'thailand', 'th'], flag: '🇹🇭', code: 'TH', name_cn: '泰国', name_en: 'Thailand' },
    'MY': { alias: ['马来西亚', 'malaysia', 'my'], flag: '🇲🇾', code: 'MY', name_cn: '马来西亚', name_en: 'Malaysia' },
    'ID': { alias: ['印度尼西亚', 'indonesia', 'id'], flag: '🇮🇩', code: 'ID', name_cn: '印度尼西亚', name_en: 'Indonesia' },
    'VN': { alias: ['越南', 'vietnam', 'vn'], flag: '🇻🇳', code: 'VN', name_cn: '越南', name_en: 'Vietnam' },
    'TR': { alias: ['土耳其', 'turkey', 'tr'], flag: '🇹🇷', code: 'TR', name_cn: '土耳其', name_en: 'Turkey' },
    'MX': { alias: ['墨西哥', 'mexico', 'mx'], flag: '🇲🇽', code: 'MX', name_cn: '墨西哥', name_en: 'Mexico' },
    'AR': { alias: ['阿根廷', 'argentina', 'ar'], flag: '🇦🇷', code: 'AR', name_cn: '阿根廷', name_en: 'Argentina' },
    'CL': { alias: ['智利', 'chile', 'cl'], flag: '🇨🇱', code: 'CL', name_cn: '智利', name_en: 'Chile' },
};

// ============================================================
// 主入口
// ============================================================
async function operator(proxies = [], targetPlatform, context) {
    const $ = $substore;
    const MAX_TIMEOUT = http_meta_proxy_timeout;

    // HTTP META 配置
    const http_meta_host = $arguments.http_meta_host ?? '127.0.0.1';
    const http_meta_port = $arguments.http_meta_port ?? 9876;
    const http_meta_protocol = $arguments.http_meta_protocol ?? 'http';
    const http_meta_authorization = $arguments.http_meta_authorization ?? '';
    const http_meta_api = `${http_meta_protocol}://${http_meta_host}:${http_meta_port}`;
    const http_meta_start_delay = parseFloat($arguments.http_meta_start_delay ?? 3000);
    const http_meta_proxy_timeout = parseFloat($arguments.http_meta_proxy_timeout ?? 10000);

    // 探测配置
    const api_url = $arguments.api || 'http://ip-api.com/json?lang=zh-CN';
    const method = $arguments.method || 'get';
    const concurrency = parseInt($arguments.concurrency || 10);
    const node_timeout = parseFloat($arguments[PARAM_ALIAS.timeout] ?? $arguments.timeout ?? 1000);
    const retries = parseFloat($arguments.retries ?? 1);
    const retry_delay = parseFloat($arguments.retry_delay ?? 1000);

    // 缓存控制
    const noCache = !scriptResourceCache;

    // 调试日志
    const debug = $arguments.debug ?? $arguments[PARAM_ALIAS.debug] ?? false;
    const log = debug ? $.info.bind($) : () => {};

    // Rename 配置（入参别名统一在此处理）
    const rawFormat = $arguments.format ?? $arguments[PARAM_ALIAS.format] ?? '{region_code} {isp_code}';
    const format = normalizePlaceholder(rawFormat);
    const connector = $arguments.connector ?? $arguments[PARAM_ALIAS.connector] ?? ' ';
    const rawSort = $arguments.sort ?? $arguments[PARAM_ALIAS.sort] ?? null;
    const sort = rawSort ? normalizePlaceholder(rawSort) : null;
    const remove_failed = $arguments.remove_failed !== false;
    const limit = parseInt($arguments.limit ?? $arguments[PARAM_ALIAS.limit] ?? 0);

    // ---- Step 1: 转换节点为 internal 格式 ----
    const internalProxies = [];
    proxies.map((proxy, index) => {
        try {
            const node = ProxyUtils.produce([{ ...proxy }], 'ClashMeta', 'internal')?.[0];
            if (node) {
                // 保留原始 proxy 的 _ 开头字段
                for (const key in proxy) {
                    if (/^_/i.test(key)) {
                        node[key] = proxy[key];
                    }
                }
                internalProxies.push({ ...node, _proxies_index: index });
            } else {
                proxy._incompatible = true;
            }
        } catch (e) {
            $.error(e);
        }
    });

    $.info(`核心支持节点数: ${internalProxies.length}/${proxies.length}`);
    if (!internalProxies.length) return proxies;

    // ---- Step 2: 统一探测 ----
    let probeSuccess = 0;
    let probeFail = 0;

    const { ports, pid } = await probeAll(internalProxies, proxies, (proxy, result) => {
        if (result) {
            probeSuccess++;
        } else {
            probeFail++;
        }
    });

    $.info(`探测完成: 成功 ${probeSuccess}, 失败 ${probeFail}`);

    // 将 _geo 从 internalProxies 同步回 proxies（cache hit 在 internalProxies 上设置了 _geo）
    internalProxies.forEach(proxy => {
        const p = proxies[proxy._proxies_index];
        if (proxy._geo) p._geo = proxy._geo;
        if (proxy._failed) { p._failed = true; p._failReason = proxy._failReason; }
    });

    // ---- Step 3: Rename ----
    proxies.map(proxy => renameProxy(proxy, format, connector, 0));

    // ---- Step 4: Sort ----
    if (sort) {
        const sortRules = parseSortRules(sort);
        if (sortRules.length > 0) {
            proxies = applySort(proxies, sortRules);
        }
    }

    // ---- Step 4.5: 按 region 分组编号，然后重新格式化 ----
    if (format) {
        proxies = reassignGroupIndex(proxies);
        proxies.forEach(proxy => {
            proxy.name = applyFormat(proxy, format, connector);
        });
    }

    // ---- Step 5: 移除失败节点 ----
    if (remove_failed) {
        const before = proxies.length;
        proxies = proxies.filter(p => !p._failed);
        $.info(`移除失败节点: ${before} -> ${proxies.length}`);
    }

    // ---- Step 6: 限制返回数量 ----
    if (limit > 0 && proxies.length > limit) {
        $.info(`限制返回数量: ${proxies.length} -> ${limit}`);
        proxies = proxies.slice(0, limit);
    }

    return proxies;

    // ============================================================
    // 统一探测：缓存 + META
    // ============================================================
    async function probeAll(internalProxies, proxies, onResult) {
        const needsMeta = [];
        const cacheHit = [];

        internalProxies.forEach(proxy => {
            // noCache: 跳过读取缓存，直接探测
            if (noCache) {
                needsMeta.push(proxy);
                return;
            }

            const cached = scriptResourceCache.get(getProbeCacheKey(proxy));
            if (cached !== undefined && cached !== null) {
                // 缓存命中：直接采信缓存的测试结果
                applyProbeResult(proxy, proxies, cached);
                cacheHit.push({ proxy, cached });
                onResult(proxy, cached);
                $.info(`[${proxy.name}] CACHE_HIT latency=${cached.latency}ms`);
                log(`[DEBUG] cache HIT key=${getProbeCacheKey(proxy)} latency=${cached.latency}`);
            } else {
                needsMeta.push(proxy);
                log(`[DEBUG] cache MISS key=${getProbeCacheKey(proxy)}`);
            }
        });

        log(`[DEBUG] cache hit=${cacheHit.length}/${internalProxies.length} needMeta=${needsMeta.length}`);

        if (needsMeta.length === 0) {
            return { ports: null, pid: null };
        }

        const timeout = http_meta_start_delay + needsMeta.length * http_meta_proxy_timeout;

        const startRes = await httpRequest({
            method: 'post',
            url: `${http_meta_api}/start`,
            headers: {
                'Content-type': 'application/json',
                Authorization: http_meta_authorization,
            },
            body: JSON.stringify({ proxies: needsMeta, timeout }),
            timeout: 10000,
        });

        let body = startRes.body;
        try { body = JSON.parse(body); } catch (_) {}
        const { ports, pid } = body || {};
        if (!pid || !ports) throw new Error(`HTTP META 启动失败: ${body}`);

        $.info(`HTTP META 启动 [端口: ${ports}] [PID: ${pid}] [超时: ${timeout}ms]`);
        await $.wait(http_meta_start_delay);

        await executeAsyncTasks(
            needsMeta.map((proxy, i) => () => probeOne(proxy, proxies, ports[i], onResult)),
            { concurrency }
        );

        try {
            await httpRequest({
                method: 'post',
                url: `${http_meta_api}/stop`,
                headers: { 'Content-type': 'application/json', Authorization: http_meta_authorization },
                body: JSON.stringify({ pid: [pid] }),
                timeout: 5000,
            });
        } catch (e) {
            $.error(`关闭 HTTP META 失败: ${e.message}`);
        }

        return { ports, pid };
    }

    // ============================================================
    // 单节点探测
    // ============================================================
    async function probeOne(proxy, proxies, port, onResult) {
        const startedAt = Date.now();

        try {
            const res = await httpRequest({
                proxy: `http://${http_meta_host}:${port}`,
                method,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1',
                },
                url: api_url,
                timeout: Math.max(node_timeout, MAX_TIMEOUT),
            });

            const latency = Date.now() - startedAt;
            const status = parseInt(res.status || res.statusCode || 200);

            // node_timeout：latency > 此值视为慢节点，但正常写入缓存
            // MAX_TIMEOUT：超过此值视为不通，catch 写入 null

            if (status === 200) {
                let geoData;
                try {
                    geoData = JSON.parse(String(res.body));
                } catch (_) {
                    geoData = { country: String(res.body).trim(), isp: '', countryCode: 'ZZ' };
                }
                const cached = { ...geoData, latency };
                applyProbeResult(proxy, proxies, cached);
                scriptResourceCache.set(getProbeCacheKey(proxy), cached);
                $.info(`[${proxy.name}] OK country=${geoData.countryCode} latency=${latency}ms`);
            } else {
                const cached = null;
                applyProbeResult(proxy, proxies, cached);
                scriptResourceCache.set(getProbeCacheKey(proxy), cached);
                $.info(`[${proxy.name}] FAIL status=${status}`);
            }
        } catch (e) {
            const latency = Date.now() - startedAt;
            const cached = null;
            applyProbeResult(proxy, proxies, cached);
            scriptResourceCache.set(getProbeCacheKey(proxy), cached);
            $.error(`[${proxy.name}] TIMEOUT/${latency}ms: ${e.message || e.reason || String(e) || 'unknown'}`);
        }

        onResult(proxy, scriptResourceCache.get(getProbeCacheKey(proxy)));
    }

    function applyProbeResult(proxy, proxies, result) {
        const p = proxies[proxy._proxies_index];
        if (result === null) {
            p._failed = true;
            p._failReason = 'timeout';
        } else {
            p._geo = result;
        }
    }
}

// ============================================================
// 缓存 key
// ============================================================
function getProbeCacheKey(proxy) {
    const { name, _proxies_index, uuid, password, ...rest } = proxy
    const hash = require('crypto').createHash('md5').update(JSON.stringify(rest)).digest('hex')
    return `formater:probe:${hash}`
}

// ============================================================
// Rename 函数
// ============================================================
function renameProxy(proxy, formatStr, connectorStr, groupIndex = 0) {
    const originalName = proxy.name || '';
    const lowerName = originalName.toLowerCase();

    proxy.originalName = originalName;

    // 从 _geo.countryCode（探测结果）检测 region，优先于名称匹配
    const geoCountryCode = proxy._geo?.countryCode || '';
    let regionInfo = geoCountryCode ? REGION_MAP[geoCountryCode] || null : null;

    if (!regionInfo) {
        // 从节点名检测 region
        for (const [key, info] of Object.entries(REGION_MAP)) {
            const keywords = getRegionKeywords(info);
            for (const kw of keywords) {
                if (matchKeyword(lowerName, kw)) {
                    regionInfo = info;
                    break;
                }
            }
            if (regionInfo) break;
        }
    }

    if (regionInfo) {
        proxy.region_code = regionInfo.code;
        proxy.region_flag = regionInfo.flag;
        proxy.region_name = regionInfo.name_en;
        proxy.region_name_cn = regionInfo.name_cn;
    } else {
        proxy.region_code = 'ZZ';
        proxy.region_flag = '';
        proxy.region_name = 'Unknown';
        proxy.region_name_cn = '未知';
    }

    // 检测 ISP
    proxy.isp_code = detectISPFromName(lowerName);
    proxy.isp_name = (ISP_MAP[Object.keys(ISP_MAP).find(k => ISP_MAP[k].code === proxy.isp_code)] || {}).name || '';

    // 检测 tag
    proxy.tag = detectTag(lowerName);

    // groupIndex 来自外部重排，原始 index 备用
    proxy.index = groupIndex;
    proxy._rawIndex = (() => {
        const m = [...originalName.matchAll(/\d+/g)];
        return m.length > 0 ? parseInt(m[m.length - 1][0]) : 0;
    })();

    // 检测 otherTags
    proxy.otherTags = detectAllTags(lowerName);

    // 格式化
    if (formatStr) {
        proxy.name = applyFormat(proxy, formatStr, connectorStr);
    }
}

// 解析 {xxx} 占位符并应用格式化
function applyFormat(proxy, formatStr, connectorStr) {
    const conn = connectorStr || ' ';
    const parts = [];

    const regex = /\{([^}]+)\}/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(formatStr)) !== null) {
        if (match.index > lastIndex) {
            parts.push({ type: 'text', value: formatStr.substring(lastIndex, match.index) });
        }
        parts.push({ type: 'placeholder', value: match[1] });
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < formatStr.length) {
        parts.push({ type: 'text', value: formatStr.substring(lastIndex) });
    }

    const resultParts = [];
    for (const part of parts) {
        if (part.type === 'text') {
            resultParts.push(part.value);
        } else {
            resultParts.push(resolvePlaceholder(proxy, part.value, conn));
        }
    }

    const staticContent = formatStr.replace(/\{[^}]+\}/g, '').replace(/\s+/g, '');
    const hasNonSpaceStatic = staticContent !== '';

    if (hasNonSpaceStatic) {
        return resultParts.filter(Boolean).join('');
    }

    const noPlaceholders = formatStr.replace(/\{[^}]+\}/g, '');
    if (/\s/.test(noPlaceholders)) {
        const filtered = resultParts.filter(v => v && v.trim() !== '');
        return filtered.join(conn);
    } else {
        const filtered = resultParts.filter(v => v && v.trim() !== '');
        return filtered.join(conn);
    }
}

// 解析单个占位符
function resolvePlaceholder(proxy, placeholder, conn) {
    const geo = proxy._geo || {};
    const lowerName = (proxy.originalName || '').toLowerCase();

    if (placeholder === 'countryCode') return geo.countryCode || '';
    if (placeholder === 'country') return geo.country || '';
    if (placeholder === 'isp') return geo.isp || '';
    if (placeholder === 'latency') return String(geo.latency !== undefined && geo.latency !== null ? geo.latency : 0);

    // {tag:XXX}
    if (placeholder.startsWith('tag:')) {
        const tagName = placeholder.split(':')[1].toUpperCase();
        return new RegExp(tagName, 'i').test(lowerName) ? tagName : '';
    }

    // {index:2d} / {i:2d}
    if ((placeholder.startsWith('index:') || placeholder.startsWith('i:')) && placeholder.endsWith('d')) {
        const width = parseInt(placeholder.substring(placeholder.indexOf(':') + 1, placeholder.length - 1));
        if (!isNaN(width)) return String(proxy.index || 0).padStart(width, '0');
    }

    // {iplc} / {udpn} / {home}
    if (placeholder === 'iplc') return /iplc|专线/i.test(lowerName) ? 'IPLC' : '';
    if (placeholder === 'udpn') return /udpn/i.test(lowerName) ? 'UDPN' : '';
    if (placeholder === 'home') return /家宽|home/i.test(lowerName) ? 'Home' : '';

    const fieldMap = {
        'region_code': proxy.region_code,
        'region': proxy.region_code,
        'region_name': proxy.region_name,
        'region_name_cn': proxy.region_name_cn,
        'region_flag': proxy.region_flag,
        'isp_code': proxy.isp_code,
        'isp_name': proxy.isp_name,
        'tag': proxy.tag,
        'otherTags': Array.isArray(proxy.otherTags) ? proxy.otherTags.join(conn) : '',
        'index': String(proxy.index || 0),
        'i': String(proxy.index || 0),
        'original': proxy.originalName,
        'name': proxy.name,
    };

    return fieldMap[placeholder] !== undefined ? fieldMap[placeholder] : '';
}

// ============================================================
// Sort 函数
// ============================================================
function parseSortRules(sortString) {
    if (!sortString) return [];

    const rules = [];
    const parts = [];
    let current = '';
    let depth = 0;
    for (let i = 0; i < sortString.length; i++) {
        const char = sortString[i];
        if (char === '(') depth++;
        if (char === ')') depth--;
        if (char === ',' && depth === 0) {
            parts.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    if (current.trim()) parts.push(current.trim());

    for (const part of parts) {
        if (!part) continue;

        const newMatch = part.match(/^\{([^}]+)\}(?:\(([^)]+)\))?\s*(ASC|DESC)?$/i);
        const oldMatch = !newMatch ? part.match(/^([\w_]+)(?:\(([^)]+)\))?(?:\s+(ASC|DESC))?$/i) : null;

        let field, values, order;

        if (newMatch) {
            const inside = newMatch[1];
            const parenIdx = inside.indexOf('(');
            if (parenIdx !== -1) {
                field = inside.substring(0, parenIdx).trim();
                values = inside.substring(parenIdx + 1, inside.length - 1).split(',').map(v => v.trim().toUpperCase());
            } else if (newMatch[2]) {
                field = inside.trim();
                values = newMatch[2].split(',').map(v => v.trim().toUpperCase());
            } else {
                field = inside.trim();
                values = [];
            }
            order = (newMatch[3] || 'ASC').toLowerCase();
        } else if (oldMatch) {
            field = oldMatch[1].toLowerCase();
            values = oldMatch[2] ? oldMatch[2].split(',').map(v => v.trim().toUpperCase()) : [];
            order = (oldMatch[3] || 'ASC').toLowerCase();
        } else {
            continue;
        }

        const fieldMap = {
            'region_code': 'countryCode', 'region': 'countryCode',
            'region_name': 'countryName',
            'region_flag': 'countryFlag', 'tag': 'tag',
            'isp_code': 'ispCode', 'isp_name': 'ispName',
            'index': 'index', 'i': 'index',
            'name': 'name', 'latency': 'latency',
        };

        rules.push({
            type: fieldMap[field] || field,
            values,
            hasValues: values.length > 0,
            order,
        });
    }

    return rules;
}

function applySort(proxies, rules) {
    if (!rules || rules.length === 0) return proxies;

    return [...proxies].sort((a, b) => {
        for (const rule of rules) {
            const { type, values, hasValues, order } = rule;
            let comparison = 0;

            if (type === 'countryCode') {
                const va = a._geo?.countryCode || a.region_code || 'ZZ';
                const vb = b._geo?.countryCode || b.region_code || 'ZZ';
                if (hasValues && values.length) {
                    const ia = values.indexOf(va);
                    const ib = values.indexOf(vb);
                    if (ia !== -1 && ib === -1) comparison = -1;
                    else if (ia === -1 && ib !== -1) comparison = 1;
                    else if (ia !== -1 && ib !== -1) comparison = ia - ib;
                    else comparison = va.localeCompare(vb);
                } else {
                    comparison = va.localeCompare(vb);
                }
            } else if (type === 'latency') {
                const va = a._geo?.latency ?? 999999;
                const vb = b._geo?.latency ?? 999999;
                comparison = va - vb;
            } else if (type === 'ispCode') {
                const va = (a._geo?.isp || a.isp_code || '').toUpperCase();
                const vb = (b._geo?.isp || b.isp_code || '').toUpperCase();
                comparison = va.localeCompare(vb);
            } else if (type === 'ispName') {
                const va = (a._geo?.isp || a.isp_code || '').toUpperCase();
                const vb = (b._geo?.isp || b.isp_code || '').toUpperCase();
                comparison = va.localeCompare(vb);
            } else if (type === 'countryName') {
                const va = a._geo?.country || a.region_name || '';
                const vb = b._geo?.country || b.region_name || '';
                comparison = va.localeCompare(vb);
            } else if (type === 'name') {
                comparison = (a.name || '').localeCompare(b.name || '', 'zh-CN');
            } else if (type === 'index') {
                const va = a.index ?? parseInt((a.originalName || '').match(/\d+/)?.[0] || '0');
                const vb = b.index ?? parseInt((b.originalName || '').match(/\d+/)?.[0] || '0');
                comparison = va - vb;
            } else if (type === 'tag') {
                const ta = a.tag || '';
                const tb = b.tag || '';
                if (hasValues && values.length) {
                    const ua = ta.toUpperCase();
                    const ub = tb.toUpperCase();
                    const ha = ua && values.includes(ua);
                    const hb = ub && values.includes(ub);
                    if (ha !== hb) {
                        comparison = ha ? (order === 'desc' ? 1 : -1) : (order === 'desc' ? -1 : 1);
                    } else if (!ta && !tb) {
                        comparison = 0;
                    } else if (!ta) {
                        comparison = order === 'desc' ? 1 : -1;
                    } else if (!tb) {
                        comparison = order === 'desc' ? -1 : 1;
                    } else {
                        comparison = ta.localeCompare(tb);
                    }
                } else {
                    if (ta && !tb) comparison = order === 'desc' ? 1 : -1;
                    else if (!ta && tb) comparison = order === 'desc' ? -1 : 1;
                    else comparison = ta.localeCompare(tb);
                }
            } else if (type === 'countryFlag') {
                const va = a.region_flag || '';
                const vb = b.region_flag || '';
                comparison = va.localeCompare(vb);
            }

            if (comparison !== 0) {
                return order === 'desc' ? -comparison : comparison;
            }
        }
        return 0;
    });
}

// ============================================================
// 按 region 分组编号（同一个 region 内的节点依次编号 1, 2, 3...）
// 编号后再重新格式化，确保 index 跟在 region 后连续递增
// ============================================================
function reassignGroupIndex(proxies) {
    const groups = {};
    proxies.forEach(p => {
        const key = p.region_code || 'ZZ';
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
    });

    Object.values(groups).forEach(group => {
        group.forEach((p, i) => {
            p.index = i + 1;
        });
    });

    return proxies;
}

// ============================================================
// 工具函数
// ============================================================
function getRegionKeywords(info) {
    const kws = [];
    if (info.flag) kws.push(info.flag);
    if (info.code) kws.push(info.code);
    if (info.name_cn) kws.push(info.name_cn);
    if (info.name_en) kws.push(info.name_en);
    if (info.alias) kws.push(...info.alias);
    return kws;
}

function matchKeyword(text, keyword) {
    // Emoji flag: check against original text BEFORE toLowerCase
    if (keyword.match(/[\uD83C-\uDBFF]/)) return text.includes(keyword);
    const lower = text.toLowerCase();
    const kwLower = keyword.toLowerCase();
    if (keyword.match(/[一-龥]/)) return lower.includes(kwLower);
    if (keyword.length <= 3) return new RegExp(`\\b${kwLower}\\b`, 'i').test(lower);
    return lower.includes(kwLower);
}

function detectISPFromName(name) {
    for (const [, info] of Object.entries(ISP_MAP)) {
        if (!info?.keywords) continue;
        for (const kw of info.keywords) {
            if (matchKeyword(name, kw)) return info.code;
        }
    }
    return '';
}

function detectTag(name) {
    if (/iplc|专线/i.test(name)) return 'IPLC';
    if (/udpn/i.test(name)) return 'UDPN';
    if (/家宽|home/i.test(name)) return 'HOME';
    return '';
}

function detectAllTags(name) {
    const tags = [];
    if (/iplc|专线/i.test(name)) tags.push('IPLC');
    if (/udpn/i.test(name)) tags.push('UDPN');
    if (/家宽|home/i.test(name)) tags.push('HOME');
    return tags;
}

async function httpRequest(opt = {}) {
    const reqMethod = opt.method || 'get';
    const reqTimeout = parseFloat(opt.timeout || 5000);
    const reqRetries = parseFloat(opt.retries ?? $arguments.retries ?? 1);
    const reqRetryDelay = parseFloat(opt.retry_delay ?? $arguments.retry_delay ?? 1000);

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
