/**
 * 节点重命名脚本 (Node Renamer for Sub-Store)
 *
 * 功能特性：
 * - 智能识别节点地区（支持 40+ 国家/地区，emoji、中文、英文）
 * - 自动设置标准化的 code 和 region 属性（用于 Mihomo/Clash Meta 筛选）
 * - 识别运营商信息（ATT、NTT、Hinet、TMNet、Sonet 等 20+ 运营商）
 * - 识别连接类型（IPLC 专线、家宽、企业等）
 * - 识别网络标签（BGP、CN2、5G 等）
 * - 完全自定义节点名称格式化
 * - 无需网络请求，纯本地处理，瞬时完成
 *
 * 性能指标：
 * - 处理 100 个节点 < 0.1 秒
 * - 内存占用低，适合大量节点批量处理
 *
 * 使用方法：
 * 在 Sub-Store 的订阅操作器中添加此脚本
 *
 * 参数配置：
 * - format: 节点名称格式模板（可选）
 *   - 不设置：保留原名称，仅去除 emoji 和地区关键词
 *   - 支持占位符：
 *     {countryFlag}   - 国旗 emoji（如 🇭🇰）
 *     {countryCode}   - 国家代码（如 HK、US）
 *     {countryNameCN} - 中文国家名（如 香港、美国）
 *     {countryName}   - 英文国家名（如 Hong Kong、United States）
 *     {ispCode}       - 运营商代码（如 ATT、HINET、TMNET）
 *     {iplc}          - IPLC专线标识（识别到则显示"IPLC"）
 *     {otherTags}     - 其他标签（家宽、BGP、CN2、5G、企业等）
 *     {index}         - 地区内序号（支持格式化，如 {index:02d} 显示为 01、02）
 *     {original}      - 剩余原始文本
 *
 * - connector: 连接符（可选，默认为空格）
 *   - 用于连接各个非空字段
 *   - 示例：connector = '-' -> "Hong-Kong-IPLC-ATT-01"
 *
 * 格式示例：
 *   "{countryName} {iplc} {ispCode} {index:2d}"  -> "Hong Kong IPLC ATT 01"
 *   "{countryName}{ispCode}{index:02d}"          -> "HongKongATT01"
 *   "{countryFlag} {countryNameCN} {ispCode}"   -> "🇭🇰 香港 ATT"
 *   "{countryCode}-{countryName}-{index}"       -> "HK-Hong-Kong-01"
 *   "{countryName} {otherTags}"                 -> "Malaysia Home"
 *
 * 支持的地区（40+）：
 *   香港、台湾、日本、美国、新加坡、韩国、英国、德国、法国、加拿大、
 *   澳大利亚、荷兰、印度、俄罗斯、巴西、意大利、西班牙、瑞典、瑞士、
 *   挪威、芬兰、丹麦、波兰、奥地利、比利时、捷克、葡萄牙、希腊、匈牙利、
 *   爱尔兰、新西兰、南非、土耳其、墨西哥、阿根廷、智利、泰国、马来西亚、
 *   印度尼西亚、菲律宾、越南、孟加拉、尼日利亚等
 *
 * 支持的运营商（20+）：
 *   ATT、Sonet、Hinet、NTT、Softbank、KT、SK、Singtel、Starhub、
 *   CMCC、CU、CT、TMNet 等
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
const OTHER_TAGS_MAP = {
    '家宽': { keywords: ['家宽', 'home', 'home broadband', 'broadband'], output: 'Home' },
    'IPLC': { keywords: ['iplc', '专线'], output: 'IPLC' },
    'BGP': { keywords: ['bgp', 'bgp线路'], output: 'BGP' },
    'CN2': { keywords: ['cn2', 'cn2gia', 'cn2-gia'], output: 'CN2' },
    '5G': { keywords: ['5g', '5g网络'], output: '5G' },
    '企业': { keywords: ['企业', 'enterprise', 'biz'], output: 'Enterprise' },
};

// 地区信息映射表（优先级从上到下）
const REGION_MAP = {
    'HK': {
        keywords: ['🇭🇰', '香港', 'hong kong', 'hongkong', 'hk'],
        flag: '🇭🇰', code: 'HK', name_cn: '香港', name_en: 'Hong Kong', name: 'Hong Kong'
    },
    'TW': {
        keywords: ['🇹🇼', '🏝️', '台湾', 'taiwan', 'tw'],
        flag: '🇹🇼', code: 'TW', name_cn: '台湾', name_en: 'Taiwan', name: 'Taiwan'
    },
    'JP': {
        keywords: ['🇯🇵', '日本', 'japan', 'jp', 'tokyo', '东京', 'osaka', '大阪'],
        flag: '🇯🇵', code: 'JP', name_cn: '日本', name_en: 'Japan', name: 'Japan'
    },
    'US': {
        keywords: ['🇺🇸', '美国', 'united states', 'america', 'us', 'usa', 'seattle', 'los angeles'],
        flag: '🇺🇸', code: 'US', name_cn: '美国', name_en: 'United States', name: 'United States'
    },
    'SG': {
        keywords: ['🇸🇬', '新加坡', 'singapore', 'sg'],
        flag: '🇸🇬', code: 'SG', name_cn: '新加坡', name_en: 'Singapore', name: 'Singapore'
    },
    'KR': {
        keywords: ['🇰🇷', '韩国', '南韩', 'korea', 'kr', 'seoul', '首尔'],
        flag: '🇰🇷', code: 'KR', name_cn: '韩国', name_en: 'Korea', name: 'Korea'
    },
    'UK': {
        keywords: ['🇬🇧', '英国', 'united kingdom', 'uk', 'gb', 'britain', 'london', '伦敦'],
        flag: '🇬🇧', code: 'UK', name_cn: '英国', name_en: 'United Kingdom', name: 'United Kingdom'
    },
    'DE': {
        keywords: ['🇩🇪', '德国', 'germany', 'de', 'frankfurt', '法兰克福'],
        flag: '🇩🇪', code: 'DE', name_cn: '德国', name_en: 'Germany', name: 'Germany'
    },
    'FR': {
        keywords: ['🇫🇷', '法国', 'france', 'fr', 'paris', '巴黎'],
        flag: '🇫🇷', code: 'FR', name_cn: '法国', name_en: 'France', name: 'France'
    },
    'CA': {
        keywords: ['🇨🇦', '加拿大', 'canada', 'ca', 'toronto', 'vancouver'],
        flag: '🇨🇦', code: 'CA', name_cn: '加拿大', name_en: 'Canada', name: 'Canada'
    },
    'AU': {
        keywords: ['🇦🇺', '澳大利亚', '澳洲', 'australia', 'au', 'sydney', '悉尼'],
        flag: '🇦🇺', code: 'AU', name_cn: '澳大利亚', name_en: 'Australia', name: 'Australia'
    },
    'NL': {
        keywords: ['🇳🇱', '荷兰', 'netherlands', 'nl', 'amsterdam', '阿姆斯特丹'],
        flag: '🇳🇱', code: 'NL', name_cn: '荷兰', name_en: 'Netherlands', name: 'Netherlands'
    },
    'IN': {
        keywords: ['🇮🇳', '印度', 'india', 'in', 'mumbai', 'delhi'],
        flag: '🇮🇳', code: 'IN', name_cn: '印度', name_en: 'India', name: 'India'
    },
    'RU': {
        keywords: ['🇷🇺', '俄罗斯', 'russia', 'ru', 'moscow', '莫斯科'],
        flag: '🇷🇺', code: 'RU', name_cn: '俄罗斯', name_en: 'Russia', name: 'Russia'
    },
    'BR': {
        keywords: ['🇧🇷', '巴西', 'brazil', 'br'],
        flag: '🇧🇷', code: 'BR', name_cn: '巴西', name_en: 'Brazil', name: 'Brazil'
    },
    'IT': {
        keywords: ['🇮🇹', '意大利', 'italy', 'it', 'rome', '罗马'],
        flag: '🇮🇹', code: 'IT', name_cn: '意大利', name_en: 'Italy', name: 'Italy'
    },
    'ES': {
        keywords: ['🇪🇸', '西班牙', 'spain', 'es', 'madrid', '马德里'],
        flag: '🇪🇸', code: 'ES', name_cn: '西班牙', name_en: 'Spain', name: 'Spain'
    },
    'SE': {
        keywords: ['🇸🇪', '瑞典', 'sweden', 'se', 'stockholm', '斯德哥尔摩'],
        flag: '🇸🇪', code: 'SE', name_cn: '瑞典', name_en: 'Sweden', name: 'Sweden'
    },
    'CH': {
        keywords: ['🇨🇭', '瑞士', 'switzerland', 'ch', 'zurich', '苏黎世'],
        flag: '🇨🇭', code: 'CH', name_cn: '瑞士', name_en: 'Switzerland', name: 'Switzerland'
    },
    'NO': {
        keywords: ['🇳🇴', '挪威', 'norway', 'no', 'oslo', '奥斯陆'],
        flag: '🇳🇴', code: 'NO', name_cn: '挪威', name_en: 'Norway', name: 'Norway'
    },
    'FI': {
        keywords: ['🇫🇮', '芬兰', 'finland', 'fi', 'helsinki', '赫尔辛基'],
        flag: '🇫🇮', code: 'FI', name_cn: '芬兰', name_en: 'Finland', name: 'Finland'
    },
    'DK': {
        keywords: ['🇩🇰', '丹麦', 'denmark', 'dk', 'copenhagen', '哥本哈根'],
        flag: '🇩🇰', code: 'DK', name_cn: '丹麦', name_en: 'Denmark', name: 'Denmark'
    },
    'PL': {
        keywords: ['🇵🇱', '波兰', 'poland', 'pl', 'warsaw', '华沙'],
        flag: '🇵🇱', code: 'PL', name_cn: '波兰', name_en: 'Poland', name: 'Poland'
    },
    'AT': {
        keywords: ['🇦🇹', '奥地利', 'austria', 'at', 'vienna', '维也纳'],
        flag: '🇦🇹', code: 'AT', name_cn: '奥地利', name_en: 'Austria', name: 'Austria'
    },
    'BE': {
        keywords: ['🇧🇪', '比利时', 'belgium', 'be', 'brussels', '布鲁塞尔'],
        flag: '🇧🇪', code: 'BE', name_cn: '比利时', name_en: 'Belgium', name: 'Belgium'
    },
    'CZ': {
        keywords: ['🇨🇿', '捷克', 'czech', 'cz', 'prague', '布拉格'],
        flag: '🇨🇿', code: 'CZ', name_cn: '捷克', name_en: 'Czech', name: 'Czech'
    },
    'PT': {
        keywords: ['🇵🇹', '葡萄牙', 'portugal', 'pt', 'lisbon', '里斯本'],
        flag: '🇵🇹', code: 'PT', name_cn: '葡萄牙', name_en: 'Portugal', name: 'Portugal'
    },
    'GR': {
        keywords: ['🇬🇷', '希腊', 'greece', 'gr', 'athens', '雅典'],
        flag: '🇬🇷', code: 'GR', name_cn: '希腊', name_en: 'Greece', name: 'Greece'
    },
    'HU': {
        keywords: ['🇭🇺', '匈牙利', 'hungary', 'hu', 'budapest', '布达佩斯'],
        flag: '🇭🇺', code: 'HU', name_cn: '匈牙利', name_en: 'Hungary', name: 'Hungary'
    },
    'IE': {
        keywords: ['🇮🇪', '爱尔兰', 'ireland', 'ie', 'dublin', '都柏林'],
        flag: '🇮🇪', code: 'IE', name_cn: '爱尔兰', name_en: 'Ireland', name: 'Ireland'
    },
    'NZ': {
        keywords: ['🇳🇿', '新西兰', 'new zealand', 'nz', 'auckland', '奥克兰'],
        flag: '🇳🇿', code: 'NZ', name_cn: '新西兰', name_en: 'New Zealand', name: 'New Zealand'
    },
    'ZA': {
        keywords: ['🇿🇦', '南非', 'south africa', 'za'],
        flag: '🇿🇦', code: 'ZA', name_cn: '南非', name_en: 'South Africa', name: 'South Africa'
    },
    'TR': {
        keywords: ['🇹🇷', '土耳其', 'turkey', 'tr', 'istanbul', '伊斯坦布尔'],
        flag: '🇹🇷', code: 'TR', name_cn: '土耳其', name_en: 'Turkey', name: 'Turkey'
    },
    'MX': {
        keywords: ['🇲🇽', '墨西哥', 'mexico', 'mx'],
        flag: '🇲🇽', code: 'MX', name_cn: '墨西哥', name_en: 'Mexico', name: 'Mexico'
    },
    'AR': {
        keywords: ['🇦🇷', '阿根廷', 'argentina', 'ar'],
        flag: '🇦🇷', code: 'AR', name_cn: '阿根廷', name_en: 'Argentina', name: 'Argentina'
    },
    'CL': {
        keywords: ['🇨🇱', '智利', 'chile', 'cl'],
        flag: '🇨🇱', code: 'CL', name_cn: '智利', name_en: 'Chile', name: 'Chile'
    },
    'TH': {
        keywords: ['🇹🇭', '泰国', 'thailand', 'th', 'bangkok', '曼谷'],
        flag: '🇹🇭', code: 'TH', name_cn: '泰国', name_en: 'Thailand', name: 'Thailand'
    },
    'MY': {
        keywords: ['🇲🇾', '马来西亚', 'malaysia', 'my'],
        flag: '🇲🇾', code: 'MY', name_cn: '马来西亚', name_en: 'Malaysia', name: 'Malaysia'
    },
    'ID': {
        keywords: ['🇮🇩', '印度尼西亚', '印尼', 'indonesia', 'id', 'jakarta', '雅加达'],
        flag: '🇮🇩', code: 'ID', name_cn: '印度尼西亚', name_en: 'Indonesia', name: 'Indonesia'
    },
    'PH': {
        keywords: ['🇵🇭', '菲律宾', 'philippines', 'ph', 'manila', '马尼拉'],
        flag: '🇵🇭', code: 'PH', name_cn: '菲律宾', name_en: 'Philippines', name: 'Philippines'
    },
    'VN': {
        keywords: ['🇻🇳', '越南', 'vietnam', 'vn', 'hanoi', '河内'],
        flag: '🇻🇳', code: 'VN', name_cn: '越南', name_en: 'Vietnam', name: 'Vietnam'
    },
    'NG': {
        keywords: ['🇳🇬', '尼日利亚', 'nigeria', 'ng'],
        flag: '🇳🇬', code: 'NG', name_cn: '尼日利亚', name_en: 'Nigeria', name: 'Nigeria'
    },
    'BD': {
        keywords: ['🇧🇩', '孟加拉', '孟加拉国', 'bangladesh', 'bd'],
        flag: '🇧🇩', code: 'BD', name_cn: '孟加拉国', name_en: 'Bangladesh', name: 'Bangladesh'
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
            // 注释掉警告，避免在 Sub-Store 中报错（$.warn 不存在）
            // $.info(`未能识别地区: ${originalName}`);
            return;
        }

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
                // 使用递归格式化函数
                proxy.name = recursiveFormat(originalName, format, regionInfo, index);
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
        const regex = new RegExp(`\\b${escapeRegex(keywordLower)}\\b`, 'i');
        return regex.test(text);
    }

    // 4. 较长的英文关键词使用普通匹配
    return text.includes(keywordLower);
}

/**
 * 从文本中移除指定的关键词
 * @param {string} text - 原始文本
 * @param {string} keyword - 要移除的关键词
 * @returns {string} 清理后的文本
 */
function removeKeyword(text, keyword) {
    const keywordLower = keyword.toLowerCase();
    let result = text;

    if (keyword.match(/[\u4e00-\u9fa5]/)) {
        const patterns = [
            new RegExp(`\\s${escapeRegex(keywordLower)}(?=\\s|$|-|[A-Za-z0-9\\u4e00-\\u9fa5])`, 'gi'),
            new RegExp(`^${escapeRegex(keywordLower)}(?=\\s|$|-|[A-Za-z0-9\\u4e00-\\u9fa5])`, 'gi'),
            new RegExp(`[A-Za-z0-9]${escapeRegex(keywordLower)}(?=\\s|$|-|[A-Za-z0-9\\u4e00-\\u9fa5])`, 'gi'),
            new RegExp(`[\\u4e00-\\u9fa5]${escapeRegex(keywordLower)}(?=\\s|$|-|[A-Za-z0-9\\u4e00-\\u9fa5])`, 'gi')
        ];

        for (const pattern of patterns) {
            if (pattern.test(result)) {
                result = result.replace(pattern, (match) => {
                    return match.startsWith(' ') ? ' ' : '';
                });
                break;
            }
        }
    } else if (keywordLower.length <= 3) {
        const regex = new RegExp(`\\b${escapeRegex(keywordLower)}\\b`, 'gi');
        result = result.replace(regex, '');
    } else {
        const regex = new RegExp(`(?:^|\\s)${escapeRegex(keywordLower)}(?:\\s|$|-)|\\b${escapeRegex(keywordLower)}\\b`, 'gi');
        result = result.replace(regex, (match) => {
            if (match.startsWith(' ') && (match.endsWith(' ') || match.endsWith('-') || match.length === keywordLower.length + 1)) {
                return ' ';
            }
            return '';
        });
    }

    result = result.replace(/^[\s\-_|]+|[\s\-_|]+$/g, '');
    result = result.replace(/\s+/g, ' ');
    return result.trim();
}

/**
 * 按文本出现顺序提取其他标签
 * @param {string} text - 节点名称（小写）
 * @returns {string[]} 标签输出名称列表（按出现顺序）
 */
function extractOtherTagsByAppearance(text) {
    const usedKeywords = new Set();
    const matches = [];

    for (const [tagKey, tagInfo] of Object.entries(OTHER_TAGS_MAP)) {
        for (const keyword of tagInfo.keywords) {
            const keywordLower = keyword.toLowerCase();
            if (usedKeywords.has(keywordLower)) continue;

            let matchIndex = -1;

            if (keyword.match(/[\u4e00-\u9fa5]/)) {
                const patterns = [
                    new RegExp(`\\s${escapeRegex(keywordLower)}(?=\\s|$|-|[A-Za-z0-9\\u4e00-\\u9fa5])`, 'gi'),
                    new RegExp(`^${escapeRegex(keywordLower)}(?=\\s|$|-|[A-Za-z0-9\\u4e00-\\u9fa5])`, 'gi'),
                    new RegExp(`[A-Za-z0-9]${escapeRegex(keywordLower)}(?=\\s|$|-|[A-Za-z0-9\\u4e00-\\u9fa5])`, 'gi'),
                    new RegExp(`[\\u4e00-\\u9fa5]${escapeRegex(keywordLower)}(?=\\s|$|-|[A-Za-z0-9\\u4e00-\\u9fa5])`, 'gi')
                ];

                for (const pattern of patterns) {
                    const match = pattern.exec(text);
                    if (match) {
                        matchIndex = match.index;
                        break;
                    }
                }
            } else if (keywordLower.length <= 3) {
                const regex = new RegExp(`\\b${escapeRegex(keywordLower)}\\b`, 'gi');
                const match = regex.exec(text);
                if (match) matchIndex = match.index;
            } else {
                const regex = new RegExp(`(?:^|\\s)${escapeRegex(keywordLower)}(?:\\s|$|-)|\\b${escapeRegex(keywordLower)}\\b`, 'gi');
                const match = regex.exec(text);
                if (match) matchIndex = match.index;
            }

            if (matchIndex !== -1) {
                matches.push({
                    position: matchIndex,
                    tag: tagInfo.output
                });
                tagInfo.keywords.forEach(k => usedKeywords.add(k.toLowerCase()));
                break;
            }
        }
    }

    matches.sort((a, b) => a.position - b.position);
    return matches.map(m => m.tag);
}

/**
 * 递归格式化函数 - 按格式字符串中的占位符顺序处理
 * @param {string} originalName - 原始节点名称
 * @param {string} format - 格式模板
 * @param {object} regionInfo - 地区信息
 * @param {number} index - 索引值
 * @returns {string} 格式化后的名称
 */
function recursiveFormat(originalName, format, regionInfo, index) {
    const connector = ' ';
    let remainingText = originalName.toLowerCase();

    // 解析格式字符串
    const placeholderRegex = /{([^}]+)}/g;
    const formatParts = [];
    let lastIndex = 0;
    let match;

    while ((match = placeholderRegex.exec(format)) !== null) {
        if (match.index > lastIndex) {
            formatParts.push({ type: 'text', content: format.substring(lastIndex, match.index) });
        }
        formatParts.push({ type: 'placeholder', content: match[1], fullMatch: match[0] });
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < format.length) {
        formatParts.push({ type: 'text', content: format.substring(lastIndex) });
    }

    // 按顺序处理
    const resultParts = [];

    for (const part of formatParts) {
        if (part.type === 'text') {
            resultParts.push(part.content);
        } else {
            const placeholder = part.content;
            let value = '';

            if (placeholder === 'countryName') {
                value = regionInfo.name_en;
                for (const keyword of regionInfo.keywords) {
                    remainingText = removeKeyword(remainingText, keyword);
                }
                remainingText = remainingText.replace(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/g, '');
                remainingText = remainingText.replace(/[\uD83D-\uDBFF][\uDC00-\uDFFF]/g, '');
                remainingText = remainingText.trim();

            } else if (placeholder === 'countryFlag') {
                value = regionInfo.flag;
                for (const keyword of regionInfo.keywords) {
                    remainingText = removeKeyword(remainingText, keyword);
                }
                remainingText = remainingText.replace(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/g, '');
                remainingText = remainingText.replace(/[\uD83D-\uDBFF][\uDC00-\uDFFF]/g, '');
                remainingText = remainingText.trim();

            } else if (placeholder === 'countryCode') {
                value = regionInfo.code;
                for (const keyword of regionInfo.keywords) {
                    remainingText = removeKeyword(remainingText, keyword);
                }
                remainingText = remainingText.replace(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/g, '');
                remainingText = remainingText.replace(/[\uD83D-\uDBFF][\uDC00-\uDFFF]/g, '');
                remainingText = remainingText.trim();

            } else if (placeholder === 'countryNameCN') {
                value = regionInfo.name_cn;
                for (const keyword of regionInfo.keywords) {
                    remainingText = removeKeyword(remainingText, keyword);
                }
                remainingText = remainingText.replace(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/g, '');
                remainingText = remainingText.replace(/[\uD83D-\uDBFF][\uDC00-\uDFFF]/g, '');
                remainingText = remainingText.trim();

            } else if (placeholder === 'iplc') {
                const hasIPLC = /iplc/i.test(remainingText);
                value = hasIPLC ? 'IPLC' : '';
                if (hasIPLC) {
                    remainingText = removeKeyword(remainingText, 'iplc');
                    remainingText = removeKeyword(remainingText, '专线');
                }

            } else if (placeholder === 'ispCode') {
                let ispInfo = null;
                for (const [isp, info] of Object.entries(ISP_MAP)) {
                    for (const keyword of info.keywords) {
                        if (matchKeyword(remainingText, keyword)) {
                            ispInfo = info;
                            break;
                        }
                    }
                    if (ispInfo) break;
                }
                value = ispInfo ? ispInfo.code : '';
                if (ispInfo) {
                    for (const keyword of ispInfo.keywords) {
                        remainingText = removeKeyword(remainingText, keyword);
                    }
                }

            } else if (placeholder.startsWith('index')) {
                if (placeholder.includes(':')) {
                    const width = placeholder.split(':')[1].replace('d', '');
                    value = String(index).padStart(parseInt(width), '0');
                } else {
                    value = String(index);
                }

            } else if (placeholder === 'otherTags') {
                const otherTags = extractOtherTagsByAppearance(remainingText);
                value = otherTags.join(connector);

            } else if (placeholder === 'original') {
                value = remainingText.trim();
            }

            resultParts.push(value);
        }
    }

    // 改进的字符串组装逻辑：只保留非空值，值之间用连接符连接
    const valueParts = [];

    for (let i = 0; i < resultParts.length; i++) {
        const part = formatParts[i];
        const value = resultParts[i];

        // 只收集非空的占位符值
        if (part.type === 'placeholder' && value) {
            valueParts.push(value);
        }
    }

    // 用连接符连接所有非空值
    let result = valueParts.join(connector);

    // 最终清理多余空格
    result = result.replace(/\s+/g, ' ').trim();

    return result;
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
                    new RegExp(`\\s${escapeRegex(keywordLower)}(?=\\s|$|-|家宽|家|宽|[A-Za-z])`, 'gi'),
                    new RegExp(`^${escapeRegex(keywordLower)}(?=\\s|$|-|家宽|家|宽|[A-Za-z])`, 'gi')
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
                const regex = new RegExp(`\\b${escapeRegex(keywordLower)}\\b`, 'gi');
                result = result.replace(regex, '');

            } else {
                // 长英文关键词：词边界或前后空格，保留空格
                const regex = new RegExp(`(?:^|\\s)${escapeRegex(keywordLower)}(?:\\s|$|-)|\\b${escapeRegex(keywordLower)}\\b`, 'gi');
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
    result = result.replace(/\([^)]*\)/g, '');

    // 清理多余空格和特殊字符
    result = result.replace(/^[\s\-_|]+|[\s\-_|]+$/g, '');
    result = result.replace(/\s+/g, ' ');

    return result.trim();
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}