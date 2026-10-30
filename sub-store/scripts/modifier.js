/**
 * Sub-Store node connection modifier.
 * Parameters: scope, exclude, type, host, sni, path, port, method, prefix, suffix.
 * No options means no changes. Certificate verification is never changed.
 */
function operator(proxies = []) {
    const args = typeof $arguments === 'object' && $arguments ? $arguments : {};
    function pattern(value, label) {
        if (value == null || value === '') return null;
        try { return new RegExp(String(value), 'i'); }
        catch (_) { throw new Error(`Invalid ${label} regular expression`); }
    }
    const scope = pattern(args.scope, 'scope');
    const exclude = pattern(args.exclude, 'exclude');
    const types = new Set(String(args.type ?? '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
    const configured = key => args[key] != null && String(args[key]) !== '';
    const text = key => String(args[key] ?? '').trim();
    let port;
    if (configured('port')) {
        if (!/^\d+$/.test(String(args.port))) throw new Error('Invalid port');
        port = Number(args.port);
        if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
    }
    if (configured('path') && !text('path').startsWith('/')) throw new Error('Invalid path');
    if (configured('method') && !/^[A-Za-z]+$/.test(text('method'))) throw new Error('Invalid method');
    const active = ['host', 'sni', 'path', 'port', 'method'].some(configured);
    if (!active) return proxies;
    let changed = 0;
    const output = proxies.map(proxy => {
        const name = String(proxy.name ?? '');
        const type = String(proxy.type ?? '').toLowerCase();
        if ((scope && !scope.test(name)) || (exclude && exclude.test(name)) || (types.size && !types.has(type))) return proxy;
        const p = JSON.parse(JSON.stringify(proxy));
        let modified = false;
        const set = (object, key, value) => {
            if (object[key] !== value) { object[key] = value; modified = true; }
        };
        const setShape = (object, key, value) => {
            const next = Array.isArray(object[key]) ? [value] : value;
            if (JSON.stringify(object[key]) !== JSON.stringify(next)) { object[key] = next; modified = true; }
        };
        if (port != null) set(p, 'port', port);
        const net = String(p.network ?? '').toLowerCase();
        if (configured('sni')) {
            const secure = p.tls === true || p['reality-opts'] || ['trojan','anytls','hysteria2','tuic'].includes(type);
            if (secure) {
                set(p, 'sni', text('sni'));
                if (['vmess','vless'].includes(type)) set(p, 'servername', text('sni'));
            } else if (type === 'ss' && p.plugin === 'shadow-tls') {
                p['plugin-opts'] ||= {}; set(p['plugin-opts'], 'host', text('sni'));
            } else if (p['shadow-tls-password']) set(p, 'shadow-tls-sni', text('sni'));
        }
        if (configured('host')) {
            const host = text('host');
            if (type === 'snell' && p['obfs-opts']) set(p['obfs-opts'], 'host', host);
            else if (type === 'ss' && p['plugin-opts'] && p.plugin !== 'shadow-tls') set(p['plugin-opts'], 'host', host);
            else if (['vmess','vless','trojan'].includes(type) && net === 'ws') {
                p['ws-opts'] ||= {}; p['ws-opts'].headers ||= {};
                const headers = p['ws-opts'].headers;
                set(headers, Object.keys(headers).find(k => k.toLowerCase() === 'host') || 'Host', host);
            } else if (['vmess','vless'].includes(type) && net === 'h2') {
                p['h2-opts'] ||= {}; setShape(p['h2-opts'], 'host', host);
            } else if (['vmess','vless'].includes(type) && net === 'http') {
                p['http-opts'] ||= {}; p['http-opts'].headers ||= {};
                const headers = p['http-opts'].headers;
                setShape(headers, Object.keys(headers).find(k => k.toLowerCase() === 'host') || 'Host', host);
            } else if (type === 'vless' && net === 'xhttp') {
                p['xhttp-opts'] ||= {}; set(p['xhttp-opts'], 'host', host);
            }
        }
        if (configured('path')) {
            const field = ({ ws:'ws-opts', h2:'h2-opts', http:'http-opts', xhttp:'xhttp-opts' })[net];
            if (field && ['vmess','vless','trojan'].includes(type)) { p[field] ||= {}; setShape(p[field], 'path', text('path')); }
        }
        if (configured('method') && net === 'http' && ['vmess','vless'].includes(type)) {
            p['http-opts'] ||= {}; set(p['http-opts'], 'method', text('method').toUpperCase());
        }
        if (!modified) return proxy;
        p.name = `${args.prefix ?? ''}${name}${args.suffix ?? ''}`;
        changed++;
        return p;
    });
    if (typeof $substore !== 'undefined') $substore.info(`[NODE-OVERRIDES] changed=${changed}/${proxies.length}`);
    return output;
}
