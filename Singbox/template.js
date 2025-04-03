/**
 * Sub-Store Script to Populate Sing-box Template Outbounds
 */

function run() {
    // --- 常量与默认值 ---
    const DEFAULT_FALLBACK_TAG = 'DIRECT';

    // --- 辅助函数 ---
    function parseParameters(paramString = (typeof $substore !== 'undefined' && $substore.getParameters) ? $substore.getParameters() : window.location.hash) {
        const params = {};
        if (paramString.startsWith('#')) {
            paramString = paramString.substring(1);
        }
        paramString.split('&').forEach(pair => {
            const parts = pair.split('=');
            if (parts.length === 2) {
                params[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
            }
        });
        return params;
    }

    function parseOutboundRules(rulesStr) {
        if (!rulesStr) return [];
        const rules = [];
        rulesStr.split('🕳️').forEach(rulePart => {
            const parts = rulePart.split('🏷️');
            if (parts.length === 2) {
                const groupName = parts[0];
                const filterDefinition = parts[1];
                const filterParts = filterDefinition.split(':');
                let filterType = filterParts[0].toLowerCase();
                let filterValue = filterParts.length > 1 ? filterParts.slice(1).join(':') : '';
                let caseInsensitive = false;

                if (filterType === 'all') {
                    rules.push({ groupName: groupName, type: 'all' });
                    return;
                }

                if (filterValue.startsWith('ℹ️')) {
                    caseInsensitive = true;
                    filterValue = filterValue.substring(2);
                }

                if (filterType === 'kw') {
                    rules.push({ groupName: groupName, type: 'keywords', filter: filterValue.split('|'), caseInsensitive: caseInsensitive });
                } else if (filterType === 'rgx') {
                    try {
                        rules.push({ groupName: groupName, type: 'regex', filter: new RegExp(filterValue, caseInsensitive ? 'i' : undefined) });
                    } catch (e) {
                        console.error(`Invalid regex for group "${groupName}": ${filterValue}`, e);
                    }
                } else {
                    console.warn(`Unsupported filter type "${filterType}" for group "${groupName}". Skipping.`);
                }
            } else {
                console.warn(`Invalid rule part "${rulePart}". Skipping.`);
            }
        });
        return rules;
    }

    function filterNodesByRule(nodes, rule) {
        if (!Array.isArray(nodes)) return [];
        if (rule.type === 'all') {
            return nodes;
        }

        return nodes.filter(node => {
            if (!node || !node.tag) return false;
            const tag = node.tag;

            if (rule.type === 'keywords') {
                const keywords = rule.filter;
                if (rule.caseInsensitive) {
                    const lowerTag = tag.toLowerCase();
                    return keywords.some(keyword => lowerTag.includes(keyword.toLowerCase()));
                } else {
                    return keywords.some(keyword => tag.includes(keyword));
                }
            } else if (rule.type === 'regex') {
                return rule.filter.test(tag);
            }
            return false;
        });
    }

    function log(v) {
        console.log(`[📦 sing-box 模板脚本 v2] ${v}`);
    }

    // --- 主脚本逻辑 ---
    try {
        // 1. 获取输入和参数
        const params = parseParameters();
        log(`Raw parameters: ${JSON.stringify(params)}`);

        const subTypeNum = params.type ? parseInt(params.type, 10) : null;
        const subName = params.name;
        const subUrl = params.url;
        const outboundRulesStr = params.outbound;
        const fallbackTag = params.fallback_tag || DEFAULT_FALLBACK_TAG;
        const includeUnsupported = params.includeUnsupportedProxy === 'true';

        // 验证必要参数
        if (!subUrl && (subTypeNum === null || (subTypeNum !== 0 && subTypeNum !== 1))) {
            throw new Error("Missing or invalid 'type' parameter (must be 0 or 1 if 'url' is not provided).");
        }
        if (!subUrl && !subName) {
            throw new Error("Missing 'name' parameter (required if 'url' is not provided).");
        }
        if (!outboundRulesStr) {
            throw new Error("Missing 'outbound' parameter.");
        }

        const subType = subUrl ? 'url' : (subTypeNum === 0 ? 'subscription' : 'profile');
        const rules = parseOutboundRules(outboundRulesStr);
        if (rules.length === 0) {
            console.warn("No valid outbound rules parsed. Groups might remain empty.");
        }
        log(`Parsed ${rules.length} outbound rules.`);

        // 2. 获取节点 - 使用同步方式
        let allNodes = [];

        if (typeof $substore !== 'undefined' && $substore.fetchNodes) {
            if (subUrl) {
                log(`Fetching nodes from URL: ${subUrl}`);
                allNodes = $substore.fetchNodesSync({ url: subUrl, includeUnsupportedProxy: includeUnsupported });
            } else {
                log(`Fetching nodes for ${subType}: ${subName}`);
                allNodes = $substore.fetchNodesSync({ type: subType, name: subName, includeUnsupportedProxy: includeUnsupported });
            }
        }

        if (!Array.isArray(allNodes)) {
            throw new Error("Failed to fetch nodes or received invalid data format.");
        }
        log(`Fetched ${allNodes.length} nodes.`);

        const proxyNodes = allNodes.filter(node => node && node.tag && !['direct', 'block', 'dns'].includes(node.type));
        const proxyNodeTags = proxyNodes.map(node => node.tag);
        log(`Found ${proxyNodeTags.length} proxy nodes.`);

        // 3. 获取并解析基础模板
        const baseTemplateStr = (typeof $substore !== 'undefined' && $substore.getBaseContent)
            ? $substore.getBaseContent()
            : '{}';
        let config = {};
        try {
            config = JSON.parse(baseTemplateStr);
        } catch (e) {
            throw new Error(`Base template is not valid JSON: ${e.message}`);
        }

        if (!Array.isArray(config.outbounds)) {
            console.warn("Base template does not have an 'outbounds' array. Creating one.");
            config.outbounds = [];
        }

        // 4. 填充模板中预定义的组
        const groupTagsInTemplate = new Set(config.outbounds.map(o => o.tag));
        let groupsPopulatedCount = 0;

        rules.forEach(rule => {
            if (!groupTagsInTemplate.has(rule.groupName)) {
                console.warn(`Rule defined for group "${rule.groupName}", but this tag was not found in the template's outbounds. Skipping.`);
                return;
            }

            const targetGroup = config.outbounds.find(o => o.tag === rule.groupName);
            if (!targetGroup) {
                console.warn(`Could not find group object for tag "${rule.groupName}" even though tag exists. Skipping.`);
                return;
            }

            if (!Array.isArray(targetGroup.outbounds)) {
                targetGroup.outbounds = [];
            }

            const filteredNodes = filterNodesByRule(proxyNodes, rule);
            const filteredTags = filteredNodes.map(node => node.tag);

            if (filteredTags.length > 0) {
                targetGroup.outbounds = filteredTags;
                log(`Populated group "${rule.groupName}" with ${filteredTags.length} nodes matching rule type '${rule.type}'.`);

                if (targetGroup.type === 'selector' && !targetGroup.default) {
                    targetGroup.default = filteredTags[0];
                    log(`Set default for selector "${rule.groupName}" to "${filteredTags[0]}".`);
                }
                groupsPopulatedCount++;
            } else {
                log(`No nodes matched rule for group "${rule.groupName}". Leaving its 'outbounds' empty for now.`);
            }
        });

        log(`Finished initial population pass. ${groupsPopulatedCount} groups populated with nodes.`);

        // 5. 处理空组和调整主选择器
        let fallbackAdded = false;
        config.outbounds.forEach(group => {
            if (['selector', 'urltest', 'loadbalance'].includes(group.type)) {
                if (!Array.isArray(group.outbounds) || group.outbounds.length === 0) {
                    log(`Group "${group.tag}" is empty. Adding fallback tag "${fallbackTag}".`);
                    group.outbounds = [fallbackTag];

                    if (group.type === 'selector') {
                        group.default = fallbackTag;
                    }
                    fallbackAdded = true;
                }
            }
        });

        if (fallbackAdded && !config.outbounds.some(o => o.tag === fallbackTag)) {
            if (fallbackTag !== 'DIRECT' && fallbackTag !== 'REJECT' && fallbackTag !== 'DNS-OUT') {
                log(`Adding definition for fallback tag "${fallbackTag}" (type: direct).`);
                const insertIndex = config.outbounds.findIndex(o => o.tag === 'DNS-OUT') + 1 || 3;
                config.outbounds.splice(insertIndex, 0, { tag: fallbackTag, type: 'direct' });
            } else {
                log(`Fallback tag "${fallbackTag}" is a basic type, no definition needed.`);
            }
        }

        const mainProxySelector = config.outbounds.find(o => o.tag === '🪜 Proxy');
        if (mainProxySelector && mainProxySelector.type === 'selector') {
            const originalProxyOutbounds = mainProxySelector.outbounds;
            mainProxySelector.outbounds = originalProxyOutbounds.filter(tag => {
                if (tag === 'DIRECT') return true;
                const referencedGroup = config.outbounds.find(g => g.tag === tag);
                return referencedGroup && Array.isArray(referencedGroup.outbounds) && referencedGroup.outbounds.length > 0 && referencedGroup.outbounds[0] !== fallbackTag;
            });

            if (proxyNodeTags.length === 0) {
                mainProxySelector.outbounds = mainProxySelector.outbounds.filter(tag => tag !== '♻️ 自动选择' && tag !== '🚀 手动切换');
            }

            mainProxySelector.default = proxyNodeTags.length > 0 ? '♻️ 自动选择' : 'DIRECT';
            log(`Adjusted main selector "${mainProxySelector.tag}" outbounds. Default set to "${mainProxySelector.default}".`);
        }

        // 6. 添加代理节点到末尾
        config.outbounds.push(...proxyNodes);
        log(`Added ${proxyNodes.length} proxy node definitions to the end of the outbounds list.`);

        // 7. 返回最终的JSON字符串
        log("Script finished successfully.");
        return JSON.stringify(config, null, 2);

    } catch (error) {
        log(`Error generating Sing-box configuration: ${error}`);
        console.error("Error generating Sing-box configuration:", error);
        return JSON.stringify({
            error: `Script execution failed: ${error.message || error}`,
            details: error.stack
        }, null, 2);
    }
}

// 主函数调用 - 不使用async/await
var result = run();
result;