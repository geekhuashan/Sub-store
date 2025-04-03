/**
 * 兼容SubStore的Sing-box模板脚本
 * 用于处理和填充Sing-box配置模板的节点和分组
 */

// 从参数中获取订阅类型和名称
const params = $arguments || {};
const subTypeStr = params.type || "1"; // 默认为1 (profile/collection)
const subName = params.name || ""; // 订阅/合集名称
const fallbackTag = params.fallback_tag || "DIRECT"; // 默认回退出站

// 定义一个备用出站，用于空组
const fallback_outbound = {
    tag: fallbackTag,
    type: "direct",
};

// 解析基础模板
let config = JSON.parse($files[0]);
let fallbackAdded = false;

// 获取节点
let proxies = produceArtifact({
    name: subName,
    type: /^1$|col/i.test(subTypeStr) ? "collection" : "subscription",
    platform: "sing-box",
    produceType: "internal",
});

// 添加代理节点到outbounds
config.outbounds.push(...proxies);

// 填充预定义的组
const proxyNodeTags = proxies.map(node => node.tag);
console.log(`[📦 sing-box] 找到 ${proxyNodeTags.length} 个代理节点`);

// 填充地区节点组
config.outbounds.forEach(outbound => {
    if (outbound.tag === "🇭🇰 香港节点" && Array.isArray(outbound.outbounds)) {
        outbound.outbounds.push(...getTags(proxies, /港|hk|hongkong|hong kong|🇭🇰/i));
        console.log(`[📦 sing-box] 填充组 "${outbound.tag}" 节点数: ${outbound.outbounds.length}`);
    }
    else if (outbound.tag === "🇨🇳 台湾节点" && Array.isArray(outbound.outbounds)) {
        outbound.outbounds.push(...getTags(proxies, /台|tw|taiwan|🇹🇼/i));
        console.log(`[📦 sing-box] 填充组 "${outbound.tag}" 节点数: ${outbound.outbounds.length}`);
    }
    else if (outbound.tag === "🇯🇵 日本节点" && Array.isArray(outbound.outbounds)) {
        outbound.outbounds.push(...getTags(proxies, /日|jp|japan|🇯🇵/i));
        console.log(`[📦 sing-box] 填充组 "${outbound.tag}" 节点数: ${outbound.outbounds.length}`);
    }
    else if (outbound.tag === "🇸🇬 狮城节点" && Array.isArray(outbound.outbounds)) {
        outbound.outbounds.push(...getTags(proxies, /新|sg|singapore|🇸🇬/i));
        console.log(`[📦 sing-box] 填充组 "${outbound.tag}" 节点数: ${outbound.outbounds.length}`);
    }
    else if (outbound.tag === "🇺🇲 美国节点" && Array.isArray(outbound.outbounds)) {
        outbound.outbounds.push(...getTags(proxies, /美|us|unitedstates|united states|🇺🇸/i));
        console.log(`[📦 sing-box] 填充组 "${outbound.tag}" 节点数: ${outbound.outbounds.length}`);
    }
    else if (outbound.tag === "🇰🇷 韩国节点" && Array.isArray(outbound.outbounds)) {
        outbound.outbounds.push(...getTags(proxies, /韩|kr|korea|🇰🇷/i));
        console.log(`[📦 sing-box] 填充组 "${outbound.tag}" 节点数: ${outbound.outbounds.length}`);
    }
    else if (outbound.tag === "🌐 其他节点" && Array.isArray(outbound.outbounds)) {
        // 其他节点: 匹配所有不在其他分组中的节点
        outbound.outbounds.push(...getTags(proxies, /^(?!.*(港|hk|hongkong|台|tw|taiwan|日|jp|japan|新|sg|singapore|美|us|unitedstates|韩|kr|korea|🇭🇰|🇹🇼|🇯🇵|🇸🇬|🇺🇸|🇰🇷))/i));
        console.log(`[📦 sing-box] 填充组 "${outbound.tag}" 节点数: ${outbound.outbounds.length}`);
    }
    else if (outbound.tag === "♻️ 自动选择" && Array.isArray(outbound.outbounds)) {
        // 自动选择: 使用所有节点
        outbound.outbounds.push(...proxyNodeTags);
        console.log(`[📦 sing-box] 填充组 "${outbound.tag}" 节点数: ${outbound.outbounds.length}`);
    }
    else if (outbound.tag === "🚀 手动切换" && Array.isArray(outbound.outbounds)) {
        // 手动切换: 使用所有节点
        outbound.outbounds.push(...proxyNodeTags);
        if (outbound.type === "selector" && proxyNodeTags.length > 0 && !outbound.default) {
            outbound.default = proxyNodeTags[0];
        }
        console.log(`[📦 sing-box] 填充组 "${outbound.tag}" 节点数: ${outbound.outbounds.length}`);
    }
});

// 处理空组
config.outbounds.forEach(outbound => {
    if (Array.isArray(outbound.outbounds) && outbound.outbounds.length === 0 &&
        ['selector', 'urltest', 'loadbalance'].includes(outbound.type)) {
        // 添加fallback到outbounds列表(如果需要)
        if (!fallbackAdded && !config.outbounds.some(o => o.tag === fallbackTag)) {
            if (fallbackTag !== 'DIRECT' && fallbackTag !== 'REJECT' && fallbackTag !== 'DNS-OUT') {
                const insertIndex = config.outbounds.findIndex(o => o.tag === 'DNS-OUT') + 1 || 3;
                config.outbounds.splice(insertIndex, 0, fallback_outbound);
                fallbackAdded = true;
                console.log(`[📦 sing-box] 添加备用出站 "${fallbackTag}"`);
            }
        }

        // 添加fallback到空组
        outbound.outbounds.push(fallbackTag);
        if (outbound.type === "selector") {
            outbound.default = fallbackTag;
        }
        console.log(`[📦 sing-box] 组 "${outbound.tag}" 为空，添加备用出站 "${fallbackTag}"`);
    }
});

// 调整主代理选择器
const mainProxySelector = config.outbounds.find(o => o.tag === '🪜 Proxy');
if (mainProxySelector && mainProxySelector.type === 'selector') {
    const originalProxyOutbounds = mainProxySelector.outbounds;
    mainProxySelector.outbounds = originalProxyOutbounds.filter(tag => {
        if (tag === 'DIRECT') return true; // 始终保留DIRECT
        const referencedGroup = config.outbounds.find(g => g.tag === tag);
        return referencedGroup &&
            Array.isArray(referencedGroup.outbounds) &&
            referencedGroup.outbounds.length > 0 &&
            referencedGroup.outbounds[0] !== fallbackTag;
    });

    // 如果没有代理节点，移除自动和手动选择
    if (proxyNodeTags.length === 0) {
        mainProxySelector.outbounds = mainProxySelector.outbounds.filter(
            tag => tag !== '♻️ 自动选择' && tag !== '🚀 手动切换'
        );
    }

    // 设置主选择器默认值
    mainProxySelector.default = proxyNodeTags.length > 0 ? '♻️ 自动选择' : 'DIRECT';
    console.log(`[📦 sing-box] 调整主选择器 "${mainProxySelector.tag}" 默认值: "${mainProxySelector.default}"`);
}

// 返回最终配置
$content = JSON.stringify(config, null, 2);

// 辅助函数：根据正则过滤节点并返回标签
function getTags(proxies, regex) {
    return (regex ? proxies.filter(p => regex.test(p.tag)) : proxies).map(p => p.tag);
}