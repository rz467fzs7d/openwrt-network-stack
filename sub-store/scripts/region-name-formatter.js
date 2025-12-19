/**
 * Region 名称格式化脚本
 *
 * 功能：
 * - 从节点名称中识别地区信息（支持 emoji、中文、英文）
 * - 自动设置标准化的 code 和 region 属性（用于 Mihomo 筛选）
 * - 识别 IPLC 标识和运营商标识
 * - 支持自定义节点名称格式化
 * - 无需网络请求，瞬时完成
 *
 * 性能：处理 100 个节点 < 0.1 秒
 *
 * 使用方法：
 * 在 Sub Store 的订阅操作器中添加此脚本
 *
 * 参数：
 * - format: 节点名称格式模板（可选）
 *   - 不设置：保留原名称，仅去除 emoji 和地区关键词
 *   - 支持占位符：{countryFlag} {countryCode} {countryNameCN} {countryName} {ispCode} {iplc} {otherTags} {index} {original}
 *   - 示例："{countryName} {iplc} {ispCode} {index}" -> "Hong Kong IPLC ATT 1"
 *   - 示例："{countryName}{ispCode}{index:02d}" -> "Hong Kong ATT01"
 *   - 示例："{countryName} {ispCode} {otherTags}" -> "Malaysia TMNET Home"
 *   - 示例："{countryName} {iplc} {index:2d} {ispCode} {otherTags}" -> "Singapore IPLC 01 Home IPLC"
 *   - otherTags 说明：自动识别并格式化额外标签（家宽、IPLC、BGP、CN2、5G、企业等），使用 connector 连接
 * - connector: 连接符（可选，默认为空格）
 *   - 示例：connector = '' -> "HongKongIPLCATT1"
 */

const $ = $substore;

const { format = null, connector = ' ' } = $arguments;

// 运营商映射表
const ISP_MAP = {
    'ATT': { keywords: ['att', 'at&t'], code: 'ATT' },
    'Sonet': { keywords: ['sonet'], code: 'SONET' },
    'Hinet': { keywords: ['hinet'], code: 'HINET' },
    'NTT': { keywords: ['ntt'], code: 'NTT' },
    'Softbank': { keywords: ['softbank'], code: 'SOFTBANK' },
    'KT': { keywords: ['kt'], code: 'KT' },
    'SK': { keywords: ['sk'], code: 'SK' },
    'Singtel': { keywords: ['singtel'], code: 'SINGTEL' },
    'Starhub': { keywords: ['starhub'], code: 'STARHUB' },
    'CMCC': { keywords: ['cmcc', '中国移动'], code: 'CMCC' },
    'CU': { keywords: ['cu', '中国联通'], code: 'CU' },
    'CT': { keywords: ['ct', '中国电信'], code: 'CT' },
    'TMNet': { keywords: ['tmnet'], code: 'TMNET' },
};

// 其他标签映射表（用于提取和格式化额外信息）
// 格式: '标签名': { keywords: ['关键词1', '关键词2'], output: '输出名称' }
// 说明: keywords 支持中文和英文，output 是最终显示的名称
// 使用: 在 format 中使用 {otherTags} 占位符，会自动提取并用 connector 连接
const OTHER_TAGS_MAP = {
    '家宽': { keywords: ['家宽', 'home', 'home broadband', 'broadband'], output: 'Home' },
    'IPLC': { keywords: ['iplc', '专线'], output: 'IPLC' },
    'BGP': { keywords: ['bgp', 'bgp线路'], output: 'BGP' },
    'CN2': { keywords: ['cn2', 'cn2gia', 'cn2-gia'], output: 'CN2' },
    '5G': { keywords: ['5g', '5g网络'], output: '5G' },
    '企业': { keywords: ['企业', 'enterprise', 'biz'], output: 'Enterprise' },
    '家': { keywords: ['家'], output: 'Home' },
};

// 地区信息映射表（优先级从上到下）
const REGION_MAP = {
    'HK': {
        keywords: ['🇭🇰', '香港', 'hong kong', 'hongkong', 'hk'],
        flag: '🇭🇰',
        code: 'HK',
        name_cn: '香港',
        name_en: 'Hong Kong',
        name: 'Hong Kong'
    },
    'TW': {
        keywords: ['🇹🇼', '🏝️', '台湾', 'taiwan', 'tw'],
        flag: '🇹🇼',
        code: 'TW',
        name_cn: '台湾',
        name_en: 'Taiwan',
        name: 'Taiwan'
    },
    'JP': {
        keywords: ['🇯🇵', '日本', 'japan', 'jp', 'tokyo', '东京', 'osaka', '大阪'],
        flag: '🇯🇵',
        code: 'JP',
        name_cn: '日本',
        name_en: 'Japan',
        name: 'Japan'
    },
    'US': {
        keywords: ['🇺🇸', '美国', 'united states', 'america', 'us', 'usa', 'seattle', 'los angeles'],
        flag: '🇺🇸',
        code: 'US',
        name_cn: '美国',
        name_en: 'United States',
        name: 'United States'
    },
    'SG': {
        keywords: ['🇸🇬', '新加坡', 'singapore', 'sg'],
        flag: '🇸🇬',
        code: 'SG',
        name_cn: '新加坡',
        name_en: 'Singapore',
        name: 'Singapore'
    },
    'KR': {
        keywords: ['🇰🇷', '韩国', '南韩', 'korea', 'kr', 'seoul', '首尔'],
        flag: '🇰🇷',
        code: 'KR',
        name_cn: '韩国',
        name_en: 'Korea',
        name: 'Korea'
    },
    'UK': {
        keywords: ['🇬🇧', '英国', 'united kingdom', 'uk', 'gb', 'britain', 'london', '伦敦'],
        flag: '🇬🇧',
        code: 'UK',
        name_cn: '英国',
        name_en: 'United Kingdom',
        name: 'United Kingdom'
    },
    'DE': {
        keywords: ['🇩🇪', '德国', 'germany', 'de', 'frankfurt', '法兰克福'],
        flag: '🇩🇪',
        code: 'DE',
        name_cn: '德国',
        name_en: 'Germany',
        name: 'Germany'
    },
    'FR': {
        keywords: ['🇫🇷', '法国', 'france', 'fr', 'paris', '巴黎'],
        flag: '🇫🇷',
        code: 'FR',
        name_cn: '法国',
        name_en: 'France',
        name: 'France'
    },
    'CA': {
        keywords: ['🇨🇦', '加拿大', 'canada', 'ca', 'toronto', 'vancouver'],
        flag: '🇨🇦',
        code: 'CA',
        name_cn: '加拿大',
        name_en: 'Canada',
        name: 'Canada'
    },
    'AU': {
        keywords: ['🇦🇺', '澳大利亚', '澳洲', 'australia', 'au', 'sydney', '悉尼'],
        flag: '🇦🇺',
        code: 'AU',
        name_cn: '澳大利亚',
        name_en: 'Australia',
        name: 'Australia'
    },
    'NL': {
        keywords: ['🇳🇱', '荷兰', 'netherlands', 'nl', 'amsterdam', '阿姆斯特丹'],
        flag: '🇳🇱',
        code: 'NL',
        name_cn: '荷兰',
        name_en: 'Netherlands',
        name: 'Netherlands'
    },
    'IN': {
        keywords: ['🇮🇳', '印度', 'india', 'in', 'mumbai', 'delhi'],
        flag: '🇮🇳',
        code: 'IN',
        name_cn: '印度',
        name_en: 'India',
        name: 'India'
    },
    'RU': {
        keywords: ['🇷🇺', '俄罗斯', 'russia', 'ru', 'moscow', '莫斯科'],
        flag: '🇷🇺',
        code: 'RU',
        name_cn: '俄罗斯',
        name_en: 'Russia',
        name: 'Russia'
    },
    'BR': {
        keywords: ['🇧🇷', '巴西', 'brazil', 'br'],
        flag: '🇧🇷',
        code: 'BR',
        name_cn: '巴西',
        name_en: 'Brazil',
        name: 'Brazil'
    },
    'IT': {
        keywords: ['🇮🇹', '意大利', 'italy', 'it', 'rome', '罗马'],
        flag: '🇮🇹',
        code: 'IT',
        name_cn: '意大利',
        name_en: 'Italy',
        name: 'Italy'
    },
    'ES': {
        keywords: ['🇪🇸', '西班牙', 'spain', 'es', 'madrid', '马德里'],
        flag: '🇪🇸',
        code: 'ES',
        name_cn: '西班牙',
        name_en: 'Spain',
        name: 'Spain'
    },
    'SE': {
        keywords: ['🇸🇪', '瑞典', 'sweden', 'se', 'stockholm', '斯德哥尔摩'],
        flag: '🇸🇪',
        code: 'SE',
        name_cn: '瑞典',
        name_en: 'Sweden',
        name: 'Sweden'
    },
    'CH': {
        keywords: ['🇨🇭', '瑞士', 'switzerland', 'ch', 'zurich', '苏黎世'],
        flag: '🇨🇭',
        code: 'CH',
        name_cn: '瑞士',
        name_en: 'Switzerland',
        name: 'Switzerland'
    },
    'NO': {
        keywords: ['🇳🇴', '挪威', 'norway', 'no', 'oslo', '奥斯陆'],
        flag: '🇳🇴',
        code: 'NO',
        name_cn: '挪威',
        name_en: 'Norway',
        name: 'Norway'
    },
    'FI': {
        keywords: ['🇫🇮', '芬兰', 'finland', 'fi', 'helsinki', '赫尔辛基'],
        flag: '🇫🇮',
        code: 'FI',
        name_cn: '芬兰',
        name_en: 'Finland',
        name: 'Finland'
    },
    'DK': {
        keywords: ['🇩🇰', '丹麦', 'denmark', 'dk', 'copenhagen', '哥本哈根'],
        flag: '🇩🇰',
        code: 'DK',
        name_cn: '丹麦',
        name_en: 'Denmark',
        name: 'Denmark'
    },
    'PL': {
        keywords: ['🇵🇱', '波兰', 'poland', 'pl', 'warsaw', '华沙'],
        flag: '🇵🇱',
        code: 'PL',
        name_cn: '波兰',
        name_en: 'Poland',
        name: 'Poland'
    },
    'AT': {
        keywords: ['🇦🇹', '奥地利', 'austria', 'at', 'vienna', '维也纳'],
        flag: '🇦🇹',
        code: 'AT',
        name_cn: '奥地利',
        name_en: 'Austria',
        name: 'Austria'
    },
    'BE': {
        keywords: ['🇧🇪', '比利时', 'belgium', 'be', 'brussels', '布鲁塞尔'],
        flag: '🇧🇪',
        code: 'BE',
        name_cn: '比利时',
        name_en: 'Belgium',
        name: 'Belgium'
    },
    'CZ': {
        keywords: ['🇨🇿', '捷克', 'czech', 'cz', 'prague', '布拉格'],
        flag: '🇨🇿',
        code: 'CZ',
        name_cn: '捷克',
        name_en: 'Czech',
        name: 'Czech'
    },
    'PT': {
        keywords: ['🇵🇹', '葡萄牙', 'portugal', 'pt', 'lisbon', '里斯本'],
        flag: '🇵🇹',
        code: 'PT',
        name_cn: '葡萄牙',
        name_en: 'Portugal',
        name: 'Portugal'
    },
    'GR': {
        keywords: ['🇬🇷', '希腊', 'greece', 'gr', 'athens', '雅典'],
        flag: '🇬🇷',
        code: 'GR',
        name_cn: '希腊',
        name_en: 'Greece',
        name: 'Greece'
    },
    'HU': {
        keywords: ['🇭🇺', '匈牙利', 'hungary', 'hu', 'budapest', '布达佩斯'],
        flag: '🇭🇺',
        code: 'HU',
        name_cn: '匈牙利',
        name_en: 'Hungary',
        name: 'Hungary'
    },
    'IE': {
        keywords: ['🇮🇪', '爱尔兰', 'ireland', 'ie', 'dublin', '都柏林'],
        flag: '🇮🇪',
        code: 'IE',
        name_cn: '爱尔兰',
        name_en: 'Ireland',
        name: 'Ireland'
    },
    'NZ': {
        keywords: ['🇳🇿', '新西兰', 'new zealand', 'nz', 'auckland', '奥克兰'],
        flag: '🇳🇿',
        code: 'NZ',
        name_cn: '新西兰',
        name_en: 'New Zealand',
        name: 'New Zealand'
    },
    'ZA': {
        keywords: ['🇿🇦', '南非', 'south africa', 'za'],
        flag: '🇿🇦',
        code: 'ZA',
        name_cn: '南非',
        name_en: 'South Africa',
        name: 'South Africa'
    },
    'TR': {
        keywords: ['🇹🇷', '土耳其', 'turkey', 'tr', 'istanbul', '伊斯坦布尔'],
        flag: '🇹🇷',
        code: 'TR',
        name_cn: '土耳其',
        name_en: 'Turkey',
        name: 'Turkey'
    },
    'MX': {
        keywords: ['🇲🇽', '墨西哥', 'mexico', 'mx'],
        flag: '🇲🇽',
        code: 'MX',
        name_cn: '墨西哥',
        name_en: 'Mexico',
        name: 'Mexico'
    },
    'AR': {
        keywords: ['🇦🇷', '阿根廷', 'argentina', 'ar'],
        flag: '🇦🇷',
        code: 'AR',
        name_cn: '阿根廷',
        name_en: 'Argentina',
        name: 'Argentina'
    },
    'CL': {
        keywords: ['🇨🇱', '智利', 'chile', 'cl'],
        flag: '🇨🇱',
        code: 'CL',
        name_cn: '智利',
        name_en: 'Chile',
        name: 'Chile'
    },
    'TH': {
        keywords: ['🇹🇭', '泰国', 'thailand', 'th', 'bangkok', '曼谷'],
        flag: '🇹🇭',
        code: 'TH',
        name_cn: '泰国',
        name_en: 'Thailand',
        name: 'Thailand'
    },
    'MY': {
        keywords: ['🇲🇾', '马来西亚', 'malaysia', 'my'],
        flag: '🇲🇾',
        code: 'MY',
        name_cn: '马来西亚',
        name_en: 'Malaysia',
        name: 'Malaysia'
    },
    'ID': {
        keywords: ['🇮🇩', '印度尼西亚', '印尼', 'indonesia', 'id', 'jakarta', '雅加达'],
        flag: '🇮🇩',
        code: 'ID',
        name_cn: '印度尼西亚',
        name_en: 'Indonesia',
        name: 'Indonesia'
    },
    'PH': {
        keywords: ['🇵🇭', '菲律宾', 'philippines', 'ph', 'manila', '马尼拉'],
        flag: '🇵🇭',
        code: 'PH',
        name_cn: '菲律宾',
        name_en: 'Philippines',
        name: 'Philippines'
    },
    'VN': {
        keywords: ['🇻🇳', '越南', 'vietnam', 'vn', 'hanoi', '河内'],
        flag: '🇻🇳',
        code: 'VN',
        name_cn: '越南',
        name_en: 'Vietnam',
        name: 'Vietnam'
    },
};

function operator(proxies) {
    let matchedCount = 0;
    let unmatchedCount = 0;
    const regionCounters = {}; // 按地区计数

    proxies.forEach(proxy => {
        const originalName = proxy.name || '';
        const lowerName = originalName.toLowerCase();

        // 匹配地区
        let matched = false;
        let regionInfo = null;

        for (const [key, info] of Object.entries(REGION_MAP)) {
            for (const keyword of info.keywords) {
                if (matchKeyword(lowerName, keyword)) {
                    regionInfo = info;
                    matched = true;
                    matchedCount++;
                    break;
                }
            }
            if (matched) break;
        }

        if (!matched) {
            unmatchedCount++;
            $.warn(`未能识别地区: ${originalName}`);
            return;
        }

        // 识别 IPLC
        let hasIPLC = /iplc/i.test(lowerName);

        // 识别运营商
        let ispInfo = null;
        for (const [isp, info] of Object.entries(ISP_MAP)) {
            for (const keyword of info.keywords) {
                if (matchKeyword(lowerName, keyword)) {
                    ispInfo = info;
                    break;
                }
            }
            if (ispInfo) break;
        }

        // 识别其他标签（从原始名称中提取，但排除地区关键词）
        const otherTags = extractOtherTags(lowerName);

        // 设置 region 和 code 属性（始终设置）
        if (regionInfo) {
            proxy.code = regionInfo.code;
            proxy.region = regionInfo.name_en;

            // 地区计数（从 1 开始）
            if (!regionCounters[regionInfo.code]) {
                regionCounters[regionInfo.code] = 0;
            }
            regionCounters[regionInfo.code]++;
            const index = regionCounters[regionInfo.code];

            // 格式化节点名称
            if (format) {
                // 获取原始名称（去除地区相关信息）
                let cleanName = removeRegionInfo(originalName, regionInfo);

                // 替换模板占位符（使用两层命名）
                let formattedName = format
                    .replace(/{countryFlag}/g, regionInfo.flag)
                    .replace(/{countryCode}/g, regionInfo.code)
                    .replace(/{countryNameCN}/g, regionInfo.name_cn)
                    .replace(/{countryName}/g, regionInfo.name_en)
                    .replace(/{index(?::0?(\d+)d)?}/g, (match, width) => {
                        // 支持 {index} 或 {index:02d} 格式
                        if (width) {
                            return String(index).padStart(parseInt(width), '0');
                        }
                        return index;
                    })
                    .replace(/{iplc}/g, hasIPLC ? 'IPLC' : '')
                    .replace(/{ispCode}/g, ispInfo ? ispInfo.code : '')
                    .replace(/{otherTags}/g, otherTags.join(connector))
                    .replace(/{original}/g, cleanName.trim());

                // 使用 connector 连接各部分，并清理多余空格
                formattedName = formattedName
                    .replace(/\s+/g, ' ')
                    .trim()
                    .replace(/\s+/g, connector);

                proxy.name = formattedName;
            } else {
                // 默认行为：移除 emoji 和地区关键词
                proxy.name = removeRegionInfo(originalName, regionInfo);
            }
        }
    });

    $.info(`地区格式化完成: 成功 ${matchedCount} 个, 未匹配 ${unmatchedCount} 个`);
    return proxies;
}

/**
 * 智能匹配关键词（避免误匹配）
 * @param {string} text - 要匹配的文本（小写）
 * @param {string} keyword - 关键词
 * @returns {boolean} 是否匹配
 */
function matchKeyword(text, keyword) {
    const keywordLower = keyword.toLowerCase();

    // 1. emoji 直接匹配
    if (keyword.match(/[\uD83C-\uDBFF]/)) {
        return text.includes(keyword);
    }

    // 2. 中文关键词直接匹配
    if (keyword.match(/[\u4e00-\u9fa5]/)) {
        return text.includes(keywordLower);
    }

    // 3. 短英文关键词（2-3字符）使用词边界匹配
    if (keywordLower.length <= 3) {
        const regex = new RegExp(`\\\b${escapeRegex(keywordLower)}\\\b`, 'i');
        return regex.test(text);
    }

    // 4. 较长的英文关键词使用普通匹配
    return text.includes(keywordLower);
}

/**
 * 从节点名称中提取其他标签
 * @param {string} text - 节点名称（小写）
 * @returns {string[]} 标签输出名称列表
 */
function extractOtherTags(text) {
    const tags = [];
    const usedKeywords = new Set(); // 防止重复匹配

    for (const [tagKey, tagInfo] of Object.entries(OTHER_TAGS_MAP)) {
        for (const keyword of tagInfo.keywords) {
            const keywordLower = keyword.toLowerCase();

            // 跳过已使用的关键词
            if (usedKeywords.has(keywordLower)) continue;

            let matched = false;

            if (keyword.match(/[\u4e00-\u9fa5]/)) {
                // 中文关键词：需要精确匹配，避免误伤
                // 使用更灵活的模式：允许前后有空格、标点、或直接接英文/数字/中文
                const patterns = [
                    new RegExp(`\\s${escapeRegex(keywordLower)}(?=\\s|$|-|[A-Za-z0-9])`, 'gi'),
                    new RegExp(`^${escapeRegex(keywordLower)}(?=\\s|$|-|[A-Za-z0-9])`, 'gi'),
                    new RegExp(`[A-Za-z0-9]${escapeRegex(keywordLower)}(?=\\s|$|-|[A-Za-z0-9])`, 'gi'),
                    new RegExp(`[\\u4e00-\\u9fa5]${escapeRegex(keywordLower)}(?=\\s|$|-|[A-Za-z0-9])`, 'gi')
                ];

                for (const pattern of patterns) {
                    if (pattern.test(text)) {
                        matched = true;
                        break;
                    }
                }
            } else if (keywordLower.length <= 3) {
                // 短英文关键词：严格词边界
                const regex = new RegExp(`\\b${escapeRegex(keywordLower)}\\b`, 'gi');
                matched = regex.test(text);
            } else {
                // 长英文关键词：词边界或前后空格
                const regex = new RegExp(`(?:^|\\s)${escapeRegex(keywordLower)}(?:\\s|$|-)|\\b${escapeRegex(keywordLower)}\\b`, 'gi');
                matched = regex.test(text);
            }

            if (matched) {
                tags.push(tagInfo.output);
                // 标记该标签的所有关键词为已使用
                tagInfo.keywords.forEach(k => usedKeywords.add(k.toLowerCase()));
                break; // 一个标签只添加一次
            }
        }
    }

    return tags;
}

/**
 * 移除节点名称中的地区相关信息（emoji、关键词等）
 * 智能保留 IPLC、运营商等有用信息
 */
function removeRegionInfo(str, regionInfo) {
    let result = str;

    // 移除 emoji flag
    result = result.replace(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/g, '');

    // 移除其他常见 emoji
    result = result.replace(/[\uD83D-\uDBFF][\uDC00-\uDFFF]/g, '');
    result = result.replace(/🏝️/g, '');

    // 移除节点类型前缀（ss、vmess、trojan等）
    result = result.replace(/^(ss|vmess|trojan|hysteria|vless|ssr|v2ray)\s*/gi, '');

    if (regionInfo) {
        // 按长度排序，优先匹配长关键词（避免短词误匹配）
        const sortedKeywords = [...regionInfo.keywords]
            .filter(k => !k.match(/[\uD83C][\uDDE6-\uDDFF]/)) // 过滤掉emoji
            .sort((a, b) => b.length - a.length);

        for (const keyword of sortedKeywords) {
            const keywordLower = keyword.toLowerCase();

            // 根据关键词类型选择匹配策略
            if (keyword.match(/[\u4e00-\u9fa5]/)) {
                // 中文关键词：支持空格+关键词+空格/结束/标点/英文，或者开头+关键词+空格/结束/标点/英文
                const patterns = [
                    new RegExp(`\s${escapeRegex(keywordLower)}(?=\s|$|-|家宽|家|宽|[A-Za-z])`, 'gi'),
                    new RegExp(`^${escapeRegex(keywordLower)}(?=\s|$|-|家宽|家|宽|[A-Za-z])`, 'gi')
                ];

                for (const pattern of patterns) {
                    if (pattern.test(result)) {
                        result = result.replace(pattern, (match) => {
                            // 保留空格，不保留开头匹配
                            return match.startsWith(' ') ? ' ' : '';
                        });
                        break;
                    }
                }

            } else if (keyword.length <= 3) {
                // 短英文关键词：严格词边界
                const regex = new RegExp(`\b${escapeRegex(keywordLower)}\b`, 'gi');
                result = result.replace(regex, '');

            } else {
                // 长英文关键词：词边界或前后空格，保留空格
                const regex = new RegExp(`(?:^|\s)${escapeRegex(keywordLower)}(?:\s|$|-)|\b${escapeRegex(keywordLower)}\b`, 'gi');
                result = result.replace(regex, (match) => {
                    // 如果匹配到的是空格+关键词+空格/结束，保留一个空格
                    // 如果匹配到的是单独的词边界，直接移除
                    if (match.startsWith(' ') && (match.endsWith(' ') || match.endsWith('-') || match.length === keywordLower.length + 1)) {
                        return ' ';
                    }
                    return '';
                });
            }
        }
    }

    // 移除括号内容（如 (UDPN)、(专线) 等）
    result = result.replace(/\\([^)]*\\)/g, '');

    // 清理多余空格和特殊字符
    result = result.replace(/^[\s\\-_|]+|[\s\\-_|]+$/g, '');
    result = result.replace(/\s+/g, ' ');

    return result.trim();
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\\\\\\\\]\\\\\\\\\\\\\\\\]/g, '\\\\\\\\$&');
}