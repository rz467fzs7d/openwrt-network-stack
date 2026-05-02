/**
 * parser.test.js — 单元测试
 * 直接用 node 运行：node parser.test.js
 *
 * 测试覆盖：
 * 1. api_token 读取：脚本参数优先，环境变量兜底
 * 2. ipinfo.io 响应映射：country_code → countryCode, as_name → isp
 * 3. detectRegionFromName 节点名称识别 region
 */

// ============================================================
// 测试辅助
// ============================================================
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ ${msg}`);
    failed++;
  }
}

// ============================================================
// 测试 1: api_token 读取
// ============================================================
console.log('\n[测试 2] api_token 读取\n');

// 模拟 $arguments
function getApiToken($arguments) {
  return $arguments.ipinfo_api_token
    ?? (typeof process !== 'undefined' ? process.env.IPINFO_API_TOKEN : null)
    ?? '';
}

// 场景 A：脚本参数优先
process.env.IPINFO_API_TOKEN = 'env-token';
const tokenA = getApiToken({ ipinfo_api_token: 'arg-token' });
assert(tokenA === 'arg-token', '脚本参数优先，应返回 arg-token');

// 场景 B：无脚本参数，走环境变量
const tokenB = getApiToken({});
assert(tokenB === 'env-token', '无脚本参数，应返回 env-token');

// 场景 C：脚本参数为空字符串，不走环境变量
const tokenC = getApiToken({ ipinfo_api_token: '' });
assert(tokenC === '', '脚本参数为空，应返回空字符串（不 fallback 到 env）');

// 清理
delete process.env.IPINFO_API_TOKEN;

// 场景 D：既无参数也无环境变量
const tokenD = getApiToken({});
assert(tokenD === '', '无参数无 env，应返回空字符串');

process.env.IPINFO_API_TOKEN = 'env-token-2';

// 场景 E：undefined 脚本参数 → fallback
const tokenE = getApiToken({ ipinfo_api_token: undefined });
assert(tokenE === 'env-token-2', '参数为 undefined，应 fallback 到 env');

// 清理
delete process.env.IPINFO_API_TOKEN;

// ============================================================
// 测试 3: ipinfo.io 响应映射
// ============================================================
console.log('\n[测试 3] ipinfo.io 响应映射\n');

function normalizeGeoData(geoData) {
  if (geoData.country_code && !geoData.countryCode) {
    geoData.countryCode = geoData.country_code;
  }
  if (geoData.as_name && !geoData.isp) {
    geoData.isp = geoData.as_name;
  }
  return geoData;
}

// ip-api.com 格式（已有 countryCode 和 isp）→ 不变
const geo1 = normalizeGeoData({
  country: 'China',
  countryCode: 'CN',
  isp: 'China Mobile',
  latency: 50,
});
assert(geo1.countryCode === 'CN', 'ip-api.com: countryCode 保持不变');
assert(geo1.isp === 'China Mobile', 'ip-api.com: isp 保持不变');

// ipinfo.io 格式 → 映射 country_code → countryCode
const geo2 = normalizeGeoData({
  country_code: 'JP',
  country: 'Japan',
  as_name: 'Softbank Corp',
  latency: 120,
});
assert(geo2.countryCode === 'JP', 'ipinfo.io: country_code → countryCode');
assert(geo2.isp === 'Softbank Corp', 'ipinfo.io: as_name → isp');

// ipinfo.io 已有 countryCode（覆盖字段时检查）
const geo3 = normalizeGeoData({
  country_code: 'JP',
  countryCode: 'CN',  // 已有，不应被覆盖
  as_name: 'NTT',
  isp: 'Existing ISP', // 已有，不应被 as_name 覆盖
  latency: 80,
});
assert(geo3.countryCode === 'CN', '已有 countryCode 不应被覆盖');
assert(geo3.isp === 'Existing ISP', '已有 isp 不应被 as_name 覆盖');

// ============================================================
// 测试 4: httpRequest headers 构造
// ============================================================
console.log('\n[测试 4] httpRequest headers 构造\n');

function buildHeaders(api_token) {
  const headers = {
    'User-Agent': 'Mozilla/5.0',
  };
  if (api_token) {
    headers['Authorization'] = `Bearer ${api_token}`;
  }
  return headers;
}

const h1 = buildHeaders('my-token');
assert(h1['Authorization'] === 'Bearer my-token', '有 token 应设置 Authorization');

const h2 = buildHeaders('');
assert(h2['Authorization'] === undefined, '空 token 不应设置 Authorization');

const h3 = buildHeaders(null);
assert(h3['Authorization'] === undefined, 'null token 不应设置 Authorization');

// ============================================================
// 测试 3: ipinfo.io 响应映射
// ============================================================
console.log('\n[测试 7] detectRegionFromName 节点名称识别\n');

const REGION_MAP = {
    'HK': { alias: ['香港', 'hong kong', 'hk'], flag: '🇭🇰', code: 'HK', name_cn: '香港', name_en: 'Hong Kong' },
    'TW': { alias: ['台湾', 'taiwan', 'tw'], flag: '🇹🇼', code: 'TW', name_cn: '台湾', name_en: 'Taiwan' },
    'JP': { alias: ['日本', 'japan', 'jp'], flag: '🇯🇵', code: 'JP', name_cn: '日本', name_en: 'Japan' },
    'US': { alias: ['美国', 'united states', 'us'], flag: '🇺🇸', code: 'US', name_cn: '美国', name_en: 'United States' },
    'SG': { alias: ['新加坡', 'singapore', 'sg'], flag: '🇸🇬', code: 'SG', name_cn: '新加坡', name_en: 'Singapore' },
    'KR': { alias: ['韩国', 'korea', 'kr'], flag: '🇰🇷', code: 'KR', name_cn: '韩国', name_en: 'Korea' },
};

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
    if (keyword.match(/[\uD83C-\uDBFF]/)) return text.includes(keyword);
    const lower = text.toLowerCase();
    const kwLower = keyword.toLowerCase();
    if (keyword.match(/[一-龥]/)) return lower.includes(kwLower);
    if (keyword.length <= 3) return new RegExp(`\\b${kwLower}\\b`, 'i').test(lower);
    return lower.includes(kwLower);
}

function detectRegionFromName(name) {
    const lowerName = name.toLowerCase();
    for (const [key, info] of Object.entries(REGION_MAP)) {
        const keywords = getRegionKeywords(info);
        for (const kw of keywords) {
            if (matchKeyword(lowerName, kw)) {
                return info;
            }
        }
    }
    return null;
}

// 能识别的节点名称
const testCases = [
    { name: '新加坡 03', expected: 'SG' },
    { name: '新加坡-03', expected: 'SG' },
    { name: 'SG-新加坡-01', expected: 'SG' },
    { name: '🇸🇬 新加坡 05', expected: 'SG' },
    { name: 'Hong Kong 01', expected: 'HK' },
    { name: '香港节点', expected: 'HK' },
    { name: 'JP Tokyo 01', expected: 'JP' },
    { name: '日本大阪', expected: 'JP' },
    { name: 'US Los Angeles', expected: 'US' },
    { name: '美国 01', expected: 'US' },
    { name: 'TW 台湾 02', expected: 'TW' },
    { name: 'KR Seoul', expected: 'KR' },
];

testCases.forEach(tc => {
    const result = detectRegionFromName(tc.name);
    const code = result ? result.code : null;
    assert(code === tc.expected, `"${tc.name}" → ${code || 'null'} (期望 ${tc.expected})`);
});

// 不能识别的节点名称
const failCases = [
    'domain.u53e3.com:26624',
    'node-01.example.com',
    'random-name-123',
    'ss://xxxxx',
];

failCases.forEach(name => {
    const result = detectRegionFromName(name);
    assert(result === null, `"${name}" → null (应无法识别)`);
});

// ============================================================
// 汇总
// ============================================================
const sep = '='.repeat(50);
console.log(`\n${sep}`);
console.log(`结果: ${passed} 通过, ${failed} 失败`);
console.log(`${sep}\n`);

if (failed > 0) {
  process.exit(1);
}
