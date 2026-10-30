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
 * 参数命名规则：按功能分组加前缀，同组参数一眼可辨。
 * - meta_*  : HTTP META 探测服务进程本身（host/port/protocol/auth/启动延时）
 * - probe_* : 探测流程（是否全探、请求 API、并发、重试、单节点超时）
 * - cache*  : 脚本缓存开关
 * - 无前缀的 format/connector/sort/debug 是最常用参数，保留短别名 f/c/s/d
 *
 * Meta 服务参数（HTTP META 子进程）
 * - meta_protocol    协议            默认: http
 * - meta_host        服务地址        默认: 127.0.0.1
 * - meta_port        端口            默认: 9876
 * - meta_auth        Authorization   默认: 空
 * - meta_start_delay 启动后等待多久开始探测(ms) 默认: 3000
 *
 * 探测参数
 * - probe_all     对所有节点强制探测（默认 false：节点名可识别 region 时跳过探测）
 * - probe_api     测落地的 API  默认: http://ip-api.com/json?lang=zh-CN（返回 JSON，直接取 countryCode/isp）
 * - probe_method  请求方法      默认: get
 * - probe_concurrency 并发数    默认: 10
 * - probe_retries 请求重试次数  默认: 1
 * - probe_retry_delay 请求重试间隔(ms) 默认: 1000
 * - probe_timeout 单节点预估耗时(ms)，同时用作单次请求超时 默认: 3000
 * - detect              可选 udp,http,exit,gpt,entrance；check 为兼容别名，模板含 {region*} 时也会触发出口检测
 * - options             JSON 对象，分别配置 exit、udp、http 的检测范围和选项
 * - exit_is_cn_check     兼容旧参数：默认亚洲地区；自定义原始节点名正则，空=关闭，.*=全量
 * - exit_is_cn_check_exclude 排除原始节点名正则，优先于 exit_is_cn_check
 * - exit_is_cn_check_timeout 单个 Google/YouTube 请求超时(ms)，默认 5000
 * - exit_is_cn_check_concurrency 并发节点数，默认 2
 * - exit_is_cn_check_cache_ttl 各服务独立缓存(ms)，默认 21600000；未知最长 600000，META启动失败最长 60000
 * - options.exit.source  检测来源 terms（默认）或 youtube
 * - check_udp / check_http 可选能力检测，默认 false；HTTP 多次采样计算请求失败率
 * - check_scope / check_exclude 原始节点名称正则；默认全部 / 空
 * - check_timeout 5000ms, check_concurrency 2, check_samples 1（最大 20）
 * - check_ntp time.apple.com, check_url http://cp.cloudflare.com/generate_204, check_status 204
 * - check_cache_ttl 21600000ms；失败最长缓存 600000ms，cache=false 禁用
 * - 检测仅写 _googleCheck，不改 region/_failed；模板 {region*} 输出带送中标记的地区，如 HK*
 * - ipinfo_url    META 失败后的 ipinfo Lite 兜底 API 模板 默认: https://api.ipinfo.io/lite/{ip}
 * - ipinfo_token  ipinfo API Token（优先于 env 注入，优先于进程环境变量）
 * - env / e       环境变量式参数注入，格式: {IPINFO_API_TOKEN:xxx}
 * - include_unsupported 传递给运行环境时包含官方/商店版不支持的协议 默认: false
 *
 * 缓存参数
 * - cache          使用 Sub-Store 脚本缓存 默认: true（设为 false 等价于旧版 noCache=true）
 * - cache_fallback 探测失败时使用节点身份兜底缓存 默认: true
 *
 * Region 参数
 * - force_geo_region 强制使用 API 探测的 countryCode 作为 region 默认: false
 *
 * Rename 参数
 * - format / f   格式化模板    默认: {region_code}
 *                 占位符: region_code/region_name/region_name_cn/region_flag/
 *                 tag/index/i(2d 补零)/original/name/countryCode/country/isp/latency/
 *                 tag:XXX 或 tag:Output=kw1|kw2（关键字命中才输出）/
 *                 prefix:XXX（固定前缀文本，参与 connector 拼接，不是静态文本）
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
 * 调试参数
 * - debug / d      调试日志 默认: true
 * - debug_node     只打印名称含此关键字的节点的原始/internal 数据
 *
 * 过滤参数
 * - 探测失败的节点会被标记 _failed=true（不在此移除，交由下游环节处理）
 *
 * 使用示例（mode: link）：
 * https://cdn地址#f={region}{i:2d}{tag}&c=-&s={region}ASC
 */

// ============================================================
// 参数别名（对外提供的入参别名，统一在此注册——不要在读取处再手写 ?? 兼容别名）
// ============================================================
// 注意：不使用单字母短名称（如 l），避免与 Sub-Store 内部参数（c/f/s）冲突
const PARAM_ALIAS = {
    format: 'f',
    connector: 'c',
    sort: 's',
    debug: 'd',
    env: 'e',
};

// 统一读取 $arguments：优先取规范名，其次取别名
function getArg(name) {
    return $arguments[name] ?? $arguments[PARAM_ALIAS[name]];
}

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

// getRegionNameHints() 需遍历 676 个候选双字母代码、每个最多 3 次 Intl.DisplayNames.of()，
// 单次构建耗时 25~80ms；REGION_NAME_HINTS 只是模块级变量，脚本引擎每次调用都会重新执行整个
// 模块（不像常驻进程那样跨请求保留闭包状态），故额外持久化一份到 scriptResourceCache，
// 跨调用复用，避免每次刷新订阅都重建整张表。
const REGION_HINTS_CACHE_KEY = 'parser:region_name_hints:v1';
const REGION_HINTS_CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 天

// Google check parsers ported from lmc999/RegionRestrictionCheck (AGPL-3.0),
// check.sh@1a856acc4bf42e27fec3ff64b1e9731892b5c3bb, 2026-10-26.
// See THIRD_PARTY_NOTICES.md and LICENSE.RegionRestrictionCheck.
const GOOGLE_CHECK_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const GOOGLE_CHECK_ASIA_REGIONS = new Set('AF AM AZ BH BD BT BN KH CN CY GE HK IN ID IR IQ IL JP JO KZ KW KG LA LB MO MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE'.split(' '));

function compileCheckScope(value, name) {
    if (!String(value ?? '').trim()) return null;
    try { return new RegExp(String(value), 'i'); }
    catch (_) { throw new Error(`Invalid ${name} regular expression`); }
}

function parseYoutubePremium(body) {
    if (!body) return { status: 'unknown', region: '', reason: 'empty_response' };
    if (body.includes('www.google.cn')) return { status: 'cn', region: 'CN', reason: 'www.google.cn' };
    if (/Premium is not available in your country/i.test(body)) return { status: 'unavailable', region: '', reason: 'premium_unavailable' };
    const region = body.match(/"INNERTUBE_CONTEXT_GL"\s*:\s*"([^"]+)"/)?.[1] || 'UNKNOWN';
    if (/ad-free/i.test(body)) return { status: 'available', region, reason: 'ad-free' };
    return { status: 'unknown', region: '', reason: 'page_error' };
}

function parseGoogleTerms(body) {
    if (!body) return { status: 'unknown', region: '', reason: 'empty_response' };
    const region = body.match(/data-name=["']country-version["'][^>]*>[^<]*<\/a>\s*([^<]+)/i)?.[1]?.trim() || '';
    if (!region) return { status: 'unknown', region: '', reason: 'region_not_found' };
    return { status: /^china$/i.test(region) ? 'cn' : 'available', region, reason: 'country_version' };
}

function parseGptResponse(status, body) {
    let data = body;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (_) { data = null; } }
    const code = String(data?.error?.code || data?.error?.error_type || '');
    if (/unsupported_country/i.test(code)) return { status: 'unsupported', reason: code };
    if (Number(status) === 403 && /^(unauthorized|authentication_required|invalid_api_key)$/i.test(code)) return { status: 'reachable', reason: code };
    return { status: 'unknown', reason: `http_${status}` };
}

function isPublicEntranceAddress(address, net) {
    const version = net.isIP(address);
    if (version === 4) {
        const [a, b, c] = address.split('.').map(Number);
        return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) ||
            (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0 && c === 2) ||
            (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113));
    }
    if (version === 6) return !/^(::|fc|fd|fe[89ab]|ff)/i.test(address);
    return false;
}

function googleServiceFresh(saved, service, now, ttl) {
    const result = saved?.[service];
    const checkedAt = saved?.[`${service}CheckedAt`] ?? saved?.checkedAt;
    if (!result || result.status === 'skipped' || !Number.isFinite(checkedAt)) return false;
    const known = ['cn', 'available', 'unavailable'].includes(result.status);
    const lifetime = result.reason === 'meta_failed' ? Math.min(ttl, 60000)
        : known ? ttl : Math.min(ttl, 600000);
    return now >= checkedAt && now - checkedAt < lifetime;
}

// ============================================================
// 主入口
// ============================================================
async function operator(proxies = [], targetPlatform, context) {
    const $ = $substore;
    const __startedAt = Date.now();

    // 命名约定：与 $arguments 入参同名的局部变量保留 snake_case（便于和入参对照），
    // 由入参派生的内部状态用 camelCase。别名统一通过 getArg() 读取，不在这里手写 ?? 兼容。

    // 来源信息（用于日志标识）
    const source = context?.source || {};
    const sourceName = source._collection?.displayName || source._collection?.name || source.name || $arguments._sourceName || 'unknown';

    // Meta 服务配置（HTTP META 子进程本身）
    const meta_host = $arguments.meta_host ?? '127.0.0.1';
    const meta_port = parsePositiveInt($arguments.meta_port, 9876);
    const meta_protocol = $arguments.meta_protocol ?? 'http';
    const meta_auth = $arguments.meta_auth ?? '';
    const meta_api = `${meta_protocol}://${meta_host}:${meta_port}`;
    const meta_start_delay = parsePositiveNumber($arguments.meta_start_delay, 3000);

    // 探测配置：通过节点出口请求 ip-api.com，直接取 countryCode/isp
    const probe_timeout = parsePositiveNumber($arguments.probe_timeout, 3000);
    const probe_api = $arguments.probe_api || 'http://ip-api.com/json?lang=zh-CN&fields=status,country,countryCode,isp,query';
    const probe_method = $arguments.probe_method || 'get';
    const probe_concurrency = parsePositiveInt($arguments.probe_concurrency, 10);
    const ipinfo_url = $arguments.ipinfo_url || 'https://api.ipinfo.io/lite/{ip}';
    const injectedEnv = parseEnvMap(getArg('env') ?? '');
    // ipinfo Token（优先脚本参数，其次 env={IPINFO_API_TOKEN:...}，最后才兼容进程环境变量）
    const ipinfo_token = $arguments.ipinfo_token
        ?? injectedEnv.IPINFO_API_TOKEN
        ?? injectedEnv.ipinfo_api_token
        ?? (typeof process !== 'undefined' ? process.env.IPINFO_API_TOKEN : null)
        ?? '';
    const cacheEnabled = toBoolean($arguments.cache, true);
    const cache = typeof scriptResourceCache !== 'undefined' ? scriptResourceCache : null;
    const probeCacheIds = new WeakMap();
    const connectionIds = new WeakMap();
    const googleRequests = new Map();
    const fallbackCacheEnabled = cacheEnabled && toBoolean($arguments.cache_fallback, true);
    const includeUnsupportedProxy = toBoolean($arguments.include_unsupported, false);
    let checkOptions = $arguments.options ?? {};
    if (typeof checkOptions === 'string') {
        try { checkOptions = JSON.parse(checkOptions); } catch (_) { throw new Error('Invalid options JSON'); }
    }
    if (!checkOptions || typeof checkOptions !== 'object' || Array.isArray(checkOptions)) throw new Error('Invalid options');
    const allowedOptions = { exit: ['source', 'scope', 'exclude', 'timeout', 'concurrency', 'cache_ttl'], udp: ['scope', 'exclude', 'timeout', 'ntp'], http: ['scope', 'exclude', 'timeout', 'samples', 'url', 'status'], gpt: ['scope', 'exclude', 'timeout', 'client'], entrance: ['scope', 'exclude', 'timeout'] };
    for (const [service, options] of Object.entries(checkOptions)) {
        if (!allowedOptions[service] || !options || typeof options !== 'object' || Array.isArray(options)) throw new Error(`Invalid options: ${service}`);
        for (const key of Object.keys(options)) if (!allowedOptions[service].includes(key)) throw new Error(`Invalid options: ${service}.${key}`);
    }
    const exitOptions = checkOptions.exit || {}, udpOptions = checkOptions.udp || {}, httpOptions = checkOptions.http || {};
    const gptOptions = checkOptions.gpt || {}, entranceOptions = checkOptions.entrance || {};
    const exitSource = String(exitOptions.source ?? 'terms').toLowerCase();
    if (!['terms', 'youtube'].includes(exitSource)) throw new Error(`Invalid options.exit.source: ${exitSource}`);
    const explicitChecks = $arguments.detect != null || $arguments.check != null;
    const rawChecks = $arguments.detect ?? $arguments.check;
    const checks = new Set((Array.isArray(rawChecks) ? rawChecks : String(rawChecks ?? '').split(',')).map(v => String(v).trim().toLowerCase()).filter(Boolean));
    for (const check of checks) if (!['exit', 'udp', 'http', 'gpt', 'entrance'].includes(check)) throw new Error(`Invalid ${$arguments.detect != null ? 'detect' : 'check'}: ${check}`);
    const cnCheckEnabled = String(getArg('format') ?? '').includes('{region*}') || checks.has('exit');
    const exitScope = exitOptions.scope ?? $arguments.exit_is_cn_check;
    const cnScope = !cnCheckEnabled ? null : exitScope == null
        ? { test: name => GOOGLE_CHECK_ASIA_REGIONS.has(detectRegionFromName(name)?.code) }
        : compileCheckScope(exitScope, exitOptions.scope != null ? 'options.exit.scope' : 'exit_is_cn_check');
    const cnExclude = cnCheckEnabled ? compileCheckScope(exitOptions.exclude ?? $arguments.exit_is_cn_check_exclude, 'options.exit.exclude') : null;
    const cnTimeout = parsePositiveNumber(exitOptions.timeout ?? $arguments.exit_is_cn_check_timeout, 5000);
    const cnConcurrency = parsePositiveInt(exitOptions.concurrency ?? $arguments.exit_is_cn_check_concurrency, 2);
    const cnCacheTtl = parsePositiveNumber(exitOptions.cache_ttl ?? $arguments.exit_is_cn_check_cache_ttl, 21600000);
    const capabilityUdp = explicitChecks ? checks.has('udp') : toBoolean($arguments.check_udp, false);
    const capabilityHttp = explicitChecks ? checks.has('http') : toBoolean($arguments.check_http, false);
    const capabilityGpt = checks.has('gpt');
    const entranceEnabled = checks.has('entrance');
    const capabilityEnabled = capabilityUdp || capabilityHttp || capabilityGpt;
    const udpScope = capabilityUdp ? compileCheckScope(udpOptions.scope ?? $arguments.check_scope ?? '.*', udpOptions.scope != null ? 'options.udp.scope' : 'check_scope') : null;
    const httpScope = capabilityHttp ? compileCheckScope(httpOptions.scope ?? $arguments.check_scope ?? '.*', httpOptions.scope != null ? 'options.http.scope' : 'check_scope') : null;
    const udpExclude = capabilityUdp ? compileCheckScope(udpOptions.exclude ?? $arguments.check_exclude, 'options.udp.exclude') : null;
    const httpExclude = capabilityHttp ? compileCheckScope(httpOptions.exclude ?? $arguments.check_exclude, 'options.http.exclude') : null;
    const gptScope = capabilityGpt ? compileCheckScope(gptOptions.scope ?? '.*', 'options.gpt.scope') : null;
    const gptExclude = capabilityGpt ? compileCheckScope(gptOptions.exclude, 'options.gpt.exclude') : null;
    const entranceScope = entranceEnabled ? compileCheckScope(entranceOptions.scope ?? '.*', 'options.entrance.scope') : null;
    const entranceExclude = entranceEnabled ? compileCheckScope(entranceOptions.exclude, 'options.entrance.exclude') : null;
    const gptTimeout = parsePositiveNumber(gptOptions.timeout, 5000);
    const entranceTimeout = parsePositiveNumber(entranceOptions.timeout, 5000);
    const gptClient = String(gptOptions.client ?? 'ios').toLowerCase();
    if (!['ios', 'android'].includes(gptClient)) throw new Error(`Invalid options.gpt.client: ${gptClient}`);
    const udpTimeout = parsePositiveNumber(udpOptions.timeout ?? $arguments.check_timeout, 5000);
    const httpTimeout = parsePositiveNumber(httpOptions.timeout ?? $arguments.check_timeout, 5000);
    const capabilityConcurrency = parsePositiveInt($arguments.check_concurrency, 2);
    const capabilitySamples = Math.min(20, parsePositiveInt(httpOptions.samples ?? $arguments.check_samples, 1));
    const capabilityNtp = String(udpOptions.ntp || $arguments.check_ntp || 'time.apple.com');
    const capabilityUrl = String(httpOptions.url || $arguments.check_url || 'http://cp.cloudflare.com/generate_204');
    const capabilityStatus = parsePositiveInt(httpOptions.status ?? $arguments.check_status, 204);
    const capabilityTtl = parsePositiveNumber($arguments.check_cache_ttl, 21600000);

    // 调试日志
    const debug = getArg('debug') ?? true;
    const log = debug ? $.info.bind($) : () => {};

    // Rename 配置
    const rawFormat = getArg('format') ?? '{region_code}';
    const automaticDetectionNames = getArg('format') == null;
    const format = normalizePlaceholder(rawFormat);
    const compiledFormat = format ? compileFormat(format) : null;
    const connector = getArg('connector') ?? '-';
    const rawSort = getArg('sort') ?? null;
    const sort = rawSort ? normalizePlaceholder(rawSort) : null;
    const forceGeoRegion = toBoolean($arguments.force_geo_region, false);
    const flatMap = parseFlatMap($arguments.flat ?? '');
    const debugNodeKeyword = String($arguments.debug_node || '').toLowerCase();

    function formatNode(proxy) {
        let name = applyCompiledFormat(proxy, compiledFormat, connector);
        if (!automaticDetectionNames) return name;
        const check = proxy._googleCheck;
        if (checks.has('exit') && check?.[check?.source]?.status === 'cn') name += '*';
        const capabilities = proxy._capabilityCheck || {};
        const tags = [];
        if (capabilityUdp && capabilities.udp?.status === 'ok') tags.push('UDP');
        if (capabilityGpt && capabilities.gpt?.status === 'reachable') tags.push('GPT');
        if (entranceEnabled && proxy._entrance?.status === 'ok' && proxy._entrance.countryCode) tags.push(proxy._entrance.countryCode);
        if (capabilityHttp && capabilities.http?.status === 'ok' && capabilities.http.averageLatencyMs != null) tags.push(`${capabilities.http.averageLatencyMs}ms`);
        return [name, ...tags].filter(Boolean).join(connector);
    }

    // ---- Step 1: 转换节点为 internal 格式 ----
    const internalProxies = [];
    proxies.forEach((proxy, index) => {
        delete proxy._googleCheck;
        if (capabilityEnabled) delete proxy._capabilityCheck;
        if (entranceEnabled) delete proxy._entrance;
        try {
            const node = ProxyUtils.produce([{ ...proxy }], 'ClashMeta', 'internal', {
                'include-unsupported-proxy': includeUnsupportedProxy,
            })?.[0];
            if (debugNodeKeyword && String(proxy.name || '').toLowerCase().includes(debugNodeKeyword)) {
                $.info(`[PARSER][DEBUG_NODE][raw] ${JSON.stringify(proxy)}`);
                $.info(`[PARSER][DEBUG_NODE][internal] ${JSON.stringify(node)}`);
            }
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
    if (!internalProxies.length) {
        $.info(`[PARSER] 总耗时: ${Date.now() - __startedAt}ms（无支持节点，提前返回）`);
        return proxies;
    }

    // ---- Step 2: 统一 META 探测，以落地结果作为 region 来源 ----
    let probeSuccess = 0;
    let probeFail = 0;

    // 名称已能识别 region 的节点跳过探测（probe_all=true 可强制全探）
    const probeAllNodes = toBoolean($arguments.probe_all, false);
    let skipByNameCount = 0;
    const needProbe = [];
    for (const proxy of internalProxies) {
        const p = proxies[proxy._proxies_index];
        // 结果缓存到 p._nameRegionInfo，供下方 prepareProxyMetadata 复用，避免同一节点名重复扫描 region 提示表
        const nameRegionInfo = probeAllNodes ? null : detectRegionFromName(p?.name || proxy.name || '');
        if (nameRegionInfo) {
            p._nameRegionInfo = nameRegionInfo;
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

    // Service-region checks must not inherit the name/GeoIP skip or fallback cache.
    if (cnScope) {
        const selected = internalProxies.filter(proxy => cnScope.test(proxy.name || '') && !cnExclude?.test(proxy.name || ''));
        const pending = [];
        let cacheHits = 0;
        const requests = new Set();
        const now = Date.now();
        for (const proxy of selected) {
            const saved = cacheEnabled && cache ? cache.get(googleCacheKey(proxy)) : null;
            const fresh = googleServiceFresh(saved, exitSource, now, cnCacheTtl);
            const result = {
                source: exitSource,
                [exitSource]: saved?.[exitSource] || { status: 'unknown', region: '', reason: 'not_checked' },
                [`${exitSource}CheckedAt`]: saved?.[`${exitSource}CheckedAt`] ?? saved?.checkedAt,
                checkedAt: saved?.checkedAt,
                cached: fresh,
            };
            proxies[proxy._proxies_index]._googleCheck = result;
            if (fresh) {
                cacheHits++;
                logGoogleResult(proxy, result, true);
            } else {
                pending.push(proxy);
                requests.add(connectionId(proxy));
            }
        }
        $.info(`[PARSER][GOOGLE] source=${exitSource} selected=${selected.length}/${internalProxies.length} cached=${cacheHits} pending=${pending.length} requests=${requests.size}`);
        if (pending.length) {
            try {
                await probeAll(pending, proxies, null, proxyWorker, cnTimeout, cnConcurrency);
            } catch (error) {
                $.error(`[PARSER][GOOGLE] META check failed: ${error.message || error}`);
                for (const proxy of pending) {
                    const p = proxies[proxy._proxies_index];
                    const result = p._googleCheck;
                    result[exitSource] = { status: 'unknown', region: '', reason: 'meta_failed' };
                    result[`${exitSource}CheckedAt`] = Date.now();
                    result.checkedAt = Date.now();
                    saveGoogleCheck(proxy, result);
                    logGoogleResult(proxy, result, false);
                }
            }
        }
        async function proxyWorker(proxy, proxies, port) {
            await checkGoogleNode(proxy, proxies, port);
        }
    }

    if (entranceScope) {
        const selected = internalProxies.filter(p => entranceScope.test(p.name || '') && !entranceExclude?.test(p.name || ''));
        const pendingByHost = new Map();
        await executeAsyncTasks(selected.map(proxy => async () => {
            const host = String(proxy.server || '').trim();
            if (!pendingByHost.has(host)) pendingByHost.set(host, checkEntrance(host));
            const result = await pendingByHost.get(host);
            proxies[proxy._proxies_index]._entrance = { ...result };
            $.info(`[PARSER][ENTRANCE][${proxy.name}] status=${result.status} region=${result.countryCode || '-'} reason=${result.reason || '-'}`);
        }), { concurrency: capabilityConcurrency });
        async function checkEntrance(host) {
            const key = `parser:entrance:v1:${host}`;
            const saved = cacheEnabled && cache ? cache.get(key) : null;
            const age = Date.now() - (saved?.checkedAt ?? 0);
            if (saved && age >= 0 && age < (saved.status === 'ok' ? capabilityTtl : Math.min(capabilityTtl, 600000))) return { ...saved, cached: true };
            let result;
            try {
                if (!host || /(?:^localhost$|\.localhost$|\.local$)/i.test(host)) throw new Error('non_public_address');
                const net = require('net');
                let ip = host;
                if (!net.isIP(host)) {
                    const timers = require('timers');
                    let timer;
                    try {
                        const resolved = await Promise.race([
                            require('dns').promises.lookup(host),
                            new Promise((_, reject) => { timer = timers.setTimeout(() => reject(new Error('dns_timeout')), entranceTimeout); }),
                        ]);
                        ip = resolved.address;
                    } finally { timers.clearTimeout(timer); }
                }
                if (!isPublicEntranceAddress(ip, net)) throw new Error('non_public_address');
                const response = await httpRequest({ method: 'get', url: `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode,isp,as,query`, timeout: entranceTimeout, retries: 0 });
                let data = response.body;
                if (typeof data === 'string') data = JSON.parse(data);
                const status = Number(response.status ?? response.statusCode);
                if (status !== 200) throw new Error(`lookup_http_${status || 'unknown'}`);
                if (data?.status !== 'success' || !data.countryCode) throw new Error(`lookup_status_${data?.status || 'unknown'}`);
                result = { status: 'ok', ip, countryCode: data.countryCode, isp: data.isp || '', asn: data.as || '' };
            } catch (error) { result = { status: 'unknown', reason: error.message || 'lookup_failed' }; }
            result.checkedAt = Date.now();
            if (cacheEnabled && cache) cache.set(key, result);
            return { ...result, cached: false };
        }
    }

    if (capabilityEnabled && (udpScope || httpScope || gptScope)) {
        const needed = new Map();
        const selected = internalProxies.filter(p => {
            const name = p.name || '';
            const flags = { udp: !!udpScope?.test(name) && !udpExclude?.test(name), http: !!httpScope?.test(name) && !httpExclude?.test(name), gpt: !!gptScope?.test(name) && !gptExclude?.test(name) };
            needed.set(p, flags);
            return flags.udp || flags.http || flags.gpt;
        });
        const pending = [];
        const keys = new Map();
        for (const proxy of selected) {
            const settings = JSON.stringify({ ...needed.get(proxy), capabilitySamples, capabilityNtp, capabilityUrl, capabilityStatus, udpTimeout, httpTimeout, gptTimeout, gptClient });
            const key = `parser:capability:v1:${settings}:${getProbeCacheId(proxy)}`;
            keys.set(proxy, key);
            const saved = cacheEnabled && cache ? cache.get(key) : null;
            const age = Date.now() - (saved?.checkedAt ?? 0);
            const ttl = saved?.incomplete ? Math.min(capabilityTtl, 600000) : capabilityTtl;
            if (saved && age >= 0 && age < ttl) {
                proxies[proxy._proxies_index]._capabilityCheck = { ...saved, cached: true };
            } else pending.push(proxy);
        }
        $.info(`[PARSER][CAPABILITY] selected=${selected.length} cached=${selected.length - pending.length} pending=${pending.length} udp=${capabilityUdp} http=${capabilityHttp} samples=${capabilitySamples}`);
        if (pending.length) {
            try {
                await probeAll(pending, proxies, null, capabilityWorker,
                    (capabilityUdp ? udpTimeout : 0) + (capabilityHttp ? httpTimeout * capabilitySamples : 0) + (capabilityGpt ? gptTimeout : 0), capabilityConcurrency);
            } catch (error) {
                $.error(`[PARSER][CAPABILITY] META failed: ${error.message || error}`);
                for (const proxy of pending) {
                    if (!proxies[proxy._proxies_index]._capabilityCheck) {
                        const result = { checkedAt: Date.now(), cached: false, incomplete: true, reason: 'meta_failed' };
                        if (needed.get(proxy).udp) result.udp = { status: 'unknown', reason: 'meta_failed' };
                        if (needed.get(proxy).http) result.http = { status: 'unknown', reason: 'meta_failed' };
                        if (needed.get(proxy).gpt) result.gpt = { status: 'unknown', reason: 'meta_failed' };
                        proxies[proxy._proxies_index]._capabilityCheck = result;
                        if (cacheEnabled && cache) cache.set(keys.get(proxy), result);
                    }
                }
            }
        }
        async function capabilityWorker(proxy, all, port) {
            const result = { checkedAt: Date.now(), cached: false, incomplete: false };
            if (needed.get(proxy).udp) {
                try {
                    const response = await httpRequest({ method: 'post', url: `${meta_api}/udp`,
                        headers: { 'Content-type': 'application/json', Authorization: meta_auth },
                        body: JSON.stringify({ ntp: capabilityNtp, port, timeout: udpTimeout }), timeout: udpTimeout + 1000, retries: 0 });
                    let body = response.body;
                    if (typeof body === 'string') {
                        try { body = JSON.parse(body); }
                        catch (_) { body = { result: body }; }
                    }
                    if (Number(response.status ?? response.statusCode) === 200 && body?.result === 'ok') result.udp = { status: 'ok' };
                    else { result.udp = { status: 'unknown', reason: body?.result === 'timeout' ? 'timeout' : 'no_success_response' }; result.incomplete = true; }
                } catch (error) { result.udp = { status: 'unknown', reason: error.message || 'request_failed' }; result.incomplete = true; }
            }
            if (needed.get(proxy).http) {
                let success = 0, elapsed = 0; const reasons = [];
                for (let i = 0; i < capabilitySamples; i++) {
                    const started = Date.now();
                    try {
                        const response = await httpRequest({ method: 'get', url: capabilityUrl,
                            proxy: `http://${meta_host}:${port}`, timeout: httpTimeout, retries: 0 });
                        const status = Number(response.status ?? response.statusCode);
                        if (status === capabilityStatus) { success++; elapsed += Date.now() - started; } else reasons.push(`http_${status}`);
                    } catch (error) { reasons.push(error.message || 'request_failed'); }
                }
                const failures = capabilitySamples - success;
                result.http = { status: failures === 0 ? 'ok' : success ? 'partial' : 'failed',
                    success, failures, samples: capabilitySamples, failureRate: failures * 100 / capabilitySamples, averageLatencyMs: success ? Math.round(elapsed / success) : null, reasons };
                if (failures) result.incomplete = true;
            }
            if (needed.get(proxy).gpt) {
                const started = Date.now();
                try {
                    const response = await httpRequest({ method: 'get', url: `https://${gptClient}.chat.openai.com`,
                        headers: { 'User-Agent': GOOGLE_CHECK_UA }, proxy: `http://${meta_host}:${port}`, timeout: gptTimeout, retries: 0 });
                    result.gpt = { ...parseGptResponse(response.status ?? response.statusCode, response.body), latencyMs: Date.now() - started };
                } catch (error) { result.gpt = { status: 'unknown', reason: error.message || 'request_failed' }; }
                if (result.gpt.status === 'unknown') result.incomplete = true;
            }
            result.checkedAt = Date.now();
            all[proxy._proxies_index]._capabilityCheck = result;
            if (cacheEnabled && cache) cache.set(keys.get(proxy), result);
            $.info(`[PARSER][CAPABILITY][${proxy.name}] udp=${result.udp?.status || 'off'} http=${result.http?.status || 'off'} gpt=${result.gpt?.status || 'off'} failures=${result.http?.failures ?? '-'} cached=false`);
        }
    }

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
            proxy.name = formatNode(proxy);
        });
    }

    if (sortRules.length > 0) {
        proxies = applySort(proxies, sortRules);
    }

    // ---- Step 4.5: 按 region 分组编号，然后重新格式化 ----
    if (compiledFormat) {
        proxies = reassignGroupIndex(proxies);
        proxies.forEach(proxy => {
            proxy.name = formatNode(proxy);
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
                    // A different endpoint has not been checked through Google.
                    delete cloned._googleCheck;
                    if (capabilityEnabled) delete cloned._capabilityCheck;
                    if (entranceEnabled) delete cloned._entrance;
                    cloned.name = (compiledFormat
                        ? formatNode({ ...cloned, name: cloned.originalName || '' })
                        : proxy.name) + connector + ip;
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

    persistNameRegionCache();
    $.info(`[PARSER] 总耗时: ${Date.now() - __startedAt}ms（节点数: ${proxies.length}）`);
    return proxies;

    // ============================================================
    // 统一探测：META
    // ============================================================
    async function probeAll(internalProxies, proxies, onResult, worker = probeOne, nodeTimeout = probe_timeout, concurrency = probe_concurrency) {
        if (internalProxies.length === 0) {
            return { ports: null, pid: null };
        }

        const coreProxies = [];
        const coreIndexes = new Map();
        const proxyIndexes = internalProxies.map(proxy => {
            // GeoIP fallback uses each alias's own identity cache; only service checks share ports.
            const key = worker === probeOne ? proxy : connectionId(proxy);
            if (!coreIndexes.has(key)) {
                coreIndexes.set(key, coreProxies.length);
                coreProxies.push(proxy);
            }
            return coreIndexes.get(key);
        });
        const timeout = meta_start_delay + internalProxies.length * nodeTimeout;

        const startRes = await httpRequest({
            method: 'post',
            url: `${meta_api}/start`,
            headers: {
                'Content-type': 'application/json',
                Authorization: meta_auth,
            },
            body: JSON.stringify({ proxies: coreProxies, timeout }),
            timeout: 10000,
        });

        let body = startRes.body;
        try { body = JSON.parse(body); } catch (_) {}
        const { ports, pid } = body || {};
        if (!pid || !ports) throw new Error(`HTTP META 启动失败: ${body}`);

        $.info(`[PARSER] HTTP META 启动 [端口: ${ports}] [PID: ${pid}] [超时: ${timeout}ms]`);
        try {
            await $.wait(meta_start_delay);
            await executeAsyncTasks(
                internalProxies.map((proxy, i) => () => worker(proxy, proxies, ports[proxyIndexes[i]], onResult)),
                { concurrency }
            );
        } finally {
            try {
                await httpRequest({
                    method: 'post',
                    url: `${meta_api}/stop`,
                    headers: { 'Content-type': 'application/json', Authorization: meta_auth },
                    body: JSON.stringify({ pid: [pid] }),
                    timeout: 5000,
                });
            } catch (e) {
                $.error(`[PARSER] 关闭 HTTP META 失败: ${e.message}`);
            }
        }

        return { ports, pid };
    }

    function googleCacheKey(proxy) {
        return `parser:google-check:v3:${exitSource}:${getProbeCacheId(proxy)}`;
    }

    function connectionId(proxy) {
        if (connectionIds.has(proxy)) return connectionIds.get(proxy);
        const config = Object.fromEntries(Object.entries(proxy)
            .filter(([key]) => !/^(name|collectionName|subName|id|_.*)$/i.test(key)));
        const id = JSON.stringify(config, (_key, value) => {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                return Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
            }
            return value;
        });
        connectionIds.set(proxy, id);
        return id;
    }

    function saveGoogleCheck(proxy, result) {
        if (!cacheEnabled || !cache) return;
        cache.set(googleCacheKey(proxy), result);
    }

    function logGoogleResult(proxy, result, cached) {
        const check = result[exitSource];
        $.info(`[PARSER][GOOGLE][${proxy.name}] source=${exitSource} status=${check.status} region=${check.region || '-'} reason=${check.reason} cached=${cached} checkedAt=${result.checkedAt}`);
    }

    async function checkGoogleNode(proxy, proxies, port) {
        async function request(url, parse) {
            const key = `${url}:${connectionId(proxy)}`;
            if (!googleRequests.has(key)) googleRequests.set(key, fetchResult(url, parse));
            return { ...await googleRequests.get(key) };
        }
        async function fetchResult(url, parse) {
            try {
                if (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) throw new Error('invalid_meta_port');
                const headers = { 'User-Agent': GOOGLE_CHECK_UA, 'accept-language': 'en-US,en;q=0.9' };
                const res = await httpRequest({ method: 'get', url, headers,
                    proxy: `http://${meta_host}:${port}`, timeout: cnTimeout, retries: 0 });
                const status = Number(res.status ?? res.statusCode);
                if (status !== 200) return { status: 'unknown', region: '', reason: `http_${status}` };
                return parse(typeof res.body === 'string' ? res.body : '');
            } catch (error) {
                return { status: 'unknown', region: '', reason: error.message || 'request_failed' };
            }
        }
        const result = { ...proxies[proxy._proxies_index]._googleCheck, cached: false };
        const url = exitSource === 'youtube' ? 'https://www.youtube.com/premium' : 'https://policies.google.com/terms?hl=en-US';
        result[exitSource] = await request(url, exitSource === 'youtube' ? parseYoutubePremium : parseGoogleTerms);
        result[`${exitSource}CheckedAt`] = Date.now();
        result.checkedAt = Date.now();
        proxies[proxy._proxies_index]._googleCheck = result;
        saveGoogleCheck(proxy, result);
        logGoogleResult(proxy, result, false);
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
            const geoData = await requestGeoApi(proxy, port, probe_api, false);
            if (!geoData) {
                await finishProbeFailure(proxy, proxies, onResult, cacheId);
                return;
            }

            const cached = { ...geoData, latency: Date.now() - startedAt };
            applyProbeResult(proxy, proxies, cached);
            setProbeCache(cacheId, cached);
            setFallbackProbeCache(proxy, cached);
            $.info(`[PARSER][${proxy.name}] OK country=${geoData.countryCode} latency=${cached.latency}ms api=${probe_api}`);
            onResult(proxy, cached);
        } catch (e) {
            const latency = Date.now() - startedAt;
            $.error(`[PARSER][${proxy.name}] TIMEOUT/${latency}ms: ${e.message || e.reason || String(e) || 'unknown'}`);
            await finishProbeFailure(proxy, proxies, onResult, cacheId);
        }
    }

    async function requestGeoApi(proxy, port, url, useBearerToken) {
        const startedAt = Date.now();
        const headers = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1',
        };
        if (useBearerToken && ipinfo_token) {
            headers['Authorization'] = `Bearer ${ipinfo_token}`;
        }

        try {
            const res = await httpRequest({
                proxy: `http://${meta_host}:${port}`,
                method: probe_method,
                headers,
                url,
                // 取出口 IP 的超时对齐单节点预估耗时，死节点不再因默认 5s+重试卡满 ~11s
                timeout: probe_timeout,
                retries: 0,
            });

            const status = parseInt(res.status || res.statusCode || 200);
            if (status !== 200) {
                $.info(`[PARSER][${proxy.name}] Geo API FAIL status=${status} latency=${Date.now() - startedAt}ms api=${url}`);
                return null;
            }

            const geoData = normalizeGeoApiBody(res.body);
            if (!geoData.countryCode) {
                $.info(`[PARSER][${proxy.name}] Geo API FAIL empty countryCode latency=${Date.now() - startedAt}ms api=${url}`);
                return null;
            }
            return geoData;
        } catch (e) {
            $.error(`[PARSER][${proxy.name}] Geo API TIMEOUT/${Date.now() - startedAt}ms api=${url}: ${e.message || e.reason || String(e) || 'unknown'}`);
            return null;
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
            if (cached?.api) {
                const result = { ...cached.api, _cached: true };
                applyProbeResult(proxy, proxies, result);
                $.info(`[PARSER][${proxy.name}] 预扫描命中成功缓存 country=${result.countryCode || ''}`);
                success++;
                directSuccess++;
            } else {
                // fallback/name cache is only a last resort after live META probing fails.
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
        if (probeCacheIds.has(proxy)) return probeCacheIds.get(proxy);
        const stableProxy = Object.fromEntries(
            Object.entries(proxy).filter(([key]) => !/^(collectionName|subName|id|_.*)$/i.test(key))
        );
        const id = `parser:http-meta:geo:${probe_api}:${JSON.stringify(stableProxy)}`;
        probeCacheIds.set(proxy, id);
        return id;
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
        return `parser:http-meta:geo:fallback:${probe_api}:${JSON.stringify(identity)}`;
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

    async function finishProbeFailure(proxy, proxies, onResult, cacheId) {
        const serverFallback = await requestServerIpInfoFallback(proxy);
        if (serverFallback) {
            applyProbeResult(proxy, proxies, serverFallback);
            setProbeCache(cacheId, serverFallback);
            setFallbackProbeCache(proxy, serverFallback);
            $.info(`[PARSER][${proxy.name}] META失败，使用 ipinfo server fallback country=${serverFallback.countryCode || ''} server=${proxy.server || ''}`);
            onResult(proxy, serverFallback);
            return;
        }

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

    async function requestServerIpInfoFallback(proxy) {
        if (!ipinfo_token || !ipinfo_url) {
            if (ipinfo_url) {
                $.info(`[PARSER][${proxy.name}] 跳过 ipinfo server fallback：未配置 IPINFO_API_TOKEN`);
            }
            return null;
        }

        const server = String(proxy.server || '').trim();
        if (!isIpAddress(server)) {
            $.info(`[PARSER][${proxy.name}] 跳过 ipinfo server fallback：server 不是 IP (${server || 'empty'})`);
            return null;
        }

        const url = ipinfo_url.replace(/\{ip\}/g, encodeURIComponent(server));
        const startedAt = Date.now();
        try {
            const res = await httpRequest({
                method: 'get',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1',
                    Authorization: `Bearer ${ipinfo_token}`,
                },
                url,
                timeout: probe_timeout,
                retries: 0,
            });

            const status = parseInt(res.status || res.statusCode || 200);
            if (status !== 200) {
                $.info(`[PARSER][${proxy.name}] ipinfo server fallback FAIL status=${status} latency=${Date.now() - startedAt}ms api=${url}`);
                return null;
            }

            const geoData = normalizeGeoApiBody(res.body);
            if (!geoData.countryCode) {
                $.info(`[PARSER][${proxy.name}] ipinfo server fallback FAIL empty countryCode latency=${Date.now() - startedAt}ms api=${url}`);
                return null;
            }
            return { ...geoData, latency: Date.now() - startedAt, _serverIpFallback: true };
        } catch (e) {
            $.error(`[PARSER][${proxy.name}] ipinfo server fallback TIMEOUT/${Date.now() - startedAt}ms api=${url}: ${e.message || e.reason || String(e) || 'unknown'}`);
            return null;
        }
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
    // 复用上方 skip-check 循环缓存的结果（如有），避免重复调用 detectRegionFromName
    const nameRegionInfo = forceGeoRegion
        ? null
        : (proxy._nameRegionInfo !== undefined ? proxy._nameRegionInfo : detectRegionFromName(originalName));
    setRegionMetadata(proxy, nameRegionInfo?.code || geoCountryCode || 'ZZ');

    // 检测 tag
    proxy.tag = detectTag(lowerName);

    // groupIndex 来自外部重排
    proxy.index = groupIndex;
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
        const value = part.type === 'text' ? part.value : resolvePlaceholder(proxy, part.value, conn);
        if (part.type === 'placeholder' && part.value === 'exit_is_cn' && value) {
            // The marker attaches to the preceding visible part, without a connector.
            let previous = resultParts.length - 1;
            while (previous >= 0 && !resultParts[previous]?.trim()) previous--;
            if (previous >= 0) resultParts[previous] += value;
            else resultParts.push(value);
        } else {
            resultParts.push(value);
        }
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
    if (placeholder === 'youtube_region') return proxy._googleCheck?.youtube?.region || '';
    if (placeholder === 'youtube_status') return proxy._googleCheck?.youtube?.status || '';
    if (placeholder === 'terms_region') return proxy._googleCheck?.terms?.region || '';
    if (placeholder === 'udp_status') return proxy._capabilityCheck?.udp?.status || '';
    if (placeholder === 'http_status') return proxy._capabilityCheck?.http?.status || '';
    if (placeholder === 'gpt_status') return proxy._capabilityCheck?.gpt?.status || '';
    if (placeholder === 'entrance_region') return proxy._entrance?.countryCode || '';
    if (placeholder === 'entrance_isp') return proxy._entrance?.isp || '';
    if (placeholder === 'http_latency') {
        const latency = proxy._capabilityCheck?.http?.averageLatencyMs;
        return latency == null ? '' : String(latency);
    }
    if (placeholder === 'http_failure_rate') {
        const rate = proxy._capabilityCheck?.http?.failureRate;
        return rate == null ? '' : String(rate);
    }
    if (placeholder === 'exit_is_cn' || placeholder === 'region*') {
        const check = proxy._googleCheck;
        const marker = (check?.[check?.source || 'youtube']?.status === 'cn') ? '*' : '';
        return placeholder === 'region*' ? `${proxy.region_code || ''}${marker}` : marker;
    }

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

    // {prefix:XXX} - 固定前缀占位符，参与 connector 智能拼接（不作为静态文本）
    if (placeholder.startsWith('prefix:')) {
        return placeholder.substring(7);
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
    const counts = new Map();
    proxies.forEach(p => {
        const key = p.region_code || 'ZZ';
        const next = (counts.get(key) || 0) + 1;
        counts.set(key, next);
        p.index = next;
    });

    return proxies;
}

// ============================================================
// 工具函数
// ============================================================
// 从节点名称识别 region 的结果只由 name 本身决定，且同一订阅的节点名跨刷新基本不变，
// 按 name 持久化缓存后可将命中前的线性扫描（263 个候选 x 多个关键字）降为一次 Map 查找。
const NAME_REGION_CACHE = new Map();
const NAME_REGION_CACHE_LIMIT = 10000;
const NAME_REGION_PERSIST_KEY = 'parser:name_region:v1';
const NAME_REGION_PERSIST_TTL = 30 * 24 * 60 * 60 * 1000; // 30 天
let nameRegionCacheDirty = false;
let nameRegionPersistLoaded = false;

function loadNameRegionPersistCache() {
    if (nameRegionPersistLoaded) return;
    nameRegionPersistLoaded = true;
    const persistentCache = typeof scriptResourceCache !== 'undefined' ? scriptResourceCache : null;
    if (!persistentCache) return;
    const cached = persistentCache.get(NAME_REGION_PERSIST_KEY);
    if (cached && typeof cached === 'object') {
        for (const [k, v] of Object.entries(cached)) {
            NAME_REGION_CACHE.set(k, v);
        }
        trimNameRegionCache();
    }
}

function trimNameRegionCache() {
    while (NAME_REGION_CACHE.size > NAME_REGION_CACHE_LIMIT) {
        NAME_REGION_CACHE.delete(NAME_REGION_CACHE.keys().next().value);
        nameRegionCacheDirty = true;
    }
}

// operator() 主流程结束前调用一次，把本次新识别的 name->region 写回持久化缓存
function persistNameRegionCache() {
    if (!nameRegionCacheDirty) return;
    const persistentCache = typeof scriptResourceCache !== 'undefined' ? scriptResourceCache : null;
    if (!persistentCache) return;
    persistentCache.set(NAME_REGION_PERSIST_KEY, Object.fromEntries(NAME_REGION_CACHE), NAME_REGION_PERSIST_TTL);
    nameRegionCacheDirty = false;
}

// 从节点名称识别 region
function detectRegionFromName(name) {
    loadNameRegionPersistCache();
    const cacheKey = String(name || '').toLowerCase();
    if (NAME_REGION_CACHE.has(cacheKey)) {
        return NAME_REGION_CACHE.get(cacheKey);
    }

    const result = detectRegionFromNameUncached(name);
    NAME_REGION_CACHE.set(cacheKey, result);
    trimNameRegionCache();
    nameRegionCacheDirty = true;
    return result;
}

function detectRegionFromNameUncached(name) {
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

// region_flag/region_name/region_name_cn 只由 code 决定，按 code 缓存避免同批节点里
// 重复 region（如多个 SG 节点）反复调用 getRegionDisplayName
const REGION_METADATA_CACHE = new Map();
function setRegionMetadata(proxy, code) {
    if (!/^[A-Z]{2}$/.test(code || '') || code === 'ZZ') {
        proxy.region_code = 'ZZ';
        proxy.region_flag = '';
        proxy.region_name = 'Unknown';
        proxy.region_name_cn = '未知';
        return;
    }

    let meta = REGION_METADATA_CACHE.get(code);
    if (!meta) {
        meta = {
            region_flag: getRegionFlag(code),
            region_name: getRegionDisplayName(code, 'en') || code,
            region_name_cn: getRegionDisplayName(code, 'zh-CN') || '未知',
        };
        REGION_METADATA_CACHE.set(code, meta);
    }
    proxy.region_code = code;
    proxy.region_flag = meta.region_flag;
    proxy.region_name = meta.region_name;
    proxy.region_name_cn = meta.region_name_cn;
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

    // 跨调用持久化缓存：模块级变量在每次脚本调用间不会保留，
    // 命中时可跳过 676 个候选代码 x 最多 3 次 Intl.DisplayNames.of() 的重建开销。
    const persistentCache = typeof scriptResourceCache !== 'undefined' ? scriptResourceCache : null;
    if (persistentCache) {
        const cached = persistentCache.get(REGION_HINTS_CACHE_KEY);
        if (Array.isArray(cached) && cached.length > 0) {
            REGION_NAME_HINTS = cached;
            return REGION_NAME_HINTS;
        }
    }

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
    if (persistentCache) {
        persistentCache.set(REGION_HINTS_CACHE_KEY, hints, REGION_HINTS_CACHE_TTL);
    }
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

// 解析环境变量式参数: "{A:1}{B:2}" 或 "{A:1,B:2}" -> { A: "1", B: "2" }
function parseEnvMap(raw) {
    const map = {};
    if (!raw) return map;
    const regex = /\{([^}]+)\}/g;
    let match;
    while ((match = regex.exec(String(raw))) !== null) {
        const entries = match[1].split(',');
        for (const entry of entries) {
            const colon = entry.indexOf(':');
            if (colon === -1) continue;
            const key = entry.substring(0, colon).trim();
            const value = entry.substring(colon + 1).trim();
            if (key) map[key] = value;
        }
    }
    return map;
}

function normalizeGeoApiBody(body) {
    let geoData;
    try {
        geoData = JSON.parse(String(body));
    } catch (_) {
        geoData = { country: String(body || '').trim(), isp: '', countryCode: 'ZZ' };
    }

    // ipinfo.io Lite
    if (geoData.country_code && !geoData.countryCode) {
        geoData.countryCode = geoData.country_code;
    }
    if (geoData.as_name && !geoData.isp) {
        geoData.isp = geoData.as_name;
    }
    if (geoData.countryCode) {
        geoData.countryCode = String(geoData.countryCode).toUpperCase();
    }
    return geoData;
}

function isIpAddress(value) {
    const text = String(value || '').trim();
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(text)) {
        return text.split('.').every(part => {
            const n = Number(part);
            return Number.isInteger(n) && n >= 0 && n <= 255;
        });
    }
    return /^[0-9a-f:]+$/i.test(text) && text.includes(':');
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
    const reqRetries = parseNonNegativeInt(opt.retries ?? $arguments.probe_retries, 1);
    const reqRetryDelay = parsePositiveNumber(opt.retry_delay ?? $arguments.probe_retry_delay, 1000);

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
