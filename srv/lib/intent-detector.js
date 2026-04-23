'use strict';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

/**
 * Classifies a natural-language query as 'analytical' or 'lookup'.
 * @param {string} query
 * @returns {Promise<'analytical'|'lookup'>}
 */
async function detectIntent(query) {
    let intent = 'lookup';
    try {
        const response = await fetch(`${OLLAMA_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama3.2',
                stream: false,
                options: { num_predict: 5 },
                messages: [
                    {
                        role: 'system',
                        content:
                            "You are a query classifier. Reply with exactly one word: 'analytical' or 'lookup'.\n" +
                            "analytical = requires aggregation, totals, averages, rankings, grouping, counting.\n" +
                            "lookup = finding specific records, filtering, searching for entities.",
                    },
                    { role: 'user', content: query },
                ],
            }),
        });

        if (response.ok) {
            const json = await response.json();
            const raw = (json.message?.content || '').trim().toLowerCase();
            if (raw.startsWith('analytical')) {
                intent = 'analytical';
            }
        }
    } catch (err) {
        console.warn('[intent] Ollama unreachable, defaulting to lookup:', err.message);
    }

    console.log(`[intent] query: "${query}" → ${intent}`);
    return intent;
}

module.exports = { detectIntent };
