const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/parser.js`, 'utf8');

function harness(args = {}, getResponse = () => ({ status: 200, body: '' })) {
    const requests = [], starts = [], logs = [], store = new Map();
    let stops = 0;
    const context = {
        $arguments: { f: '{region*}', options: { exit: { source: 'youtube' } }, ...args },
        ProxyUtils: { produce: nodes => nodes.map(node => ({ ...node })) },
        scriptResourceCache: { get: key => store.get(key), set: (key, value) => store.set(key, value) },
        $substore: {
            info: message => logs.push(message), error: message => logs.push(message), wait: async () => {},
            http: {
                get: async options => { requests.push(options); return getResponse(options); },
                post: async options => {
                    if (options.url.endsWith('/start')) {
                        const body = JSON.parse(options.body); starts.push(body);
                        return { body: JSON.stringify({ pid: 42, ports: body.proxies.map((_, i) => 10000 + i) }) };
                    }
                    stops++; return { body: '{}' };
                },
            },
        },
    };
    vm.createContext(context); vm.runInContext(source, context);
    return { context, requests, starts, logs, store, get stops() { return stops; } };
}
const nodes = () => ['JP Home', 'JP Office', 'HK Home'].map((name, i) => ({ name, type: 'ss', server: 'example.com', port: 443 + i }));

test('YouTube and Google Terms classifications', () => {
    const { context: c } = harness();
    assert.equal(c.parseYoutubePremium('www.google.cn').status, 'cn');
    assert.equal(c.parseYoutubePremium('Premium is not available in your country').status, 'unavailable');
    assert.equal(c.parseYoutubePremium('ad-free "INNERTUBE_CONTEXT_GL": "JP"').region, 'JP');
    assert.equal(c.parseYoutubePremium('ad-free').region, 'UNKNOWN');
    assert.equal(c.parseYoutubePremium('captcha sorry unsupported_browser').status, 'unknown');
    assert.equal(c.parseYoutubePremium('').status, 'unknown');
    assert.equal(c.parseGoogleTerms('<a data-name="country-version">Country version:</a> China</p>').status, 'cn');
    assert.equal(c.parseGoogleTerms('<a data-name="country-version">Country version:</a> Singapore</p>').region, 'Singapore');
    assert.equal(c.parseGoogleTerms('captcha').status, 'unknown');
});

test('exit_is_cn marker attaches without a separator, only for explicit Chinese results', () => {
    const { context: c } = harness();
    const format = c.compileFormat('{prefix:ENET}{region}{i:2d}{tag}{exit_is_cn}');
    const node = { region_code: 'HK', index: 2, tag: '' };
    const render = check => c.applyCompiledFormat({ ...node, _googleCheck: check }, format, '-');
    assert.equal(render({ play: { status: 'detected', region: 'China ' } }), 'ENET-HK-02');
    assert.equal(render({ youtube: { status: 'available', region: 'VN' }, play: { status: 'detected', region: 'China ' } }), 'ENET-HK-02');
    assert.equal(render({ youtube: { status: 'unavailable' }, play: { status: 'detected', region: 'CN' } }), 'ENET-HK-02');
    assert.equal(render({ youtube: { status: 'unknown' }, play: { status: 'detected', region: 'China' } }), 'ENET-HK-02');
    assert.equal(render({ youtube: { status: 'cn' } }), 'ENET-HK-02*');
    assert.equal(render({ play: { status: 'detected', region: 'Hong Kong ' } }), 'ENET-HK-02');
    assert.equal(render({ youtube: { status: 'unavailable' }, play: { status: 'unknown' } }), 'ENET-HK-02');
    assert.equal(render(undefined), 'ENET-HK-02');
    assert.equal(c.applyCompiledFormat({ ...node, tag: 'Home', _googleCheck: { youtube: { status: 'cn' } } }, format, '-'), 'ENET-HK-02-Home*');
});

test('region* is a single decorated field and obeys normal connector behavior', async () => {
    const { context: c } = harness();
    const format = c.compileFormat('{prefix:ENET}{region*}{i:2d}{tag}');
    const node = { region_code: 'HK', index: 1, tag: 'Home', _googleCheck: { youtube: { status: 'cn' } } };
    assert.equal(c.applyCompiledFormat(node, format, '-'), 'ENET-HK*-01-Home');
    assert.equal(c.applyCompiledFormat(node, format, '_'), 'ENET_HK*_01_Home');
    assert.equal(c.applyCompiledFormat(node, c.compileFormat('{region*}-{i:2d}'), '-'), 'HK*-01');
    assert.equal(c.applyCompiledFormat({ ...node, _googleCheck: undefined }, format, '-'), 'ENET-HK-01-Home');
    assert.equal(c.applyCompiledFormat({ ...node, _googleCheck: { play: { status: 'unknown' } } }, format, '-'), 'ENET-HK-01-Home');
    assert.equal(node.region_code, 'HK');
    assert.equal(c.applyCompiledFormat({ ...node, _googleCheck: { youtube: { status: 'available', region: 'VN' }, play: { status: 'detected', region: 'China' } } }, format, '-'), 'ENET-HK-01-Home');
    const h = harness({ f: '{prefix:ENET}{region*}{i:2d}{tag:Home=家宽|home}' }, opt => ({ status: 200,
        body: opt.url.includes('youtube') ? 'www.google.cn' : '<div class="yVZQTb">China</div>' }));
    const result = await h.context.operator([{ name: 'HK Home', type: 'ss', server: 'example.com', port: 443 }]);
    assert.equal(result[0].name, 'ENET-HK*-01-Home');
    assert.equal(result[0].region_code, 'HK');
});

test('only region* in rename format enables checks, including cached checks', async () => {
    for (const format of [undefined, '', '{region}', '{region_code}', '{region}{exit_is_cn}', '{youtube_region}']) {
        const h = harness({ f: format, exit_is_cn_check: '[', exit_is_cn_check_exclude: '[' });
        const input = nodes(); input[0]._googleCheck = { stale: true };
        const result = await h.context.operator(input);
        assert.equal(h.starts.length, 0);
        assert.equal(h.requests.length, 0);
        assert.ok(result.every(p => !p._googleCheck));
        assert.ok([...h.store.keys()].every(key => !key.startsWith('parser:google-check:')));
    }
    const h = harness({ format: '{region*}', f: undefined });
    await h.context.operator(nodes());
    assert.equal(h.requests.length, 3);
});

test('explicitly disabled; include/exclude apply to original names independently of GeoIP skip', async () => {
    const off = harness({ exit_is_cn_check: '' }); await off.context.operator(nodes());
    assert.equal(off.requests.length, 0); assert.equal(off.starts.length, 0);
    const h = harness({ exit_is_cn_check: 'JP', exit_is_cn_check_exclude: 'Office', f: '{region*}{youtube_region}' },
        opt => ({ status: 200, body: opt.url.includes('youtube') ? 'ad-free "INNERTUBE_CONTEXT_GL":"CN"' : '<div class="yVZQTb">China</div>' }));
    const result = await h.context.operator(nodes());
    assert.equal(h.starts.length, 1); assert.equal(h.starts[0].proxies.length, 1);
    assert.equal(h.requests.length, 1); assert.equal(h.stops, 1);
    assert.ok(h.requests.every(r => r.proxy === 'http://127.0.0.1:10000' && r.retries === 0));
    assert.ok(h.requests.every(r => !Object.keys(r.headers).some(key => key.toLowerCase() === 'cookie')));
    assert.ok([...h.store.keys()].some(key => key.startsWith('parser:google-check:v3:youtube:')));
    assert.equal(result[0]._googleCheck.youtube.region, 'CN');
    assert.equal(result[0].region_code, 'JP'); assert.equal(result[0]._failed, undefined);
    assert.equal(result[1]._googleCheck, undefined); assert.equal(result[2]._googleCheck, undefined);
    assert.ok(result[0].name.includes('CN'));
    await h.context.operator(nodes()); assert.equal(h.requests.length, 1);
    for (const [key, value] of h.store) if (key.startsWith('parser:google-check:')) value.youtubeCheckedAt = 0;
    await h.context.operator(nodes()); assert.equal(h.requests.length, 2);
});

test('default scope includes Asian regions but excludes Europe, Oceania and Americas', async () => {
    const h = harness();
    const input = ['HK-01', '澳门家宽', '台灣 01', '🇭🇰 Home', 'JP Home', 'SG Home', 'IN Home', 'TH Home', 'AE Home', 'Australia AU', 'US Home', 'GB Home']
        .map((name, i) => ({ name, type: 'ss', server: 'example.com', port: 443 + i }));
    const result = await h.context.operator(input);
    assert.equal(h.starts.length, 1);
    assert.equal(h.starts[0].proxies.length, 9);
    assert.equal(h.requests.length, 9);
    assert.ok(result.slice(0, 9).every(p => p._googleCheck));
    assert.ok(result.slice(9).every(p => !p._googleCheck));
});

test('bad scope fails before network; unmatched scope starts no META', async () => {
    const bad = harness({ exit_is_cn_check: '[' });
    await assert.rejects(bad.context.operator(nodes()), /exit_is_cn_check/);
    assert.equal(bad.starts.length, 0);
    const none = harness({ exit_is_cn_check: 'US' }); await none.context.operator(nodes());
    assert.equal(none.starts.length, 0);
});

test('HTTP failures and exceptions remain unknown, never remove nodes; META stops', async () => {
    const h = harness({ exit_is_cn_check: 'JP', exit_is_cn_check_exclude: 'Office' }, opt => {
        if (opt.url.includes('youtube')) throw new Error('timeout');
        return { status: 403, body: 'www.google.cn' };
    });
    const result = await h.context.operator(nodes());
    assert.equal(result.length, 3); assert.equal(h.stops, 1);
    assert.equal(result[0]._googleCheck.youtube.status, 'unknown');
    assert.equal(result[0]._googleCheck.play, undefined);
    assert.equal(result[0]._failed, undefined);
    for (const [key, value] of h.store) if (key.startsWith('parser:google-check:')) value.youtubeCheckedAt -= 11 * 60 * 1000;
    await h.context.operator(nodes()); assert.equal(h.requests.length, 2);
});

test('endpoint changes invalidate cache; disabling cache forces fresh checks', async () => {
    const response = opt => ({ status: 200, body: opt.url.includes('youtube') ? 'ad-free "INNERTUBE_CONTEXT_GL":"JP"' : '<div class="yVZQTb">Japan</div>' });
    const h = harness({ exit_is_cn_check: '^JP Home$' }, response);
    await h.context.operator(nodes());
    const changed = nodes(); changed[0].server = 'new.example.com';
    await h.context.operator(changed); assert.equal(h.requests.length, 2);
    h.context.$arguments.cache = false;
    await h.context.operator(nodes()); assert.equal(h.requests.length, 3);
    const original = nodes(); original[2]._googleCheck = { stale: true };
    const result = await h.context.operator(original);
    assert.equal(result[2]._googleCheck, undefined);
});

test('explicit all scope obeys concurrency and META lease; flat endpoints do not inherit results', async () => {
    let active = 0, peak = 0;
    const h = harness({ exit_is_cn_check: '.*', exit_is_cn_check_concurrency: 1, flat: '{example.com:192.0.2.1}' }, async opt => {
        active++; peak = Math.max(peak, active);
        await new Promise(resolve => setImmediate(resolve)); active--;
        return { status: 200, body: opt.url.includes('youtube') ? 'www.google.cn' : '<div class="yVZQTb">China</div>' };
    });
    const result = await h.context.operator(nodes());
    assert.equal(h.starts[0].proxies.length, 3); assert.equal(peak, 1);
    assert.ok(h.starts[0].timeout >= 15000); assert.equal(h.stops, 1);
    assert.equal(result.length, 6);
    assert.ok(result.every(p => p.server === 'example.com' || p._googleCheck === undefined));
    assert.ok(result.filter(p => p.server !== 'example.com').every(p => !p.name.includes('*')));
});

test('optional META startup failure leaves subscription intact with unknown checks', async () => {
    const h = harness({ exit_is_cn_check: 'JP' });
    h.context.$substore.http.post = async () => { throw new Error('connection refused'); };
    const result = await h.context.operator(nodes());
    assert.equal(result.length, 3);
    assert.equal(result[0]._googleCheck.youtube.status, 'unknown');
    assert.equal(result[0]._googleCheck.youtube.reason, 'meta_failed');
    assert.equal(result[0]._failed, undefined);
    assert.equal(h.requests.length, 0);
});

test('default Terms source and legacy Play placeholder never requests Play', async () => {
    const h = harness({ options: {}, f: '{region*}{google_play_region}' }, () => ({ status: 200,
        body: '<a data-name="country-version">Country version:</a> China</p>' }));
    const result = await h.context.operator(nodes());
    assert.equal(h.requests.length, 3);
    assert.ok(h.requests.every(r => r.url.includes('policies.google.com/terms')));
    assert.ok(result.every(p => p._googleCheck.terms.status === 'cn' && p.name.includes('*')));
});

test('META failures have a short negative cache, then retry; cache=false bypasses it', async () => {
    const h = harness(); let attempts = 0;
    h.context.$substore.http.post = async () => { attempts++; throw new Error('unavailable'); };
    await h.context.operator(nodes()); const initial = attempts;
    await h.context.operator(nodes()); assert.equal(attempts, initial);
    for (const [key, value] of h.store) if (key.startsWith('parser:google-check:')) value.youtubeCheckedAt -= 61000;
    await h.context.operator(nodes()); assert.ok(attempts > initial);
    const retried = attempts; h.context.$arguments.cache = false;
    await h.context.operator(nodes()); assert.ok(attempts > retried);
});

test('source switches have independent caches', async () => {
    const h = harness({}, opt => ({ status: 200, body: opt.url.includes('youtube') ? 'www.google.cn' : '<a data-name="country-version">Country version:</a> Japan</p>' }));
    await h.context.operator(nodes());
    h.context.$arguments.options = { exit: { source: 'terms' } };
    const terms = await h.context.operator(nodes());
    assert.ok(terms.every(p => p._googleCheck.terms.region === 'Japan' && !p.name.includes('*')));
    h.context.$arguments.options = { exit: { source: 'youtube' } };
    const youtube = await h.context.operator(nodes());
    assert.ok(youtube.every(p => p._googleCheck.youtube.status === 'cn' && p.name.includes('*')));
    assert.equal(h.requests.length, 6);
});

test('flat removes only calculated markers, retaining literal stars in a template', async () => {
    const h = harness({ f: '{prefix:literal*}{region*}{i:2d}{exit_is_cn}', flat: '{example.com:192.0.2.1}' },
        () => ({ status: 200, body: 'www.google.cn' }));
    const result = await h.context.operator([nodes()[0]]);
    assert.equal(result[0].name, 'literal*-JP*-01*');
    assert.equal(result[1].name, 'literal*-JP-01-192.0.2.1');
});

test('identical connections share one core port and YouTube request without merging nodes', async () => {
    const h = harness({}, () => ({ status: 200, body: 'www.google.cn' }));
    const aliases = nodes().map(p => ({ ...p, port: 443 }));
    const result = await h.context.operator(structuredClone(aliases));
    assert.equal(result.length, 3);
    assert.equal(h.starts[0].proxies.length, 1);
    assert.equal(h.requests.length, 1);
    assert.ok(result.every(p => p._googleCheck.youtube.status === 'cn'));
    assert.notEqual(result[0]._googleCheck.youtube, result[1]._googleCheck.youtube);
    await h.context.operator(structuredClone(aliases));
    assert.equal(h.requests.length, 1);
});

test('connection deduplication retains credentials, SNI, protocol and ordered options', async () => {
    const h = harness({}, () => ({ status: 200, body: 'www.google.cn' }));
    const base = nodes()[0];
    const input = [base, { ...base, name: 'JP Password', password: 'different' },
        { ...base, name: 'JP SNI', sni: 'different.example' },
        { ...base, name: 'JP Protocol', type: 'trojan' },
        { ...base, name: 'JP Ordered1', alpn: ['h2', 'http/1.1'] },
        { ...base, name: 'JP Ordered2', alpn: ['http/1.1', 'h2'] }];
    await h.context.operator(input);
    assert.equal(h.starts[0].proxies.length, input.length);
    assert.equal(h.requests.length, input.length);
});

test('name cache trims legacy entries and remains bounded without changing recognized regions', async () => {
    const h = harness({ f: '{region}' });
    const old = Object.fromEntries(Array.from({ length: 10002 }, (_, i) => ['old-'+i, { code: 'JP' }]));
    h.store.set('parser:name_region:v1', old);
    const result = await h.context.operator([{ ...nodes()[0], name: 'HK New' }]);
    const saved = h.store.get('parser:name_region:v1');
    assert.equal(Object.keys(saved).length, 10000);
    assert.equal(saved['old-0'], undefined);
    assert.equal(saved['old-2'], undefined);
    assert.equal(saved['hk new'].code, 'HK');
    assert.equal(result[0].region_code, 'HK');
});

test('shared checks respect scope and deduplicate nested option key order', async () => {
    const h = harness({ exit_is_cn_check: '^JP' }, () => ({ status: 200, body: 'www.google.cn' }));
    const base = { ...nodes()[0], 'plugin-opts': { host: 'a.example', mode: 'websocket' } };
    const aliases = [base,
        { ...base, name: 'JP Alias', 'plugin-opts': { mode: 'websocket', host: 'a.example' } },
        { ...base, name: 'HK Excluded' }];
    const result = await h.context.operator(structuredClone(aliases));
    assert.equal(h.starts[0].proxies.length, 1);
    assert.equal(h.requests.length, 1);
    assert.equal(result[2]._googleCheck, undefined);
    h.context.$arguments.cache = false;
    await h.context.operator(structuredClone(aliases));
    assert.equal(h.requests.length, 2);
});
