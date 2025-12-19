/**
 * Region 名称格式化脚本
 *
 * 功能：
 * - 从节点名称中识别地区信息（支持 emoji、中文、英文）
 * - 自动设置标准化的 code 和 region 属性（用于 Mihomo 筛选）
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
 *   - 支持占位符：{flag} {code} {name_cn} {name_en} {name} {original} {index}
 *   - 示例："{name_en} {index}" -> "Hong Kong 1", "Hong Kong 2"
 *   - 示例："{flag} {code}-{index}" -> "🇭��� HK-1", "🇭🇰 HK-2"
 *   - 示例："{name_en} {original}" -> "Hong Kong IPLC-01"
 */

const $ = $substore;

const { format = null } = $arguments;

// 地区信息映射表（优先级从上到下）
const REGION_MAP = {
    'HK': {
        keywords: ['🇭🇰', '香港', 'hong kong', 'hongkong', 'hk'],
        flag: '🇭🇰',
        code: 'HK',
        name_cn: '香港',
        name_en: 'Hong Kong',
        name: 'Hong Kong'  // 默认等同于 name_en
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

                // 替换模板占位符
                let formattedName = format
                    .replace(/{flag}/g, regionInfo.flag)
                    .replace(/{code}/g, regionInfo.code)
                    .replace(/{index}/g, index)
                    .replace(/{name_cn}/g, regionInfo.name_cn)
                    .replace(/{name_en}/g, regionInfo.name_en)
                    .replace(/{name}/g, regionInfo.name_en)
                    .replace(/{original}/g, cleanName.trim());

            proxy.name = formattedName.replace(/\s+/g, ' ').trim();
        } else {
            // 默认行为：移除 emoji 和地区关键词
            proxy.name = removeRegionInfo(originalName, regionInfo);
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
 * 移除节点名称中的地区相关信息（emoji、关键词等）
 */
function removeRegionInfo(str, regionInfo) {
    let result = str;

    // 移除 emoji flag
    result = result.replace(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/g, '');

    // 移除其他常见 emoji
    result = result.replace(/[\uD83D-\uDBFF][\uDC00-\uDFFF]/g, '');
    result = result.replace(/🏝️/g, '');

    if (regionInfo) {
        // 移除地区关键词（保留原始节点名的其他部分）
        const nameLower = result.toLowerCase();
        for (const keyword of regionInfo.keywords) {
            const keywordLower = keyword.toLowerCase();
            // 跳过 emoji（已经处理过）
            if (keyword.match(/[\uD83C][\uDDE6-\uDDFF]/)) continue;

            // 精确匹配整个单词或作为前缀
            const regex = new RegExp(`\\b${escapeRegex(keywordLower)}\\b|^${escapeRegex(keywordLower)}[\\s-]`, 'gi');
            result = result.replace(regex, '');
        }
    }

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
