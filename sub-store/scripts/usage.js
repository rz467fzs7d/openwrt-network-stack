// 合并组合订阅中单条订阅的流量 仅做流量加法
// 旧版是拉取订阅的时候 去写入流量信息 所以可能是下一次才会在客户端里看到新的流量信息
// 新版 后端 >= 2.20.69 是实时的

async function operator(proxies = [], targetPlatform, context) {
  const SUBS_KEY = 'subs'
  const COLLECTIONS_KEY = 'collections'
  const $ = $substore
  const { source } = context
  const { _collection: collection } = source
  if (!collection || Object.keys(source).length > 1) throw new Error('暂时仅支持组合订阅, 请在组合订阅中使用此脚本')

  const allSubs = $.read(SUBS_KEY) || []
  const { parseFlowHeaders, getFlowHeaders, normalizeFlowHeader } = flowUtils

  // 构建订阅名 Set（O(1) 查找）
  const subnames = new Set([...collection.subscriptions])
  const subscriptionTags = collection.subscriptionTags
  if (Array.isArray(subscriptionTags) && subscriptionTags.length > 0) {
    allSubs.forEach(sub => {
      if (
        Array.isArray(sub.tag) &&
        sub.tag.length > 0 &&
        !subnames.has(sub.name) &&
        sub.tag.some(tag => subscriptionTags.includes(tag))
      ) {
        subnames.add(sub.name)
      }
    })
  }

  let uploadSum = 0
  let downloadSum = 0
  let totalSum = 0
  let expire

  for await (const sub of allSubs) {
    if (!subnames.has(sub.name)) continue

    let subInfo
    let flowInfo

    // 从 URL 片段解析参数（仅远程订阅需要）
    if (sub.source !== 'local' || ['localFirst', 'remoteFirst'].includes(sub.mergeSources)) {
      try {
        const urlParts = `${sub.url}`.split(/[\r\n]+/).map(i => i.trim()).filter(i => i.length)
        const rawUrl = urlParts[0] || ''
        const rawArgs = rawUrl.split('#')
        const url = rawArgs[0]

        if (rawArgs.length > 1) {
          let fragArgs = {}
          try {
            fragArgs = JSON.parse(decodeURIComponent(rawArgs[1]))
          } catch (_) {
            for (const pair of rawArgs[1].split('&')) {
              const [key, value] = pair.split('=')
              fragArgs[key] = value == null || value === '' ? true : decodeURIComponent(value)
            }
          }
          if (!fragArgs.noFlow && /^https?/.test(url)) {
            flowInfo = await getFlowHeaders(
              fragArgs.insecure ? `${url}#insecure` : url,
              fragArgs.flowUserAgent,
              undefined,
              sub.proxy,
              fragArgs.flowUrl
            )
            if (flowInfo) {
              const headers = normalizeFlowHeader(flowInfo, true)
              if (headers?.['subscription-userinfo']) {
                subInfo = headers['subscription-userinfo']
              }
            }
          }
        }
      } catch (err) {
        $.error(`订阅 ${sub.name} 获取流量信息时发生错误: ${err?.message || String(err)}`)
      }
    }

    // 自定义流量链接
    if (sub.subUserinfo) {
      let subUserInfo
      try {
        subUserInfo = /^https?:\/\//.test(sub.subUserinfo)
          ? await getFlowHeaders(undefined, undefined, undefined, sub.proxy, sub.subUserinfo)
          : sub.subUserinfo
      } catch (e) {
        $.error(`订阅 ${sub.name} 使用自定义流量链接 ${sub.subUserinfo} 获取流量信息时发生错误: ${e.message}`)
      }
      const headers = normalizeFlowHeader([subUserInfo, flowInfo].filter(Boolean).join(';'), true)
      if (headers?.['subscription-userinfo']) {
        subInfo = headers['subscription-userinfo']
      }
    }

    // 累加
    if (subInfo) {
      const { total, usage: { upload, download }, expires } = parseFlowHeaders(subInfo)
      if (upload > 0) uploadSum += upload
      if (download > 0) downloadSum += download
      if (total > 0) totalSum += total
      if (expires && expires * 1000 > Date.now()) {
        expire = expire ? Math.min(expire, expires) : expires
      }
    }
  }

  const subUserInfo = `upload=${uploadSum}; download=${downloadSum}; total=${totalSum}${expire ? ` ; expire=${expire}` : ''}`

  // 旧版写入
  const allCols = $.read(COLLECTIONS_KEY) || []
  const colIdx = allCols.findIndex(c => c.name === collection.name)
  if (colIdx >= 0 && allCols[colIdx].subUserinfo !== subUserInfo) {
    allCols[colIdx].subUserinfo = subUserInfo
    $.write(allCols, COLLECTIONS_KEY)
  }

  // 新版直接加到响应头
  if ($options) {
    $options._res = {
      headers: { 'subscription-userinfo': subUserInfo },
    }
  }

  return proxies
}
