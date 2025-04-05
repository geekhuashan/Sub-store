const { type, name } = $arguments
const compatible_outbound = {
    tag: '兼容模式',
    type: 'direct',
}

let compatible
let config = JSON.parse($files[0])
let proxies = await produceArtifact({
    name,
    type: /^1$|col/i.test(type) ? 'collection' : 'subscription',
    platform: 'sing-box',
    produceType: 'internal',
})

config.outbounds.push(...proxies)

// 主要分组
config.outbounds.map(i => {
    // 自动测速组
    if (['Auto - UrlTest'].includes(i.tag)) {
        i.outbounds.push(...getTags(proxies))
    }
    // 全部节点组
    if (['Selector'].includes(i.tag)) {
        i.outbounds.push(...getTags(proxies))
    }
    // 美国手动组
    if (['🇺🇸 美国手动'].includes(i.tag)) {
        i.outbounds.push(...getTags(proxies, /美|us|unitedstates|united states|States|🇺🇸/i))
    }
    // 香港节点
    if (['🇭🇰 香港自动'].includes(i.tag)) {
        i.outbounds.push(...getTags(proxies, /港|hk|hongkong|kong kong|hong kong|Hong|🇭🇰/i))
    }
    // 台湾节点
    if (['🇨🇳 台湾自动'].includes(i.tag)) {
        i.outbounds.push(...getTags(proxies, /台|tw|taiwan|tai|🇨🇳|🇹🇼/i))
    }
    // 日本节点
    if (['🇯🇵 日本自动'].includes(i.tag)) {
        i.outbounds.push(...getTags(proxies, /日本|jp|japan|Japan|🇯🇵/i))
    }
    // 新加坡节点
    if (['🇸🇬 狮城自动'].includes(i.tag)) {
        i.outbounds.push(...getTags(proxies, /新|sg|singapore|Singapore|🇸🇬/i))
    }
    // 美国节点
    if (['🇺🇲 美国自动'].includes(i.tag)) {
        i.outbounds.push(...getTags(proxies, /美|us|unitedstates|united states|States|🇺🇸/i))
    }
    // 韩国节点
    if (['🇰🇷 韩国自动'].includes(i.tag)) {
        i.outbounds.push(...getTags(proxies, /韩|kr|korea|Korea|🇰🇷/i))
    }
})

// 配置各分组的代理节点
const mainGroups = ['Proxy', 'Domestic', 'Others', 'AI Suite', 'Netflix', 'Disney', 'YouTube', 'Spotify', 'Apple', 'Telegram', 'Microsoft']
for (const group of mainGroups) {
    const groupOutbound = config.outbounds.find(o => o.tag === group)
    if (groupOutbound && Array.isArray(groupOutbound.outbounds)) {
        // 确保这些组已经有基本节点，然后再添加其他节点
        if (group === 'Proxy' && !groupOutbound.outbounds.includes('Auto - UrlTest')) {
            groupOutbound.outbounds.unshift('Auto - UrlTest')
        }
    }
}

// 处理空分组问题
config.outbounds.forEach(outbound => {
    if (Array.isArray(outbound.outbounds) && outbound.outbounds.length === 0) {
        if (!compatible) {
            config.outbounds.push(compatible_outbound)
            compatible = true
        }
        outbound.outbounds.push(compatible_outbound.tag);
    }
});

$content = JSON.stringify(config, null, 2)

function getTags(proxies, regex) {
    return (regex ? proxies.filter(p => regex.test(p.tag)) : proxies).map(p => p.tag)
}