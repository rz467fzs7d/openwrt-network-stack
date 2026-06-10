/**
 * parser.js
 *
 * Sub-Store 节点格式化脚本 - 探测、抛弃、重命名、排序 一次完成
 *
 * 功能特性：
 * - HTTP META 探测节点落地 region（国家）
 * - 支持 format 模板（兼容既有占位符写法）
 * - 支持高级排序，按 region 分组编号
 *
 * HTTP META 参数
 * - http_meta_protocol    协议            默认: http
 * - http_meta_host        服务地址        默认: 127.0.0.1
 * - http_meta_port         端口            默认: 9876
 * - http_meta_authorization Authorization 默认: 空
 * - http_meta_start_delay 初始延时(ms)    默认: 3000
 * - http_meta_proxy_timeout 每节点预估耗时(ms) 默认: 3000
 *
 * 探测参数
 * - api         测落地的 API  默认: http://ip-api.com/json?lang=zh-CN（返回 JSON，直接取 countryCode/isp）
 * - method      请求方法      默认: get
 * - concurrency 并发数        默认: 10
 * - retries 请求重试次数 默认: 1
 * - retry_delay 请求重试间隔(ms) 默认: 1000
 *   （单节点探测超时由 http_meta_proxy_timeout 控制，见上）
 * - probe_all 对所有节点强制探测（默认 false：节点名可识别 region 时跳过探测）
 * - include_unsupported_proxy 传递给运行环境时包含官方/商店版不支持的协议 默认: false
 * - cache 使用 Sub-Store 脚本缓存 默认: true
 * - fallback_cache 探测失败时使用节点身份兜底缓存 默认: true
 * - force_geo_region 强制使用 API 探测的 countryCode 作为 region 默认: false
 *
 * Rename 参数
 * - format / f   格式化模板    默认: {region_code}
 * - connector / c 占位符连接符 默认: -
 *
 * Sort 参数（不支持 latency 排序）
 * - sort / s   排序规则
 *   推荐语法: region:HK,SG,JP:asc|tag:Plus:desc|has_tag:desc|index:asc
 *   兼容旧语法: {region} ASC, {tag(IPLC)} DESC, {index} ASC
 *
 * 拍平参数
 * - flat          静态 server->IP 映射，格式: {host1:ip1,ip2}{host2:ip3}
 *                 语法与 format 占位符统一，花括号包裹每条映射
 *                 在 rename 完成后展开：每个 IP 克隆一个节点
 *                 server 替换为对应 IP，名称追加 {connector}{ip}
 *                 例: HK-01-1.2.3.4（connector='-'）
 *                 不在映射中的节点原样保留
 *
 * 过滤参数
 * - 探测失败的节点会被标记 _failed=true（不在此移除，交由下游环节处理）
 *
 * 使用示例（mode: link）：
 * https://cdn地址#f={region}{i:2d}{tag}&c=-&s={region}ASC
 */

// ============================================================
// 参数别名（对外提供的入参别名）
// ============================================================
// 注意：不使用单字母短名称（如 l），避免与 Sub-Store 内部参数（c/f/s）冲突
const PARAM_ALIAS = {
    format: 'f',
    connector: 'c',
    sort: 's',
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
const REGION_CODE_IGNORE = new Set([
    'SS', 'VM', 'WS', 'IP', 'TCP', 'UDP', 'TLS', 'DNS', 'HTTP', 'HOME', 'PLUS',
]);

// ISO 3166-1 已弃用/历史/别名代码：ICU 仍会把它们解析成现代国名，
// 且按字母序常排在正式代码前面（如 DD 东德、VD 北越），导致名称索引误命中。
// 仅用于名称索引生成时跳过，让正式代码（DE/VN/...）命中。
const REGION_CODE_DEPRECATED = new Set([
    'AN', 'BU', 'CS', 'DD', 'DY', 'FX', 'HV', 'NH',
    'RH', 'SU', 'TP', 'VD', 'YD', 'YU', 'ZR',
]);

const TAG_PRESETS = [
    { name: 'IPLC', keywords: ['iplc', '专线'] },
    { name: 'UDPN', keywords: ['udpn'] },
    { name: 'HOME', keywords: ['家宽', 'home'] },
];

const REGION_NAME_LOCALES = ['en', 'zh-CN', 'zh-TW'];
let REGION_NAME_HINTS = null;
// 按 locale 缓存 Intl.DisplayNames，避免每次查询都 new（hints 构建 + 每节点元数据是热点）
const REGION_NAME_FORMATTERS = {};

// ============================================================
// 主入口
// ============================================================
async function operator(proxies = [], targetPlatform, context) {
    const $ = $substore;

    // 命名约定：与 $arguments 入参同名的局部变量保留 snake_case（便于和入参对照），
    // 由入参派生的内部状态用 camelCase。

    // 来源信息（用于日志标识）
    const source = context?.source || {};
    const sourceName = source._collection?.displayName || source._collection?.name || source.name || $arguments._sourceName || 'unknown';

    // HTTP META 配置
    const http_meta_host = $arguments.http_meta_host ?? '127.0.0.1';
    const http_meta_port = parsePositiveInt($arguments.http_meta_port, 9876);
    const http_meta_protocol = $arguments.http_meta_protocol ?? 'http';
    const http_meta_authorization = $arguments.http_meta_authorization ?? '';
    const http_meta_api = `${http_meta_protocol}://${http_meta_host}:${http_meta_port}`;
    const http_meta_start_delay = parsePositiveNumber($arguments.http_meta_start_delay, 3000);
    const http_meta_proxy_timeout = parsePositiveNumber($arguments.http_meta_proxy_timeout, 3000);

    // 探测配置：通过节点出口请求 ip-api.com，直接取 countryCode/isp
    const api_url = $arguments.api || 'http://ip-api.com/json?lang=zh-CN&fields=status,country,countryCode,isp,query';
    // API Token（优先脚本参数，其次环境变量）
    const api_token = $arguments.ipinfo_api_token
        ?? (typeof process !== 'undefined' ? process.env.IPINFO_API_TOKEN : null)
        ?? '';
    const method = $arguments.method || 'get';
    const concurrency = parsePositiveInt($arguments.concurrency, 10);
    const cacheEnabled = toBoolean($arguments.cache, true) && !toBoolean($arguments.noCache, false);
    const cache = typeof scriptResourceCache !== 'undefined' ? scriptResourceCache : null;
    const fallbackCacheEnabled = cacheEnabled && toBoolean($arguments.fallback_cache, true);
    const includeUnsupportedProxy = toBoolean($arguments.include_unsupported_proxy, false);

    // 调试日志
    const debug = $arguments.debug ?? $arguments[PARAM_ALIAS.debug] ?? true;
    const log = debug ? $.info.bind($) : () => {};

    // Rename 配置（入参别名统一在此处理）
    const rawFormat = $arguments.format ?? $arguments[PARAM_ALIAS.format] ?? '{region_code}';
    const format = normalizePlaceholder(rawFormat);
    const compiledFormat = format ? compileFormat(format) : null;
    const connector = $arguments.connector ?? $arguments[PARAM_ALIAS.connector] ?? '-';
    const rawSort = $arguments.sort ?? $arguments[PARAM_ALIAS.sort] ?? null;
    const sort = rawSort ? normalizePlaceholder(rawSort) : null;
    const forceGeoRegion = toBoolean($arguments.force_geo_region ?? $arguments.force_region_from_geo, false);
    const flatMap = parseFlatMap($arguments.flat ?? '');

    // ---- Step 1: 转换节点为 internal 格式 ----
    const internalProxies = [];
    proxies.forEach((proxy, index) => {
        try {
            const node = ProxyUtils.produce([{ ...proxy }], 'ClashMeta', 'internal', {
                'include-unsupported-proxy': includeUnsupportedProxy,
            })?.[0];
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

    $.info(`[PARSER] 核心支持节点数: ${internalProxies.length}/${proxies.length}`);
    log(`[DEBUG] input=${proxies.length} internal=${internalProxies.length} incompatible=${proxies.length - internalProxies.length}`);
    if (!internalProxies.length) return proxies;

    // ---- Step 2: 统一 META 探测，以落地结果作为 region 来源 ----
    let probeSuccess = 0;
    let probeFail = 0;

    // 名称已能识别 region 的节点跳过探测（probe_all=true 可强制全探）
    const probeAllNodes = toBoolean($arguments.probe_all, false);
    let skipByNameCount = 0;
    const needProbe = [];
    for (const proxy of internalProxies) {
        const p = proxies[proxy._proxies_index];
        if (!probeAllNodes && detectRegionFromName(p?.name || proxy.name || '')) {
            skipByNameCount++;
        } else {
            needProbe.push(proxy);
        }
    }
    if (skipByNameCount > 0) {
        $.info(`[PARSER] 名称已识别 region，跳过探测 ${skipByNameCount}/${internalProxies.length}`);
    }

    const cachedProbe = splitCachedProbeResults(needProbe, proxies);
    probeSuccess += cachedProbe.success;

    if (needProbe.length === 0) {
        $.info(`[PARSER] 所有节点名称均可识别 region，无需 HTTP META`);
    } else if (cachedProbe.pending.length === 0) {
        $.info(`[PARSER] 待探测节点都有有效缓存，跳过 HTTP META（成功缓存 ${cachedProbe.directSuccess}，兜底缓存 ${cachedProbe.fallbackSuccess}）`);
    } else {
        $.info(`[PARSER] 缓存命中 ${probeSuccess + probeFail}/${internalProxies.length}（成功缓存 ${cachedProbe.directSuccess}，兜底缓存 ${cachedProbe.fallbackSuccess}），待探测 ${cachedProbe.pending.length}`);
        await probeAll(cachedProbe.pending, proxies, (proxy, result) => {
            if (result) probeSuccess++;
            else probeFail++;
        });
    }

    $.info(`[PARSER] 探测完成: 成功 ${probeSuccess}, 失败 ${probeFail}`);

    // ---- Step 3: 提取元数据 ----
    proxies.forEach(proxy => prepareProxyMetadata(proxy, 0, forceGeoRegion));

    // ---- Step 4: Sort（不支持 latency）----
    let sortRules = [];
    if (sort) {
        sortRules = parseSortRules(sort);
    }

    // 按 name 排序时，需先格式化出最终名（除 index 外）再排序——
    // 因为 applySort 的 name 分支比较的是 proxy.name（展示名）而非原始订阅名。
    // 排序后 reassignGroupIndex 才能定 index，Step 4.5 会再格式化一次覆盖此处结果。
    // 故按 name 排序时每节点格式化 2 次，是语义需求，非冗余。
    if (compiledFormat && sortRules.some(rule => rule.type === 'name')) {
        proxies.forEach(proxy => {
            proxy.name = applyCompiledFormat(proxy, compiledFormat, connector);
        });
    }

    if (sortRules.length > 0) {
        proxies = applySort(proxies, sortRules);
    }

    // ---- Step 4.5: 按 region 分组编号，然后重新格式化 ----
    if (compiledFormat) {
        proxies = reassignGroupIndex(proxies);
        proxies.forEach(proxy => {
            proxy.name = applyCompiledFormat(proxy, compiledFormat, connector);
        });
    }

    // ---- Step 4.8: flat 拍平 ----
    if (Object.keys(flatMap).length > 0) {
        const expanded = [];
        for (const proxy of proxies) {
            const ips = flatMap[proxy.server];
            if (ips && ips.length) {
                expanded.push(proxy);
                for (const ip of ips) {
                    const cloned = JSON.parse(JSON.stringify(proxy));
                    cloned.server = ip;
                    cloned.name = proxy.name + connector + ip;
                    expanded.push(cloned);
                }
            } else {
                expanded.push(proxy);
            }
        }
        proxies = expanded;
        $.info(`[PARSER] flat 拍平: -> ${proxies.length} 节点`);
    }

    // ---- Step 5: 标记失败节点（移除交由下游处理）----
    const failedCount = proxies.filter(p => p._failed).length;
    if (failedCount > 0) {
        $.info(`[PARSER] 标记失败节点: ${failedCount}/${proxies.length}（_failed=true，移除交由下游）`);
    }

    return proxies;

    // ============================================================
    // 统一探测：META
    // ============================================================
    async function probeAll(internalProxies, proxies, onResult) {
        if (internalProxies.length === 0) {
            return { ports: null, pid: null };
        }

        const timeout = http_meta_start_delay + internalProxies.length * http_meta_proxy_timeout;

        const startRes = await httpRequest({
            method: 'post',
            url: `${http_meta_api}/start`,
            headers: {
                'Content-type': 'application/json',
                Authorization: http_meta_authorization,
            },
            body: JSON.stringify({ proxies: internalProxies, timeout }),
            timeout: 10000,
        });

        let body = startRes.body;
        try { body = JSON.parse(body); } catch (_) {}
        const { ports, pid } = body || {};
        if (!pid || !ports) throw new Error(`HTTP META 启动失败: ${body}`);

        $.info(`[PARSER] HTTP META 启动 [端口: ${ports}] [PID: ${pid}] [超时: ${timeout}ms]`);
        await $.wait(http_meta_start_delay);

        await executeAsyncTasks(
            internalProxies.map((proxy, i) => () => probeOne(proxy, proxies, ports[i], onResult)),
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
            $.error(`[PARSER] 关闭 HTTP META 失败: ${e.message}`);
        }

        return { ports, pid };
    }

    // ============================================================
    // 单节点探测
    // ============================================================
    async function probeOne(proxy, proxies, port, onResult) {
        const startedAt = Date.now();
        // 进入此处的节点都已被 splitCachedProbeResults 预扫描确认未命中缓存，
        // 无需再 cache.get 复查；cacheId 仅用于探测成功后写缓存。
        const cacheId = getProbeCacheId(proxy);

        try {
            const headers = {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1',
            };
            if (api_token) {
                headers['Authorization'] = `Bearer ${api_token}`;
            }
            const res = await httpRequest({
                proxy: `http://${http_meta_host}:${port}`,
                method,
                headers,
                url: api_url,
                // 取出口 IP 的超时对齐单节点预估耗时，死节点不再因默认 5s+重试卡满 ~11s
                timeout: http_meta_proxy_timeout,
                retries: 0,
            });

            const latency = Date.now() - startedAt;
            const status = parseInt(res.status || res.statusCode || 200);

            if (status === 200) {
                let geoData;
                try {
                    geoData = JSON.parse(String(res.body));
                } catch (_) {
                    geoData = { country: String(res.body).trim(), isp: '', countryCode: 'ZZ' };
                }
                // 兼容 ipinfo.io 响应格式
                if (geoData.country_code && !geoData.countryCode) {
                    geoData.countryCode = geoData.country_code;
                }
                if (geoData.as_name && !geoData.isp) {
                    geoData.isp = geoData.as_name;
                }
                if (!geoData.countryCode) {
                    $.info(`[PARSER][${proxy.name}] FAIL empty countryCode latency=${latency}ms`);
                    finishProbeFailure(proxy, proxies, onResult);
                    return;
                }
                const cached = { ...geoData, latency };
                applyProbeResult(proxy, proxies, cached);
                setProbeCache(cacheId, cached);
                setFallbackProbeCache(proxy, cached);
                $.info(`[PARSER][${proxy.name}] OK country=${geoData.countryCode} latency=${latency}ms`);
                onResult(proxy, cached);
            } else {
                $.info(`[PARSER][${proxy.name}] FAIL status=${status}`);
                finishProbeFailure(proxy, proxies, onResult);
            }
        } catch (e) {
            const latency = Date.now() - startedAt;
            $.error(`[PARSER][${proxy.name}] TIMEOUT/${latency}ms: ${e.message || e.reason || String(e) || 'unknown'}`);
            finishProbeFailure(proxy, proxies, onResult);
        }
    }

    function applyProbeResult(proxy, proxies, result) {
        const p = proxies[proxy._proxies_index];
        if (result === null) {
            p._failed = true;
            p._failReason = 'probe_failed';
        } else {
            p._geo = result;
        }
    }

    function splitCachedProbeResults(internalProxies, proxies) {
        if (!cacheEnabled || !cache) {
            return { pending: internalProxies, success: 0, directSuccess: 0, fallbackSuccess: 0 };
        }

        const pending = [];
        let success = 0;
        let directSuccess = 0;
        let fallbackSuccess = 0;
        for (const proxy of internalProxies) {
            const cached = cache.get(getProbeCacheId(proxy));
            if (!cached) {
                pending.push(proxy);
                continue;
            }
            if (cached.api) {
                const result = { ...cached.api, _cached: true };
                applyProbeResult(proxy, proxies, result);
                $.info(`[PARSER][${proxy.name}] 预扫描命中成功缓存 country=${result.countryCode || ''}`);
                success++;
                directSuccess++;
            } else {
                const fallback = getFallbackProbeCache(proxy);
                if (fallback) {
                    applyProbeResult(proxy, proxies, fallback);
                    logFallbackProbeCache(proxy, fallback);
                    $.info(`[PARSER][${proxy.name}] 预扫描命中兜底缓存 country=${fallback.countryCode || ''}`);
                    success++;
                    fallbackSuccess++;
                    continue;
                }
                pending.push(proxy);
            }
        }
        return {
            pending,
            success,
            directSuccess,
            fallbackSuccess,
        };
    }

    function getProbeCacheId(proxy) {
        const stableProxy = Object.fromEntries(
            Object.entries(proxy).filter(([key]) => !/^(collectionName|subName|id|_.*)$/i.test(key))
        );
        return `parser:http-meta:geo:${api_url}:${JSON.stringify(stableProxy)}`;
    }

    function setProbeCache(id, api) {
        if (!cacheEnabled || !cache || !api) return;
        cache.set(id, { api });
    }

    function getFallbackCacheId(proxy) {
        const identity = {
            source: sourceName,
            name: proxy.name || '',
            type: proxy.type || '',
        };
        return `parser:http-meta:geo:fallback:${api_url}:${JSON.stringify(identity)}`;
    }

    function getFallbackProbeCache(proxy) {
        if (!fallbackCacheEnabled || !cache) return null;
        const cached = cache.get(getFallbackCacheId(proxy), 0, true);
        if (!cached?.api) return null;
        return {
            ...cached.api,
            _cached: true,
            _fallbackCached: true,
            _fallbackFingerprint: cached.fingerprint || {},
            _fallbackUpdatedAt: cached.updatedAt || 0,
        };
    }

    function setFallbackProbeCache(proxy, api) {
        if (!fallbackCacheEnabled || !cache || !api || !needsFallbackProbeCache(proxy)) return;
        cache.set(getFallbackCacheId(proxy), {
            api,
            fingerprint: getProbeFingerprint(proxy),
            updatedAt: Date.now(),
        });
    }

    function finishProbeFailure(proxy, proxies, onResult) {
        const fallback = getFallbackProbeCache(proxy);
        if (fallback) {
            applyProbeResult(proxy, proxies, fallback);
            logFallbackProbeCache(proxy, fallback);
            onResult(proxy, fallback);
            return;
        }
        applyProbeResult(proxy, proxies, null);
        onResult(proxy, null);
    }

    function needsFallbackProbeCache(proxy) {
        return !detectRegionFromName(proxy.name || '');
    }

    function getProbeFingerprint(proxy) {
        return {
            server: proxy.server || '',
            port: proxy.port || '',
            type: proxy.type || '',
        };
    }

    function logFallbackProbeCache(proxy, fallback) {
        $.info(`[PARSER][${proxy.name}] 使用兜底缓存 country=${fallback.countryCode || ''} oldServer=${fallback._fallbackFingerprint?.server || ''} newServer=${proxy.server || ''}`);
    }
}

// ============================================================
// Rename 元数据
// ============================================================
function prepareProxyMetadata(proxy, groupIndex = 0, forceGeoRegion = false) {
    const originalName = proxy.name || '';
    const lowerName = originalName.toLowerCase();

    proxy.originalName = originalName;

    const geoCountryCode = proxy._geo?.countryCode || '';
    const nameRegionInfo = forceGeoRegion ? null : detectRegionFromName(originalName);
    setRegionMetadata(proxy, nameRegionInfo?.code || geoCountryCode || 'ZZ');

    // 检测 tag
    proxy.tag = detectTag(lowerName);

    // groupIndex 来自外部重排，原始 index 备用
    proxy.index = groupIndex;
    proxy._rawIndex = (() => {
        const m = [...originalName.matchAll(/\d+/g)];
        return m.length > 0 ? parseInt(m[m.length - 1][0]) : 0;
    })();
}

// 编译 format 模板，避免整批节点重复解析字符串
function compileFormat(formatStr) {
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
    return {
        parts,
        hasStaticText: formatStr.replace(/\{[^}]+\}/g, '').replace(/\s+/g, '') !== '',
    };
}

function applyCompiledFormat(proxy, compiledFormat, connectorStr) {
    const conn = connectorStr ?? '-';
    const resultParts = [];
    for (const part of compiledFormat.parts) {
        resultParts.push(part.type === 'text' ? part.value : resolvePlaceholder(proxy, part.value, conn));
    }
    const filteredParts = resultParts.filter(v => v && v.trim() !== '');

    if (compiledFormat.hasStaticText) {
        return filteredParts.join('');
    }

    return filteredParts.join(conn);
}

// 解析单个占位符
function resolvePlaceholder(proxy, placeholder, conn) {
    const geo = proxy._geo || {};
    const lowerName = (proxy.originalName || '').toLowerCase();

    if (placeholder === 'countryCode') return geo.countryCode || '';
    if (placeholder === 'country') return geo.country || '';
    if (placeholder === 'isp') return geo.isp || '';
    if (placeholder === 'latency') return String(geo.latency !== undefined && geo.latency !== null ? geo.latency : 0);

    // {tag:XXX} / {tag:Output=keyword1|keyword2}
    if (placeholder.startsWith('tag:')) {
        const tagSpec = placeholder.substring(4);
        const eqIndex = tagSpec.indexOf('=');
        if (eqIndex === -1) {
            const tagName = tagSpec.trim();
            return tagName && matchTagKeywords(lowerName, [tagName]) ? tagName : '';
        }

        const output = tagSpec.substring(0, eqIndex).trim();
        const keywords = tagSpec.substring(eqIndex + 1).split('|').map(v => v.trim()).filter(Boolean);
        return output && matchTagKeywords(lowerName, keywords) ? output : '';
    }

    // {index:2d} / {i:2d}
    if ((placeholder.startsWith('index:') || placeholder.startsWith('i:')) && placeholder.endsWith('d')) {
        const width = parseInt(placeholder.substring(placeholder.indexOf(':') + 1, placeholder.length - 1));
        if (!isNaN(width)) return String(proxy.index || 0).padStart(width, '0');
    }

    const fieldMap = {
        'region_code': proxy.region_code,
        'region': proxy.region_code,
        'region_name': proxy.region_name,
        'region_name_cn': proxy.region_name_cn,
        'region_flag': proxy.region_flag,
        'tag': proxy.tag,
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
    const parts = splitSortParts(sortString);

    for (const part of parts) {
        if (!part) continue;

        const newMatch = part.match(/^\{([^}]+)\}(?:\(([^)]+)\))?\s*(ASC|DESC)?$/i);
        const colonMatch = !newMatch ? parseColonSortRule(part) : null;
        const oldMatch = !newMatch && !colonMatch ? part.match(/^([\w_]+)(?:\(([^)]+)\))?(?:\s+(ASC|DESC))?$/i) : null;

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
        } else if (colonMatch) {
            field = colonMatch.field;
            values = colonMatch.values;
            order = colonMatch.order;
        } else if (oldMatch) {
            field = oldMatch[1].toLowerCase();
            values = oldMatch[2] ? oldMatch[2].split(',').map(v => v.trim().toUpperCase()) : [];
            order = (oldMatch[3] || 'ASC').toLowerCase();
        } else {
            continue;
        }

        const fieldMap = {
            'region_code': 'countryCode', 'region': 'countryCode',
            'region_name': 'countryName', 'region_name_cn': 'countryNameCn',
            'region_flag': 'countryFlag', 'tag': 'tag',
            'index': 'index', 'i': 'index',
            'name': 'name',
        };

        const type = fieldMap[field] || field;
        const isTagMatch = type === 'tag' && values.length > 0 && colonMatch;

        rules.push({
            type: isTagMatch ? 'tagMatch' : type,
            values,
            hasValues: values.length > 0,
            order,
        });
    }

    return rules;
}

function splitSortParts(sortString) {
    if (sortString.includes('|')) {
        return sortString.split('|').map(part => part.trim()).filter(Boolean);
    }
    if (sortString.includes(':') && !sortString.includes('{') && !sortString.includes('(')) {
        return [sortString.trim()];
    }

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
    return parts;
}

function parseColonSortRule(part) {
    const tokens = part.split(':').map(v => v.trim()).filter(Boolean);
    if (tokens.length < 2) return null;

    const last = tokens[tokens.length - 1].toLowerCase();
    const hasOrder = last === 'asc' || last === 'desc';
    const field = tokens[0].toLowerCase();
    const rawValues = hasOrder ? tokens.slice(1, -1).join(':') : tokens.slice(1).join(':');

    return {
        field,
        values: rawValues ? rawValues.split(',').map(v => v.trim().toUpperCase()).filter(Boolean) : [],
        order: hasOrder ? last : 'asc',
    };
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
            } else if (type === 'countryName') {
                const va = a._geo?.country || a.region_name || '';
                const vb = b._geo?.country || b.region_name || '';
                comparison = va.localeCompare(vb);
            } else if (type === 'countryNameCn') {
                const va = a.region_name_cn || '';
                const vb = b.region_name_cn || '';
                comparison = va.localeCompare(vb, 'zh-CN');
            } else if (type === 'name') {
                comparison = (a.name || '').localeCompare(b.name || '', 'zh-CN');
            } else if (type === 'index') {
                const va = a.index ?? parseInt((a.originalName || '').match(/\d+/)?.[0] || '0');
                const vb = b.index ?? parseInt((b.originalName || '').match(/\d+/)?.[0] || '0');
                comparison = va - vb;
            } else if (type === 'tagMatch') {
                const nameA = (a.originalName || a.name || '').toUpperCase();
                const nameB = (b.originalName || b.name || '').toUpperCase();
                const ha = values.some(value => nameA.includes(value));
                const hb = values.some(value => nameB.includes(value));
                if (ha !== hb) comparison = ha ? 1 : -1;
            } else if (type === 'has_tag') {
                const ha = Boolean(a.tag);
                const hb = Boolean(b.tag);
                if (ha !== hb) comparison = ha ? 1 : -1;
            } else if (type === 'tag') {
                // 产出中性比较值（命中 values / 有 tag 者排前为负），方向统一由末尾 order 反转处理
                const ta = a.tag || '';
                const tb = b.tag || '';
                if (hasValues && values.length) {
                    const ha = ta && values.includes(ta.toUpperCase());
                    const hb = tb && values.includes(tb.toUpperCase());
                    if (ha !== hb) comparison = ha ? -1 : 1;
                    else if (ta && tb) comparison = ta.localeCompare(tb);
                    else if (ta) comparison = -1;
                    else if (tb) comparison = 1;
                } else {
                    if (ta && tb) comparison = ta.localeCompare(tb);
                    else if (ta) comparison = -1;
                    else if (tb) comparison = 1;
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
// 从节点名称识别 region
function detectRegionFromName(name) {
    const codeFromFlag = detectRegionCodeFromFlag(name);
    if (codeFromFlag) return { code: codeFromFlag };

    const tokens = String(name || '').toUpperCase().match(/[A-Z]{2,}/g) || [];
    for (const token of tokens) {
        if (token.length !== 2) continue;
        if (REGION_CODE_IGNORE.has(token)) continue;
        if (isValidRegionCode(token)) return { code: token };
    }

    const lowerName = String(name || '').toLowerCase();
    for (const hint of getRegionNameHints()) {
        if (hint.keywords.some(keyword => matchKeyword(lowerName, keyword))) {
            return { code: hint.code };
        }
    }
    return null;
}

function setRegionMetadata(proxy, code) {
    if (!/^[A-Z]{2}$/.test(code || '') || code === 'ZZ') {
        proxy.region_code = 'ZZ';
        proxy.region_flag = '';
        proxy.region_name = 'Unknown';
        proxy.region_name_cn = '未知';
        return;
    }

    proxy.region_code = code;
    proxy.region_flag = getRegionFlag(code);
    proxy.region_name = getRegionDisplayName(code, 'en') || code;
    proxy.region_name_cn = getRegionDisplayName(code, 'zh-CN') || '未知';
}

function isValidRegionCode(code) {
    if (!/^[A-Z]{2}$/.test(code || '')) return false;
    const displayName = getRegionDisplayName(code, 'en');
    return !!displayName && displayName !== code;
}

function detectRegionCodeFromFlag(text) {
    const flags = String(text || '').match(/[\u{1F1E6}-\u{1F1FF}]{2}/gu) || [];
    for (const flag of flags) {
        const chars = Array.from(flag);
        if (chars.length !== 2) continue;
        const code = chars.map(ch => String.fromCharCode(ch.codePointAt(0) - 127397)).join('');
        if (isValidRegionCode(code)) return code;
    }
    return '';
}

function getRegionDisplayName(code, locale) {
    if (!/^[A-Z]{2}$/.test(code || '')) return '';
    try {
        let fmt = REGION_NAME_FORMATTERS[locale];
        if (!fmt) {
            fmt = new Intl.DisplayNames([locale], { type: 'region', fallback: 'code' });
            REGION_NAME_FORMATTERS[locale] = fmt;
        }
        return fmt.of(code) || '';
    } catch (_) {
        return '';
    }
}

function getRegionNameHints() {
    if (REGION_NAME_HINTS) return REGION_NAME_HINTS;

    const hints = [];
    for (let first = 65; first <= 90; first++) {
        for (let second = 65; second <= 90; second++) {
            const code = String.fromCharCode(first, second);
            if (REGION_CODE_IGNORE.has(code)) continue;
            if (REGION_CODE_DEPRECATED.has(code)) continue;
            if (!isValidRegionCode(code)) continue;

            const keywords = [];
            for (const locale of REGION_NAME_LOCALES) {
                const displayName = getRegionDisplayName(code, locale);
                if (displayName && displayName !== code) {
                    keywords.push(...expandRegionDisplayName(displayName));
                }
            }

            const uniqueKeywords = [...new Set(keywords)].sort((a, b) => b.length - a.length);
            if (uniqueKeywords.length > 0) {
                hints.push({ code, keywords: uniqueKeywords });
            }
        }
    }

    REGION_NAME_HINTS = hints;
    return REGION_NAME_HINTS;
}

function expandRegionDisplayName(displayName) {
    const variants = new Set([displayName]);
    let normalized = displayName;

    normalized = normalized.replace(/\s+SAR China$/i, '');
    normalized = normalized.replace(/特别行政区$/u, '');
    normalized = normalized.replace(/特別行政區$/u, '');
    normalized = normalized.replace(/^中国/u, '');
    normalized = normalized.replace(/^中國/u, '');

    if (normalized && normalized !== displayName) {
        variants.add(normalized);
    }

    return [...variants];
}

function getRegionFlag(code) {
    if (!/^[A-Z]{2}$/.test(code || '')) return '';
    try {
        return [...code].map(c => String.fromCodePoint(127397 + c.charCodeAt(0))).join('');
    } catch (_) {
        return '';
    }
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

function matchTagKeywords(text, keywords) {
    return keywords.some(keyword => matchKeyword(text, keyword));
}

function detectTag(name) {
    for (const preset of TAG_PRESETS) {
        if (matchTagKeywords(name, preset.keywords)) return preset.name;
    }
    return '';
}

// 解析 flat 参数: "{host1:ip1,ip2}{host2:ip3}" -> { host1: ['ip1','ip2'], host2: ['ip3'] }
function parseFlatMap(raw) {
    const map = {};
    if (!raw) return map;
    const regex = /\{([^}]+)\}/g;
    let match;
    while ((match = regex.exec(raw)) !== null) {
        const colon = match[1].indexOf(':');
        if (colon === -1) continue;
        const host = match[1].substring(0, colon).trim();
        const ips = match[1].substring(colon + 1).split(',').map(s => s.trim()).filter(Boolean);
        if (host && ips.length) map[host] = ips;
    }
    return map;
}

function toBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
    return defaultValue;
}

function parsePositiveNumber(value, defaultValue) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function parsePositiveInt(value, defaultValue) {
    const parsed = parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

function parseNonNegativeInt(value, defaultValue) {
    const parsed = parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : defaultValue;
}

async function httpRequest(opt = {}) {
    const reqMethod = opt.method || 'get';
    const reqTimeout = parsePositiveNumber(opt.timeout, 5000);
    const reqRetries = parseNonNegativeInt(opt.retries ?? $arguments.retries, 1);
    const reqRetryDelay = parsePositiveNumber(opt.retry_delay ?? $arguments.retry_delay, 1000);

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
    concurrency = parsePositiveInt(concurrency, 1);
    return new Promise((resolve) => {
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
