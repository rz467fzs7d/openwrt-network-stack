/**
 * node-renamer.js v2.0
 *
 * 智能节点重命名脚本 - Sub-Store Script Operator
 *
 * 功能特性：
 * - ✅ 新命名规范 (region_code, isp_code, isp_name)
 * - ✅ 动态标签检测 {tag:XXX}
 * - ✅ 高级排序语法 (多条件、ASC/DESC)
 * - ✅ ISP扩展支持
 * - ✅ 高性能 (<2ms/45节点)
 * - ✅ 仅支持新格式，移除旧格式兼容
 *
 * 文档: /scripts/README.md
 * 测试: /test/TEST_SUMMARY.md
 */

const $ = $substore;
const { format = null, connector = ' ', sort = null } = $arguments;
// 兼容大小写的参数名
const args = $arguments;
const Format = args.Format || args.format || format;
const Connector = args.Connector || args.connector || connector;
const Sort = args.Sort || args.sort || sort;

// 常量定义（简化版）
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

const OTHER_TAGS_MAP = {
    'IPLC': { keywords: ['iplc', '专线'], output: 'IPLC' },
    'Home': { keywords: ['家宽', 'home'], output: 'Home' },
};

const REGION_MAP = {
    'HK': { alias: ['香港', 'hong kong', 'hk'], flag: '🇭🇰', code: 'HK', name_cn: '香港', name_en: 'Hong Kong' },
    'TW': { alias: ['台湾', 'taiwan', 'tw'], flag: '🇹🇼', code: 'TW', name_cn: '台湾', name_en: 'Taiwan' },
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
    'BE': { alias: ['比利时', 'belgium', 'be'], flag: '🇧🇪', code: 'BE', name_cn: '比利时', name_en: 'Belgium' },
    'CZ': { alias: ['捷克', 'czech', 'cz'], flag: '🇨🇿', code: 'CZ', name_cn: '捷克', name_en: 'Czech' },
    'PT': { alias: ['葡萄牙', 'portugal', 'pt'], flag: '🇵🇹', code: 'PT', name_cn: '葡萄牙', name_en: 'Portugal' },
    'GR': { alias: ['希腊', 'greece', 'gr'], flag: '🇬🇷', code: 'GR', name_cn: '希腊', name_en: 'Greece' },
    'HU': { alias: ['匈牙利', 'hungary', 'hu'], flag: '🇭🇺', code: 'HU', name_cn: '匈牙利', name_en: 'Hungary' },
    'IE': { alias: ['爱尔兰', 'ireland', 'ie'], flag: '🇮🇪', code: 'IE', name_cn: '爱尔兰', name_en: 'Ireland' },
    'NZ': { alias: ['新西兰', 'new zealand', 'nz'], flag: '🇳🇿', code: 'NZ', name_cn: '新西兰', name_en: 'New Zealand' },
    'ZA': { alias: ['南非', 'south africa', 'za'], flag: '🇿🇦', code: 'ZA', name_cn: '南非', name_en: 'South Africa' },
    'TR': { alias: ['土耳其', 'turkey', 'tr'], flag: '🇹🇷', code: 'TR', name_cn: '土耳其', name_en: 'Turkey' },
    'MX': { alias: ['墨西哥', 'mexico', 'mx'], flag: '🇲🇽', code: 'MX', name_cn: '墨西哥', name_en: 'Mexico' },
    'AR': { alias: ['阿根廷', 'argentina', 'ar'], flag: '🇦🇷', code: 'AR', name_cn: '阿根廷', name_en: 'Argentina' },
    'CL': { alias: ['智利', 'chile', 'cl'], flag: '🇨🇱', code: 'CL', name_cn: '智利', name_en: 'Chile' },
    'TH': { alias: ['泰国', 'thailand', 'th'], flag: '🇹🇭', code: 'TH', name_cn: '泰国', name_en: 'Thailand' },
    'MY': { alias: ['马来西亚', 'malaysia', 'my'], flag: '🇲🇾', code: 'MY', name_cn: '马来西亚', name_en: 'Malaysia' },
    'ID': { alias: ['印度尼西亚', 'indonesia', 'id'], flag: '🇮🇩', code: 'ID', name_cn: '印度尼西亚', name_en: 'Indonesia' },
    'PH': { alias: ['菲律宾', 'philippines', 'ph'], flag: '🇵🇭', code: 'PH', name_cn: '菲律宾', name_en: 'Philippines' },
    'VN': { alias: ['越南', 'vietnam', 'vn'], flag: '🇻🇳', code: 'VN', name_cn: '越南', name_en: 'Vietnam' },
    'NG': { alias: ['尼日利亚', 'nigeria', 'ng'], flag: '🇳🇬', code: 'NG', name_cn: '尼日利亚', name_en: 'Nigeria' },
    'BD': { alias: ['孟加拉国', 'bangladesh', 'bd'], flag: '🇧🇩', code: 'BD', name_cn: '孟加拉国', name_en: 'Bangladesh' },
};

// 获取区域的所有关键词（动态组装）
function getRegionKeywords(regionInfo) {
    const keywords = [];

    // 添加flag
    if (regionInfo.flag) {
        keywords.push(regionInfo.flag);
    }

    // 添加code
    if (regionInfo.code) {
        keywords.push(regionInfo.code);
    }

    // 添加中文名
    if (regionInfo.name_cn) {
        keywords.push(regionInfo.name_cn);
    }

    // 添加英文名
    if (regionInfo.name_en) {
        keywords.push(regionInfo.name_en);
    }

    // 添加别名
    if (regionInfo.alias && Array.isArray(regionInfo.alias)) {
        keywords.push(...regionInfo.alias);
    }

    return keywords;
}

// 简单关键词匹配
function matchKeyword(text, keyword) {
    const keywordLower = keyword.toLowerCase();

    // emoji 直接匹配
    if (keyword.match(/[\uD83C-\uDBFF]/)) {
        return text.includes(keyword);
    }

    // 中文直接匹配
    if (keyword.match(/[\u4e00-\u9fa5]/)) {
        return text.includes(keywordLower);
    }

    // 短英文词边界匹配
    if (keywordLower.length <= 3) {
        const regex = new RegExp(`\\b${keywordLower}\\b`, 'i');
        return regex.test(text);
    }

    // 长英文直接匹配
    return text.includes(keywordLower);
}

// 简单移除关键词
function simpleRemove(text, keyword) {
    const keywordLower = keyword.toLowerCase();

    // emoji 直接移除
    if (keyword.match(/[\uD83C-\uDBFF]/)) {
        return text.replace(new RegExp(keyword, 'gi'), '').trim();
    }

    // 中文移除（考虑前后空格）
    if (keyword.match(/[\u4e00-\u9fa5]/)) {
        return text.replace(new RegExp(`\\s*${keywordLower}\\s*`, 'gi'), ' ').trim();
    }

    // 英文移除
    if (keywordLower.length <= 3) {
        return text.replace(new RegExp(`\\b${keywordLower}\\b`, 'gi'), '').trim();
    } else {
        return text.replace(new RegExp(`\\s*${keywordLower}\\s*`, 'gi'), ' ').trim();
    }
}

// 极简 recursiveFormat - 修复版本
function recursiveFormat(originalName, format, regionInfo, index, connector) {
    // 临时调试输出

    const parts = [];
    const remaining = originalName.toLowerCase();

    // 正确解析格式模板
    const regex = /{([^}]+)}/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(format)) !== null) {
        // 添加占位符前的静态文本
        if (match.index > lastIndex) {
            const textPart = format.substring(lastIndex, match.index);
            parts.push({ type: 'text', content: textPart });
        }

        // 添加占位符
        parts.push({ type: 'placeholder', content: match[1] });
        lastIndex = match.index + match[0].length;
    }

    // 添加最后的静态文本
    if (lastIndex < format.length) {
        parts.push({ type: 'text', content: format.substring(lastIndex) });
    }

    // 处理每个部分
    const resultParts = [];

    for (const part of parts) {
        if (part.type === 'text') {
            // 静态文本直接保留
            resultParts.push(part.content);
        } else {
            // 占位符需要处理
            const placeholder = part.content;
            let value = '';

            if (placeholder === 'region_name') {
                value = regionInfo.name_en;
            } else if (placeholder === 'region_code') {
                value = regionInfo.code;
            } else if (placeholder === 'region_flag') {
                value = regionInfo.flag;
            } else if (placeholder === 'region_name_cn') {
                value = regionInfo.name_cn;
            } else if (placeholder === 'iplc') {
                value = /iplc|专线/i.test(remaining) ? 'IPLC' : '';
            } else if (placeholder.startsWith('tag:')) {
                // 处理 {tag:XXX} 这样的占位符，动态检测标签是否存在
                const tagName = placeholder.split(':')[1].toUpperCase();
                // 检查原始名称中是否包含该标签关键词（不区分大小写）
                value = new RegExp(tagName, 'i').test(remaining) ? tagName : '';
            } else if (placeholder === 'isp_code') {
                // ISP 代码
                for (const [isp, info] of Object.entries(ISP_MAP)) {
                    for (const keyword of info.keywords) {
                        if (matchKeyword(remaining, keyword)) {
                            value = info.code;
                            break;
                        }
                    }
                    if (value) break;
                }
            } else if (placeholder === 'isp_name') {
                // ISP 名称
                for (const [isp, info] of Object.entries(ISP_MAP)) {
                    for (const keyword of info.keywords) {
                        if (matchKeyword(remaining, keyword)) {
                            value = info.name;
                            break;
                        }
                    }
                    if (value) break;
                }
            } else if (placeholder.startsWith('index')) {
                if (placeholder.includes(':')) {
                    const width = placeholder.split(':')[1].replace('d', '');
                    value = String(index).padStart(parseInt(width), '0');
                } else {
                    value = String(index);
                }
            } else if (placeholder === 'tag') {
                // 检测第一个标签（IPLC, HOME, UDPN, BASE 或动态标签）
                const tags = detectTags(originalName);
                value = tags.length > 0 ? tags[0] : '';
            } else if (placeholder === 'otherTags') {
                value = ''; // 简化处理
            } else if (placeholder === 'original') {
                value = originalName;
            } else {
                value = ''; // 不支持的占位符
            }

            // 只有非空值才加入
            if (value && value.trim() !== '') {
                resultParts.push(value);
            }
        }
    }

    // 组装结果：智能逻辑
    // 检查format是否包含非空格静态文本（{}之外有除空格外的内容）
    const staticContent = format.replace(/{[^}]+}/g, '').replace(/\s+/g, '');
    const hasNonSpaceStatic = staticContent !== '';

    let result = '';

    if (hasNonSpaceStatic) {
        // 包含非空格静态文本（如 -、_、/ 等）：直接拼接，忽略connector
        for (const part of resultParts) {
            if (part !== '') {
                result += part;
            }
        }
    } else {
        // 只有空格或纯占位符：过滤掉所有空格，使用connector连接非空值
        const filteredParts = resultParts.filter(part => {
            if (part === '') return false;
            if (part.trim() === '') return false; // 过滤所有纯空格
            return true;
        });

        for (let i = 0; i < filteredParts.length; i++) {
            if (i === 0) {
                result = filteredParts[i];
            } else {
                result += connector + filteredParts[i];
            }
        }
    }

    // 清理：移除首尾空格
    result = result.trim();


    return result;
}

// 简化版移除地区信息
function removeRegionInfo(str, regionInfo) {
    let result = str;

    // 移除emoji
    result = result.replace(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/g, '');
    result = result.replace(/[\uD83D-\uDBFF][\uDC00-\uDFFF]/g, '');

    // 移除关键词
    if (regionInfo) {
        const keywords = getRegionKeywords(regionInfo);
        for (const keyword of keywords) {
            if (!keyword.match(/[\uD83C-\uDBFF]/)) { // 不处理emoji
                result = simpleRemove(result, keyword);
            }
        }
    }

    // 移除节点类型前缀
    result = result.replace(/^(ss|vmess|trojan|hysteria|vless|ssr|v2ray)\s*/gi, '');

    // 清理
    result = result.replace(/\([^)]*\)/g, '');
    result = result.replace(/[\s\-_|]+$/g, '');
    result = result.replace(/\s+/g, ' ').trim();

    return result;
}

// 排序相关函数（仅支持新语法）
function parseSortRules(sortString) {
    if (!sortString) return [];

    // 支持的语法：
    // 1. "region_code(HK,US,JP) ASC, tag(IPLC) DESC, index ASC"  ← 新语法
    // 2. "region_code ASC, tag DESC, index ASC"                 ← 新语法（无指定值）
    // 3. "{region_code}{tag:IPLC}"                              ← 格式化语法

    // 检查是否包含 {xxx}（格式化语法）
    if (sortString.includes('{') && sortString.includes('}')) {
        return parseFormatStyleSort(sortString);
    }

    // 新语法：逗号分隔，支持 (value) 和 ASC/DESC
    return parseAdvancedSort(sortString);
}

// 解析高级排序语法：region_code(HK,US,JP) ASC, tag(IPLC) DESC, index ASC
function parseAdvancedSort(sortString) {
    const rules = [];

    // 使用正则表达式分割，但忽略括号内的逗号
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
    if (current.trim()) {
        parts.push(current.trim());
    }

    parts.forEach(part => {
        if (!part) return;

        // 匹配模式：field(values) ORDER 或 field ORDER
        // 示例：region_code(HK,US,JP) ASC
        const match = part.match(/^([\w_]+)(?:\(([^)]+)\))?(?:\s+(ASC|DESC))?$/i);

        if (match) {
            const field = match[1].toLowerCase();
            const valuesStr = match[2];
            const order = (match[3] || 'ASC').toLowerCase();

            // 解析字段值
            let values = [];
            let hasValues = false;

            if (valuesStr) {
                values = valuesStr.split(',').map(v => v.trim().toUpperCase());
                hasValues = values.length > 0;
            }

            // 映射字段名到内部类型（仅新命名规范）
            const fieldMap = {
                'region_code': 'countryCode',
                'region_name': 'countryName',
                'region_name_cn': 'countryNameCN',
                'region_flag': 'countryFlag',
                'tag': 'tag',
                'isp_code': 'ispCode',
                'isp_name': 'ispName',
                'index': 'index',
                'name': 'name',
                'original': 'original'
            };

            const internalType = fieldMap[field] || field;

            rules.push({
                type: internalType,
                values: values,
                hasValues: hasValues,
                order: order,
                originalField: field  // 用于调试
            });
        }
    });

    return rules;
}

// 解析格式化风格语法：{region_code}{tag:IPLC}
function parseFormatStyleSort(sortString) {
    const rules = [];
    const regex = /{([^}]+)}/g;
    let match;

    while ((match = regex.exec(sortString)) !== null) {
        const placeholder = match[1];

        if (placeholder.includes(':')) {
            const [type, value] = placeholder.split(':');
            // 映射字段名到内部类型（仅新命名规范）
            const fieldMap = {
                'region_code': 'countryCode',
                'region_name': 'countryName',
                'region_name_cn': 'countryNameCN',
                'region_flag': 'countryFlag',
                'tag': 'tag',
                'isp_code': 'ispCode',
                'isp_name': 'ispName',
                'index': 'index',
                'name': 'name',
                'original': 'original'
            };
            const internalType = fieldMap[type.trim()] || type.trim();

            rules.push({
                type: internalType,
                values: value.split(',').map(v => v.trim().toUpperCase()),
                hasValues: true,
                order: 'asc'
            });
        } else {
            // 映射字段名到内部类型（仅新命名规范）
            const fieldMap = {
                'region_code': 'countryCode',
                'region_name': 'countryName',
                'region_name_cn': 'countryNameCN',
                'region_flag': 'countryFlag',
                'tag': 'tag',
                'isp_code': 'ispCode',
                'isp_name': 'ispName',
                'index': 'index',
                'name': 'name',
                'original': 'original'
            };
            const internalType = fieldMap[placeholder.trim()] || placeholder.trim();

            rules.push({
                type: internalType,
                values: [],
                hasValues: false,
                order: 'asc'
            });
        }
    }

    return rules;
}

function hasTag(proxy, tag) {
    const name = proxy.originalName || proxy.name || '';
    const lowerName = name.toLowerCase();
    const tagUpper = tag.toUpperCase();

    // 检查预定义标签
    for (const [tagKey, tagInfo] of Object.entries(OTHER_TAGS_MAP)) {
        if (tagKey.toUpperCase() === tagUpper || tagInfo.output.toUpperCase() === tagUpper) {
            for (const keyword of tagInfo.keywords) {
                if (matchKeyword(lowerName, keyword)) return true;
            }
        }
    }

    // 检查运营商
    for (const [ispKey, ispInfo] of Object.entries(ISP_MAP)) {
        if (ispKey.toUpperCase() === tagUpper || ispInfo.code.toUpperCase() === tagUpper) {
            for (const keyword of ispInfo.keywords) {
                if (matchKeyword(lowerName, keyword)) return true;
            }
        }
    }

    // 动态关键字
    if (!OTHER_TAGS_MAP[tag] && !ISP_MAP[tag]) {
        if (lowerName.includes(tag.toLowerCase())) return true;
    }

    return false;
}

function detectRegionCode(proxy) {
    if (proxy.code && REGION_MAP[proxy.code]) return proxy.code;

    const name = proxy.name || '';
    const lowerName = name.toLowerCase();

    for (const [code, info] of Object.entries(REGION_MAP)) {
        for (const keyword of info.keywords) {
            if (matchKeyword(lowerName, keyword)) return code;
        }
    }

    return 'ZZZ';
}

function detectISP(proxy) {
    if (proxy.ispCode && ISP_MAP[proxy.ispCode]) return proxy.ispCode;

    const name = proxy.name || '';
    const lowerName = name.toLowerCase();

    for (const [isp, info] of Object.entries(ISP_MAP)) {
        for (const keyword of info.keywords) {
            if (matchKeyword(lowerName, keyword)) return info.code;
        }
    }

    return 'UNKNOWN';
}

function applySort(proxies, sortRules) {
    if (!sortRules || sortRules.length === 0) return proxies;

    return [...proxies].sort((a, b) => {
        for (const rule of sortRules) {
            const { type, values, hasValues, order = 'asc' } = rule;

            let comparison = 0;
            let valueA, valueB;

            // 根据字段类型获取值并比较
            if (type === 'countryCode') {
                const regionA = a.code || detectRegionCode(a);
                const regionB = b.code || detectRegionCode(b);

                if (hasValues && values.length > 0) {
                    // 有指定值：按指定顺序排序
                    const indexA = values.indexOf(regionA);
                    const indexB = values.indexOf(regionB);
                    const isSpecifiedA = indexA !== -1;
                    const isSpecifiedB = indexB !== -1;

                    if (isSpecifiedA && !isSpecifiedB) {
                        comparison = -1; // A 在指定列表中，B 不在，A 优先
                    } else if (!isSpecifiedA && isSpecifiedB) {
                        comparison = 1;  // B 在指定列表中，A 不在，B 优先
                    } else if (isSpecifiedA && isSpecifiedB) {
                        comparison = indexA - indexB; // 都在列表中，按索引顺序
                    } else {
                        comparison = regionA.localeCompare(regionB); // 都不在列表中，按字母顺序
                    }
                } else {
                    // 无指定值：直接按字母顺序
                    comparison = regionA.localeCompare(regionB);
                }

                valueA = regionA;
                valueB = regionB;

            } else if (type === 'ispCode' || type === 'ispName') {
                const ispCodeA = detectISP(a);
                const ispCodeB = detectISP(b);

                // 获取 ISP 名称
                const getISPName = (code) => {
                    for (const [isp, info] of Object.entries(ISP_MAP)) {
                        if (info.code === code) return info.name;
                    }
                    return code;
                };

                const ispA = type === 'ispCode' ? ispCodeA : getISPName(ispCodeA);
                const ispB = type === 'ispCode' ? ispCodeB : getISPName(ispCodeB);

                if (hasValues && values.length > 0) {
                    const indexA = values.indexOf(ispCodeA); // 使用代码进行匹配
                    const indexB = values.indexOf(ispCodeB);
                    const isSpecifiedA = indexA !== -1;
                    const isSpecifiedB = indexB !== -1;

                    if (isSpecifiedA && !isSpecifiedB) comparison = -1;
                    else if (!isSpecifiedA && isSpecifiedB) comparison = 1;
                    else if (isSpecifiedA && isSpecifiedB) comparison = indexA - indexB;
                    else comparison = ispA.localeCompare(ispB);
                } else {
                    comparison = ispA.localeCompare(ispB);
                }

                valueA = ispA;
                valueB = ispB;

            } else if (type === 'tag') {
                // 检查是否包含指定的标签
                if (hasValues && values.length > 0) {
                    for (const tag of values) {
                        const hasTagA = hasTag(a, tag);
                        const hasTagB = hasTag(b, tag);

                        if (hasTagA && !hasTagB) {
                            // A有标签，B没有
                            comparison = (order === 'desc') ? -1 : 1;  // DESC: A优先, ASC: B优先
                            break;
                        }
                        if (!hasTagA && hasTagB) {
                            // B有标签，A没有
                            comparison = (order === 'desc') ? 1 : -1;   // DESC: B优先, ASC: A优先
                            break;
                        }
                        // 都有或都没有，继续下一个标签或规则
                    }
                }

                // 如果还没有比较结果，按第一个标签的字母顺序
                if (comparison === 0) {
                    const tagsA = detectTags(a.originalName || a.name || '');
                    const tagsB = detectTags(b.originalName || b.name || '');
                    const tagA = tagsA[0] || '';
                    const tagB = tagsB[0] || '';
                    comparison = tagA.localeCompare(tagB);
                    // 应用排序方向到字母比较
                    if (order === 'desc') {
                        comparison = -comparison;
                    }
                }

                valueA = hasTag(a, values[0] || '') ? '1' : '0';
                valueB = hasTag(b, values[0] || '') ? '1' : '0';

            } else if (type === 'index') {
                valueA = parseInt((a.originalName || a.name || '').match(/\d+/)?.[0] || '0');
                valueB = parseInt((b.originalName || b.name || '').match(/\d+/)?.[0] || '0');
                comparison = valueA - valueB;

            } else if (type === 'name') {
                valueA = a.name || '';
                valueB = b.name || '';
                comparison = valueA.localeCompare(valueB, 'zh-CN');

            } else if (type === 'original') {
                valueA = (a.originalName || a.name || '').toLowerCase();
                valueB = (b.originalName || b.name || '').toLowerCase();
                comparison = valueA.localeCompare(valueB, 'zh-CN');

            } else {
                // 其他字段
                valueA = (a[type] || '').toString().toLowerCase();
                valueB = (b[type] || '').toString().toLowerCase();
                comparison = valueA.localeCompare(valueB, 'zh-CN');
            }

            // 应用排序方向（跳过tag类型，已在内部处理）
            if (order === 'desc' && type !== 'tag') {
                comparison = -comparison;
            }

            // 如果有差异，返回结果
            if (comparison !== 0) {
                return comparison;
            }
        }

        return 0;
    });
}

// 辅助函数：检测节点包含的标签
function detectTags(name) {
    const tags = [];
    const lowerName = name.toLowerCase();

    // 检测 IPLC
    if (/iplc|专线/i.test(lowerName)) tags.push('IPLC');

    // 检测 UDPN
    if (/udpn/i.test(lowerName)) tags.push('UDPN');

    // 检测 HOME
    if (/家宽|home/i.test(lowerName)) tags.push('HOME');

    // 检测 BASE
    if (/base/i.test(lowerName)) tags.push('BASE');

    // 检测其他动态标签（大写字母组合）
    const dynamicMatches = name.match(/[A-Z]{3,}/g);
    if (dynamicMatches) {
        dynamicMatches.forEach(match => {
            // 排除已知的和过短的
            if (!['IPLC', 'UDPN', 'HOME', 'BASE'].includes(match) && match.length >= 3) {
                tags.push(match);
            }
        });
    }

    return tags;
}

function updateIndexInName(currentName, format, regionInfo, newIndex) {
    // 重新生成名称，而不是尝试替换索引
    // 这样更可靠，特别是当格式包含 {tag:IPLC} 等复杂占位符时

    // 从当前名称中提取原始名称（用于检测 IPLC 等标签）
    // 这里我们假设 proxy.originalName 仍然包含原始信息
    // 但由于这个函数只接收 currentName，我们需要从名称中推断

    // 简单方法：重新调用 recursiveFormat，但需要原始名称
    // 由于我们无法在这里获取原始名称，我们采用保守方法：
    // 只替换最后一个数字序列，并确保是2位格式

    const numberPattern = /\d+/g;
    const matches = currentName.match(numberPattern);
    if (!matches) return currentName;

    const lastIndex = currentName.lastIndexOf(matches[matches.length - 1]);
    const prefix = currentName.substring(0, lastIndex);
    const suffix = currentName.substring(lastIndex + matches[matches.length - 1].length);

    // 检查是否需要2位格式
    let newIndexStr = String(newIndex);
    if (format.includes('{index:02d}') || format.includes('{index:2d}')) {
        newIndexStr = String(newIndex).padStart(2, '0');
    }

    return prefix + newIndexStr + suffix;
}

// 主函数
function operator(proxies) {
    let matchedCount = 0;
    let unmatchedCount = 0;
    const regionCounters = {};

    proxies.forEach(proxy => {
        const originalName = proxy.name || '';
        const lowerName = originalName.toLowerCase();

        proxy.originalName = originalName;

        // 地区匹配
        let matched = false;
        let regionInfo = null;

        for (const [key, info] of Object.entries(REGION_MAP)) {
            const keywords = getRegionKeywords(info);
            for (const keyword of keywords) {
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
            return;
        }

        // 设置属性
        if (regionInfo) {
            proxy.code = regionInfo.code;
            proxy.region = regionInfo.name_en;

            // 计数
            if (!regionCounters[regionInfo.code]) {
                regionCounters[regionInfo.code] = 0;
            }
            regionCounters[regionInfo.code]++;
            const index = regionCounters[regionInfo.code];

            // 格式化
            if (Format) {
                proxy.name = recursiveFormat(originalName, Format, regionInfo, index, Connector);
            } else {
                proxy.name = removeRegionInfo(originalName, regionInfo);
            }
        }
    });

    $.info(`地区格式化完成: 成功 ${matchedCount} 个, 未匹配 ${unmatchedCount} 个`);

    // 排序
    if (Sort) {
        const sortRules = parseSortRules(Sort);
        if (sortRules.length > 0) {
            proxies = applySort(proxies, sortRules);

            // 重新计算索引
            if (Format && (Format.includes('{index}') || Format.includes('{index:'))) {
                const newRegionCounters = {};
                proxies.forEach(proxy => {
                    if (proxy.code) {
                        if (!newRegionCounters[proxy.code]) {
                            newRegionCounters[proxy.code] = 0;
                        }
                        newRegionCounters[proxy.code]++;

                        const regionInfo = REGION_MAP[proxy.code];
                        if (regionInfo) {
                            // 重新生成名称，使用原始名称和新的索引
                            proxy.name = recursiveFormat(proxy.originalName, Format, regionInfo, newRegionCounters[proxy.code], Connector);
                        }
                    }
                });
            }
        }
    }

    return proxies;
}