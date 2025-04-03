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
let config;
try {
    if (!$files || !$files[0]) {
        throw new Error('模板文件不存在');
    }
    config = JSON.parse($files[0]);
} catch (e) {
    console.log(`[📦 sing-box] 错误: 解析模板失败: ${e.message}`);
    // 使用空配置作为后备
    config = { outbounds: [] };
}
let fallbackAdded = false;

// 获取节点
let proxies = produceArtifact({
    name: subName,
    type: /^1$|col/i.test(subTypeStr) ? "collection" : "subscription",
    platform: "sing-box",
    produceType: "internal",
}) || [];

// 确保proxies是一个数组
if (!Array.isArray(proxies)) {
    console.log(`[📦 sing-box] 警告: 获取到的代理不是数组，转换为数组`);
    proxies = proxies ? [proxies] : [];
}

// 添加代理节点到outbounds
config.outbounds.push(...proxies);

// 填充预定义的组
const proxyNodeTags = proxies.filter(node => node && node.tag).map(node => node.tag);
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
        try {
            // 使用更简单的方法本地过滤
            const excludeRegex = /(\u6e2f|hk|hongkong|hong kong|\u53f0|tw|taiwan|\u65e5|jp|japan|\u65b0|sg|singapore|\u7f8e|us|unitedstates|united states|\u97e9|kr|korea|\ud83c\udded\ud83c\uddf0|\ud83c\uddf9\ud83c\uddfc|\ud83c\uddef\ud83c\uddf5|\ud83c\uddf8\ud83c\uddec|\ud83c\uddfa\ud83c\uddf8|\ud83c\uddf0\ud83c\uddf7)/i;
            const otherTags = proxies
                .filter(node => node && node.tag && !excludeRegex.test(node.tag))
                .map(node => node.tag);
            outbound.outbounds.push(...otherTags);
        } catch (e) {
            console.log(`[📦 sing-box] 错误: 处理其他节点失败: ${e.message}`);
        }
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

// 检查配置是否有效
if (!config || !config.outbounds || !Array.isArray(config.outbounds)) {
    console.log(`[📦 sing-box] 错误: 无效的配置文件结构`);
    config = config || {};
    config.outbounds = config.outbounds || [];
}

// 返回最终配置
try {
    $content = JSON.stringify(config, null, 2);
} catch (e) {
    console.log(`[📦 sing-box] 错误: 配置序列化失败: ${e.message}`);
    $content = JSON.stringify({ error: e.message });
}

// 辅助函数：根据正则过滤节点并返回标签
function getTags(proxies, regex) {
    // 确保proxies是数组
    if (!Array.isArray(proxies)) {
        console.log(`[📦 sing-box] 警告: getTags接收到非数组参数`);
        return [];
    }
    try {
        return (regex ? proxies.filter(p => p && p.tag && regex.test(p.tag)) : proxies)
            .filter(p => p && p.tag) // 确保每项都有tag属性
            .map(p => p.tag);
    } catch (e) {
        console.log(`[📦 sing-box] 错误: getTags执行失败: ${e.message}`);
        return [];
    }
}