const { type, name } = $arguments
const compatible_outbound = {
    tag: '🔄 兼容模式',
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

config.outbounds.map(i => {
    if (['🌐 其他节点', '♻️ 自动选择'].includes(i.tag)) {
        i.outbounds.push(...getTags(proxies))
    }
    if (['🇭🇰 香港自动'].includes(i.tag)) {
        i.outbounds.push(...getTags(proxies, /港|hk|hongkong|kong kong|hong kong|Hong|🇭🇰/i))
    }
    if (['🇨🇳 台湾自动'].includes(i.tag)) {
        i.outbounds.push(...getTags(proxies, /台|tw|taiwan|tai|🇨🇳|🇹🇼/i))
    }
    if (['🇯🇵 日本自动'].includes(i.tag)) {
        i.outbounds.push(...getTags(proxies, /日本|jp|japan|Japan|🇯🇵/i))
    }
    if (['🇸🇬 狮城自动'].includes(i.tag)) {
        i.outbounds.push(...getTags(proxies, /新|sg|singapore|Singapore|🇸🇬/i))
    }
    if (['🇺🇲 美国节点', '🇺🇲 美国自动'].includes(i.tag)) {
        i.outbounds.push(...getTags(proxies, /美|us|unitedstates|united states|States|🇺🇸/i))
    }
    if (['🇰🇷 韩国节点', '🇰🇷 韩国自动'].includes(i.tag)) {
        i.outbounds.push(...getTags(proxies, /韩|kr|korea|Korea|🇰🇷/i))
    }
})

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