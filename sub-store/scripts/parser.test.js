/**
 * parser.test.js — 单元测试
 * 直接用 node 运行：node parser.test.js
 *
 * 测试覆盖：
 * 1. api_token 读取：脚本参数优先，环境变量兜底
 * 2. ipinfo.io 响应映射：country_code → countryCode, as_name → isp
 * 3. detectRegionFromName 节点名称识别 region
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

function loadParserFunctions() {
  const source = fs.readFileSync(path.join(__dirname, 'parser.js'), 'utf8');
  const context = {
    console,
    process,
    $arguments: {},
    $substore: {
      http: { get: async () => ({}), post: async () => ({}) },
      wait: async () => {},
      info: () => {},
      error: () => {},
    },
    ProxyUtils: { produce: () => [] },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return {
    operator: context.operator,
    parseSortRules: context.parseSortRules,
    applySort: context.applySort,
    applyCompiledFormat: context.applyCompiledFormat,
    compileFormat: context.compileFormat,
    detectRegionFromName: context.detectRegionFromName,
  };
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

const { parseSortRules, applySort, compileFormat, applyCompiledFormat, detectRegionFromName } = loadParserFunctions();

// 能识别的节点名称：优先国旗/ISO code，其次走动态地区名索引。
const testCases = [
    { name: '新加坡 03', expected: 'SG' },
    { name: 'SG-新加坡-01', expected: 'SG' },
    { name: '🇸🇬 新加坡 05', expected: 'SG' },
    { name: 'Hong Kong 01', expected: 'HK' },
    { name: '香港节点', expected: 'HK' },
    { name: 'JP Tokyo 01', expected: 'JP' },
    { name: '日本大阪', expected: 'JP' },
    { name: 'Taiwan 01', expected: 'TW' },
    { name: 'US Los Angeles', expected: 'US' },
    { name: 'TW 台湾 02', expected: 'TW' },
    { name: 'KR Seoul', expected: 'KR' },
    // 真实订阅节点名
    { name: 'Plus 香港HKT家宽', expected: 'HK' },
    { name: 'Plus 美国Frontier家宽', expected: 'US' },
    { name: 'Plus 台湾Hinet家宽', expected: 'TW' },
    { name: 'Base 澳门', expected: 'MO' },
    { name: 'Base 韩国家宽', expected: 'KR' },
    { name: 'Base 马来西亚', expected: 'MY' },
    { name: 'Base 印度尼西亚', expected: 'ID' },
    { name: 'Base 菲律宾 02', expected: 'PH' },
    { name: 'Base 阿根廷家宽', expected: 'AR' },
    { name: 'Base 英国家宽', expected: 'GB' },
    { name: 'Base 孟加拉国', expected: 'BD' },
    // 弃用/别名代码不应误命中（DD 东德→DE，VD 北越→VN）
    { name: 'Base 德国', expected: 'DE' },
    { name: 'Base 德国家宽', expected: 'DE' },
    { name: 'Base 越南', expected: 'VN' },
    { name: 'JP-vless_reality_vision', expected: 'JP' },
    { name: 'SG-ssr', expected: 'SG' },
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
    // 真实订阅里名称无地区信息的节点
    'ELG-vless_reality_vision',
    'JMS-400878@c91s1.portablesubmarines.com:10038',
];

failCases.forEach(name => {
    const result = detectRegionFromName(name);
    assert(result === null, `"${name}" → null (应无法识别)`);
});

// ============================================================
// 测试 8: sort DSL
// ============================================================
console.log('\n[测试 8] sort DSL\n');

const regionRules = parseSortRules('region:HK,SG,JP:asc');
assert(regionRules.length === 1, 'region 简称排序规则应被解析');
assert(regionRules[0].type === 'countryCode', 'region 应映射到 countryCode');
assert(regionRules[0].values.join(',') === 'HK,SG,JP', 'region 指定顺序应被解析为 values');

const tagRules = parseSortRules('tag:Plus:desc');
const tagSorted = applySort([
  { originalName: '香港 01', region_code: 'HK', tag: '', index: 1 },
  { originalName: 'Plus 香港 02', region_code: 'HK', tag: '', index: 2 },
], tagRules);
assert(tagSorted[0].originalName === 'Plus 香港 02', 'tag:Plus:desc 应让原始名含 Plus 的节点优先');

const hasTagRules = parseSortRules('has_tag:desc');
const hasTagSorted = applySort([
  { originalName: '香港 01', region_code: 'HK', tag: '', index: 1 },
  { originalName: '香港 IPLC 02', region_code: 'HK', tag: 'IPLC', index: 2 },
], hasTagRules);
assert(hasTagSorted[0].tag === 'IPLC', 'has_tag:desc 应让已有主标签的节点优先');

// tag 指定 values 的 asc/desc 应方向相反（修复双重 order 反转）
const tagValAsc = applySort([{ tag: '' }, { tag: 'IPLC' }], parseSortRules('{tag}(IPLC) asc'));
const tagValDesc = applySort([{ tag: '' }, { tag: 'IPLC' }], parseSortRules('{tag}(IPLC) desc'));
assert(tagValAsc[0].tag === 'IPLC', '{tag}(IPLC) asc 应让命中节点排前');
assert(tagValDesc[0].tag === '' , '{tag}(IPLC) desc 应让命中节点排后（与 asc 相反）');

// region_name_cn 排序应生效（此前缺 applySort 分支被静默忽略）
const cnSorted = applySort(
  [{ region_name_cn: '日本' }, { region_name_cn: '澳门' }],
  parseSortRules('region_name_cn:asc'),
);
assert(cnSorted[0].region_name_cn === '澳门', 'region_name_cn:asc 应按中文名排序');

const formattedWithDefaultConnector = applyCompiledFormat({
  region_code: 'HK',
  index: 1,
  originalName: 'Plus 香港 IPLC 01',
}, compileFormat('{region}{index:2d}{tag:Plus}{tag:IPLC=iplc|专线}'));
assert(formattedWithDefaultConnector === 'HK-01-Plus-IPLC', '简单 tag 输出应保留传入大小写');

const formattedWithCustomTagRule = applyCompiledFormat({
  region_code: 'JP',
  index: 2,
  originalName: '日本 家宽 02',
}, compileFormat('{region}{index:2d}{tag:Home=家宽|home}'));
assert(formattedWithCustomTagRule === 'JP-02-Home', 'tag 自定义匹配规则应支持多关键词输出');

const compiledFormat = compileFormat('{region}{index:2d}{tag:Plus}');
const formattedWithCompiledFormat = applyCompiledFormat({
  region_code: 'SG',
  index: 3,
  originalName: 'plus 新加坡 03',
}, compiledFormat);
assert(formattedWithCompiledFormat === 'SG-03-Plus', '预编译 format 应与直接格式化保持一致');

// ============================================================
// 测试 9: 名称无 ISO code 时使用 META 探测
// ============================================================
console.log('\n[测试 9] 名称无 ISO code 时使用 META 探测\n');

async function testMetaProbeFillsMissingNameRegion() {
  const source = fs.readFileSync(path.join(__dirname, 'parser.js'), 'utf8');
  const context = {
    console,
    process,
    $arguments: {
      f: '{region}',
      c: '-',
      debug: false,
    },
    $substore: {
      http: {
        post: async opt => {
          if (opt.url.endsWith('/start')) return { body: JSON.stringify({ ports: [10001], pid: 123 }) };
          if (opt.url.endsWith('/stop')) return { body: '{}' };
          throw new Error(`unexpected POST ${opt.url}`);
        },
        get: async () => ({
          status: 200,
          body: JSON.stringify({ country: 'United States', countryCode: 'US', isp: 'Example ISP' }),
        }),
      },
      wait: async () => {},
      info: () => {},
      log: () => {},
      error: () => {},
    },
    $substore_env: {},
    ProxyUtils: {
      produce: nodes => nodes.map(node => ({ ...node })),
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);

  const result = await context.operator([{ name: 'random-node 01', type: 'ss', server: 'example.com', port: 443 }]);
  assert(result[0]._geo?.countryCode === 'US', '名称无法识别地区时应执行 META 探测');
  assert(result[0].region_code === 'US', 'region 应以 META 落地 countryCode 为准');
  assert(result[0].name === 'US', '重命名结果应使用 META 探测到的 region');
}

async function runAsyncTests() {
  await testMetaProbeFillsMissingNameRegion();
}

// ============================================================
// 汇总
// ============================================================
runAsyncTests().finally(() => {
  const sep = '='.repeat(50);
  console.log(`\n${sep}`);
  console.log(`结果: ${passed} 通过, ${failed} 失败`);
  console.log(`${sep}\n`);

  if (failed > 0) {
    process.exit(1);
  }
});
