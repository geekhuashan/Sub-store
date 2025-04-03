/**
 * Sub-Store Script to Populate Sing-box Template Outbounds
 *
 * Description:
 * Reads a base Sing-box template containing predefined policy groups (with empty 'outbounds').
 * Fetches nodes from a specified Sub-Store subscription/profile.
 * Populates the 'outbounds' array of the predefined groups based on filtering rules.
 * Adds fetched nodes to the main 'outbounds' list.
 *
 * Required Parameters (passed via URL fragment #):
 * - type=0|1        (Required): 0 for single subscription, 1 for profile.
 * - name=<name>     (Required): The exact name of the subscription or profile in Sub-Store.
 * - outbound=<rules> (Required): Rules for populating groups. Format:
 * GroupName1🏷️FilterType:FilterValue|all🕳️GroupName2🏷️FilterType:FilterValue...
 * - GroupName: MUST exactly match the 'tag' of a policy group in the base template.
 * - FilterType: 'kw' (keywords, pipe-separated), 'rgx' (regex), or 'all' (use all proxy nodes, FilterValue is ignored).
 * - FilterValue: Keywords or regex pattern. Ignored if FilterType is 'all'.
 * - Case Insensitive: Add 'ℹ️' prefix to FilterValue for case-insensitivity (e.g., kw:ℹ️hk|hong kong).
 * Example: 🇭🇰 香港节点🏷️kw:🇭🇰|港|Hong|HK🕳️♻️ 自动选择🏷️all🕳️🌐 其他节点🏷️rgx:(?i)^(?!.*(?:🇭🇰|港|TW))
 * - fallback_tag=<tag> (Optional): Tag to use for empty groups. Default: DIRECT.
 * - includeUnsupportedProxy=true|false (Optional): Include SSR etc. Default: false.
 * - url=<encoded_url> (Optional): Fetch nodes directly from a URL instead of Sub-Store profile/sub.
 *
 * Base Template Expectation:
 * Expects a valid JSON string containing predefined 'outbounds' array with policy group objects
 * (like selectors, url-tests) having empty 'outbounds' arrays ready to be populated.
 * Script also adds fetched proxy nodes at the end of the main 'outbounds' array.
 *
 * Sub-Store API Assumptions (PLACEHOLDERS - MUST BE ADAPTED):
 * - $substore.getParameters(): Returns URL fragment parameters as an object.
 * - $substore.getBaseContent(): Returns the base template string.
 * - $substore.fetchNodes({ type: 'subscription' | 'profile', name: string }): Returns array of node objects.
 * - $substore.fetchNodes({ url: string }): Returns array of node objects from URL.
 * - console.log(), console.warn(), console.error(): For logging.
 */

(() => {
    // --- Constants & Defaults ---
    const DEFAULT_FALLBACK_TAG = 'DIRECT'; // Use DIRECT as default fallback

    // --- Helper Functions ---
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

    // Parses "GroupName🏷️FilterType:FilterValue|all🕳️..."
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
                let filterValue = filterParts.length > 1 ? filterParts.slice(1).join(':') : ''; // Handle potential colons in regex
                let caseInsensitive = false;

                if (filterType === 'all') {
                    rules.push({ groupName: groupName, type: 'all' });
                    return; // Skip further processing for 'all'
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

    // Filters nodes based on a rule object
    function filterNodesByRule(nodes, rule) {
        if (!Array.isArray(nodes)) return [];
        if (rule.type === 'all') {
            return nodes; // Return all nodes for 'all' type
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

    // --- Main Script Logic ---
    try {
        // 1. Get Inputs & Parameters
        // ADAPT: Use the actual Sub-Store function to get parameters
        const params = parseParameters();
        log(`Raw parameters: ${JSON.stringify(params)}`);

        const subTypeNum = params.type ? parseInt(params.type, 10) : null;
        const subName = params.name;
        const subUrl = params.url; // Optional URL parameter
        const outboundRulesStr = params.outbound;
        const fallbackTag = params.fallback_tag || DEFAULT_FALLBACK_TAG;
        const includeUnsupported = params.includeUnsupportedProxy === 'true';

        // Validate required parameters (either name/type or url must be provided)
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

        // 2. Fetch Nodes
        let fetchPromise;
        if (subUrl) {
            log(`Fetching nodes from URL: ${subUrl}`);
            // ADAPT: Use the actual Sub-Store function to fetch from URL
            fetchPromise = (typeof $substore !== 'undefined' && $substore.fetchNodes)
                ? $substore.fetchNodes({ url: subUrl, includeUnsupportedProxy: includeUnsupported })
                : Promise.resolve([]); // Placeholder
        } else {
            log(`Fetching nodes for ${subType}: ${subName}`);
            // ADAPT: Use the actual Sub-Store function to fetch by type/name
            fetchPromise = (typeof $substore !== 'undefined' && $substore.fetchNodes)
                ? $substore.fetchNodes({ type: subType, name: subName, includeUnsupportedProxy: includeUnsupported })
                : Promise.resolve([]); // Placeholder
        }

        const allNodes = await fetchPromise;

        if (!Array.isArray(allNodes)) {
            throw new Error("Failed to fetch nodes or received invalid data format.");
        }
        log(`Fetched ${allNodes.length} nodes.`);

        const proxyNodes = allNodes.filter(node => node && node.tag && !['direct', 'block', 'dns'].includes(node.type));
        const proxyNodeTags = proxyNodes.map(node => node.tag);
        log(`Found ${proxyNodeTags.length} proxy nodes.`);

        // 3. Get and Parse Base Template
        // ADAPT: Use the actual Sub-Store function to get base content
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

        // 4. Populate Predefined Groups in Template
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
                return; // Should not happen if tag exists, but safety check
            }

            // Ensure the target group has an 'outbounds' array
            if (!Array.isArray(targetGroup.outbounds)) {
                targetGroup.outbounds = [];
            }

            const filteredNodes = filterNodesByRule(proxyNodes, rule);
            const filteredTags = filteredNodes.map(node => node.tag);

            if (filteredTags.length > 0) {
                targetGroup.outbounds = filteredTags; // Replace existing empty array
                log(`Populated group "${rule.groupName}" with ${filteredTags.length} nodes matching rule type '${rule.type}'.`);

                // Handle default for selectors if needed
                if (targetGroup.type === 'selector' && !targetGroup.default) {
                    targetGroup.default = filteredTags[0]; // Set default to the first node
                    log(`Set default for selector "${rule.groupName}" to "${filteredTags[0]}".`);
                }
                groupsPopulatedCount++;
            } else {
                log(`No nodes matched rule for group "${rule.groupName}". Leaving its 'outbounds' empty for now.`);
            }
        });

        log(`Finished initial population pass. ${groupsPopulatedCount} groups populated with nodes.`);

        // 5. Handle Empty Groups & Adjust Main Selector
        let fallbackAdded = false;
        config.outbounds.forEach(group => {
            // Check only policy groups (selector, urltest, etc.), not basic types or nodes themselves
            if (['selector', 'urltest', 'loadbalance'].includes(group.type)) {
                if (!Array.isArray(group.outbounds) || group.outbounds.length === 0) {
                    log(`Group "${group.tag}" is empty. Adding fallback tag "${fallbackTag}".`);
                    group.outbounds = [fallbackTag]; // Add fallback tag

                    // If it's a selector, also set its default to the fallback
                    if (group.type === 'selector') {
                        group.default = fallbackTag;
                    }
                    fallbackAdded = true; // Mark that we might need the fallback definition
                }
            }
        });

        // Ensure the fallback outbound exists if it was used
        if (fallbackAdded && !config.outbounds.some(o => o.tag === fallbackTag)) {
            // Add a simple direct outbound as the fallback if it's not DIRECT and doesn't exist
            if (fallbackTag !== 'DIRECT' && fallbackTag !== 'REJECT' && fallbackTag !== 'DNS-OUT') {
                log(`Adding definition for fallback tag "${fallbackTag}" (type: direct).`);
                // Insert it after basic outbounds for clarity
                const insertIndex = config.outbounds.findIndex(o => o.tag === 'DNS-OUT') + 1 || 3;
                config.outbounds.splice(insertIndex, 0, { tag: fallbackTag, type: 'direct' });
            } else {
                log(`Fallback tag "${fallbackTag}" is a basic type, no definition needed.`);
            }
        }

        // Adjust the main 'Proxy' selector's outbounds list based on which groups actually got populated
        const mainProxySelector = config.outbounds.find(o => o.tag === '🪜 Proxy'); // Assuming this tag is used
        if (mainProxySelector && mainProxySelector.type === 'selector') {
            const originalProxyOutbounds = mainProxySelector.outbounds;
            mainProxySelector.outbounds = originalProxyOutbounds.filter(tag => {
                if (tag === 'DIRECT') return true; // Always keep DIRECT
                const referencedGroup = config.outbounds.find(g => g.tag === tag);
                // Keep the tag if the referenced group exists and either isn't empty or contains the fallback tag
                return referencedGroup && Array.isArray(referencedGroup.outbounds) && referencedGroup.outbounds.length > 0 && referencedGroup.outbounds[0] !== fallbackTag;
            });
            // Ensure Auto and Manual are only included if proxy nodes exist
            if (proxyNodeTags.length === 0) {
                mainProxySelector.outbounds = mainProxySelector.outbounds.filter(tag => tag !== '♻️ 自动选择' && tag !== '🚀 手动切换');
            }
            // Set default for main selector
            mainProxySelector.default = proxyNodeTags.length > 0 ? '♻️ 自动选择' : 'DIRECT';
            log(`Adjusted main selector "${mainProxySelector.tag}" outbounds. Default set to "${mainProxySelector.default}".`);
        }


        // 6. Add Fetched Proxy Nodes to the End
        // The template already defines policy groups. Now add the actual node definitions.
        config.outbounds.push(...proxyNodes);
        log(`Added ${proxyNodes.length} proxy node definitions to the end of the outbounds list.`);


        // 7. Return Final JSON String
        log("Script finished successfully.");
        return JSON.stringify(config, null, 2); // Pretty-printed JSON

    } catch (error) {
        log(`Error generating Sing-box configuration: ${error}`);
        console.error("Error generating Sing-box configuration:", error);
        // Return JSON with error message for easier debugging in Sub-Store if possible
        return JSON.stringify({
            error: `Script execution failed: ${error.message || error}`,
            details: error.stack // Include stack trace if available
        }, null, 2);
    }

})();
