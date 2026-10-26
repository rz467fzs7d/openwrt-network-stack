const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/parser.js`, 'utf8');

function harness(args = {}, getResponse = () => ({ status: 200, body: '' })) {
    const requests = [], starts = [], logs = [], store = new Map();
    let stops = 0;
    const context = {
        $arguments: args,
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
const nodes = () => ['JP Home', 'JP Office', 'HK Home'].map(name => ({ name, type: 'ss', server: 'example.com', port: 443 }));

test('upstream YouTube classifications and Play text extraction', () => {
    const { context: c } = harness();
    assert.equal(c.parseYoutubePremium('www.google.cn').status, 'cn');
    assert.equal(c.parseYoutubePremium('Premium is not available in your country').status, 'unavailable');
    assert.equal(c.parseYoutubePremium('ad-free "INNERTUBE_CONTEXT_GL": "JP"').region, 'JP');
    assert.equal(c.parseYoutubePremium('ad-free').region, 'UNKNOWN');
    assert.equal(c.parseYoutubePremium('captcha sorry unsupported_browser').status, 'unknown');
    assert.equal(c.parseYoutubePremium('').status, 'unknown');
    assert.equal(c.parseGooglePlay('<div class="yVZQTb">Japan (English)</div>').region, 'Japan ');
    assert.equal(c.parseGooglePlay('captcha').status, 'unknown');
    assert.equal(c.applyCompiledFormat({ _googleCheck: { play: { region: 'China ' } } }, c.compileFormat('{google_play_region}'), '-'), 'China');
});

test('cn marker attaches without a separator, only for explicit Chinese results', () => {
    const { context: c } = harness();
    const format = c.compileFormat('{prefix:ENET}{region}{i:2d}{tag}{cn}');
    const node = { region_code: 'HK', index: 2, tag: '' };
    const render = check => c.applyCompiledFormat({ ...node, _googleCheck: check }, format, '-');
    assert.equal(render({ play: { status: 'detected', region: 'China ' } }), 'ENET-HK-02*');
    assert.equal(render({ youtube: { status: 'cn' } }), 'ENET-HK-02*');
    assert.equal(render({ play: { status: 'detected', region: 'Hong Kong ' } }), 'ENET-HK-02');
    assert.equal(render({ youtube: { status: 'unavailable' }, play: { status: 'unknown' } }), 'ENET-HK-02');
    assert.equal(render(undefined), 'ENET-HK-02');
    assert.equal(c.applyCompiledFormat({ ...node, tag: 'Home', _googleCheck: { youtube: { status: 'cn' } } }, format, '-'), 'ENET-HK-02-Home*');
});

test('explicitly disabled; include/exclude apply to original names independently of GeoIP skip', async () => {
    const off = harness({ cn_check: '' }); await off.context.operator(nodes());
    assert.equal(off.requests.length, 0); assert.equal(off.starts.length, 0);
    const h = harness({ cn_check: 'JP', cn_check_exclude: 'Office', f: '{region}{youtube_region}' },
        opt => ({ status: 200, body: opt.url.includes('youtube') ? 'ad-free "INNERTUBE_CONTEXT_GL":"CN"' : '<div class="yVZQTb">China</div>' }));
    const result = await h.context.operator(nodes());
    assert.equal(h.starts.length, 1); assert.equal(h.starts[0].proxies.length, 1);
    assert.equal(h.requests.length, 2); assert.equal(h.stops, 1);
    assert.ok(h.requests.every(r => r.proxy === 'http://127.0.0.1:10000' && r.retries === 0));
    assert.equal(result[0]._googleCheck.youtube.region, 'CN');
    assert.equal(result[0].region_code, 'JP'); assert.equal(result[0]._failed, undefined);
    assert.equal(result[1]._googleCheck, undefined); assert.equal(result[2]._googleCheck, undefined);
    assert.ok(result[0].name.includes('CN'));
    await h.context.operator(nodes()); assert.equal(h.requests.length, 2);
    for (const [key, value] of h.store) if (key.startsWith('parser:google-check:')) value.checkedAt = 0;
    await h.context.operator(nodes()); assert.equal(h.requests.length, 4);
});

test('default scope checks only Hong Kong, Macao and Taiwan using existing region recognition', async () => {
    const h = harness();
    const input = ['HK-01', '澳门家宽', '台灣 01', '🇭🇰 Home', 'JP Home', 'Australia AU', 'US Home']
        .map(name => ({ name, type: 'ss', server: 'example.com', port: 443 }));
    const result = await h.context.operator(input);
    assert.equal(h.starts.length, 1);
    assert.equal(h.starts[0].proxies.length, 4);
    assert.equal(h.requests.length, 8);
    assert.ok(result.slice(0, 4).every(p => p._googleCheck));
    assert.ok(result.slice(4).every(p => !p._googleCheck));
});

test('bad scope fails before network; unmatched scope starts no META', async () => {
    const bad = harness({ cn_check: '[' });
    await assert.rejects(bad.context.operator(nodes()), /cn_check/);
    assert.equal(bad.starts.length, 0);
    const none = harness({ cn_check: 'US' }); await none.context.operator(nodes());
    assert.equal(none.starts.length, 0);
});

test('HTTP failures and exceptions remain unknown, never remove nodes; META stops', async () => {
    const h = harness({ cn_check: 'JP', cn_check_exclude: 'Office' }, opt => {
        if (opt.url.includes('youtube')) throw new Error('timeout');
        return { status: 403, body: 'www.google.cn' };
    });
    const result = await h.context.operator(nodes());
    assert.equal(result.length, 3); assert.equal(h.stops, 1);
    assert.equal(result[0]._googleCheck.youtube.status, 'unknown');
    assert.equal(result[0]._googleCheck.play.status, 'unknown');
    assert.equal(result[0]._failed, undefined);
    for (const [key, value] of h.store) if (key.startsWith('parser:google-check:')) value.checkedAt -= 11 * 60 * 1000;
    await h.context.operator(nodes()); assert.equal(h.requests.length, 4);
});

test('endpoint changes invalidate cache; disabling cache forces fresh checks', async () => {
    const response = opt => ({ status: 200, body: opt.url.includes('youtube') ? 'ad-free "INNERTUBE_CONTEXT_GL":"JP"' : '<div class="yVZQTb">Japan</div>' });
    const h = harness({ cn_check: '^JP Home$' }, response);
    await h.context.operator(nodes());
    const changed = nodes(); changed[0].server = 'new.example.com';
    await h.context.operator(changed); assert.equal(h.requests.length, 4);
    h.context.$arguments.cache = false;
    await h.context.operator(nodes()); assert.equal(h.requests.length, 6);
    const original = nodes(); original[2]._googleCheck = { stale: true };
    const result = await h.context.operator(original);
    assert.equal(result[2]._googleCheck, undefined);
});

test('explicit all scope obeys concurrency and META lease; flat endpoints do not inherit results', async () => {
    let active = 0, peak = 0;
    const h = harness({ cn_check: '.*', cn_check_concurrency: 1, flat: '{example.com:192.0.2.1}' }, async opt => {
        active++; peak = Math.max(peak, active);
        await new Promise(resolve => setImmediate(resolve)); active--;
        return { status: 200, body: opt.url.includes('youtube') ? 'www.google.cn' : '<div class="yVZQTb">China</div>' };
    });
    const result = await h.context.operator(nodes());
    assert.equal(h.starts[0].proxies.length, 3); assert.equal(peak, 1);
    assert.ok(h.starts[0].timeout >= 30000); assert.equal(h.stops, 1);
    assert.equal(result.length, 6);
    assert.ok(result.every(p => p.server === 'example.com' || p._googleCheck === undefined));
});

test('optional META startup failure leaves subscription intact with unknown checks', async () => {
    const h = harness({ cn_check: 'JP' });
    h.context.$substore.http.post = async () => { throw new Error('connection refused'); };
    const result = await h.context.operator(nodes());
    assert.equal(result.length, 3);
    assert.equal(result[0]._googleCheck.youtube.status, 'unknown');
    assert.equal(result[0]._googleCheck.youtube.reason, 'meta_failed');
    assert.equal(result[0]._failed, undefined);
    assert.equal(h.requests.length, 0);
});
