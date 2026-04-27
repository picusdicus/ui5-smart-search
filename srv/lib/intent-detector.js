'use strict';

const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Classifies a natural-language query as 'analytical' or 'lookup'.
 * @param {string} query
 * @returns {Promise<'analytical'|'lookup'>}
 */
async function detectIntent(query) {
    let intent = 'lookup';
    try {
        const response = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
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
            max_tokens: 5,
            temperature: 0.3,
        });

        const raw = (response.choices[0]?.message?.content || '').trim().toLowerCase();
        if (raw.startsWith('analytical')) {
            intent = 'analytical';
        }
    } catch (err) {
        console.warn('[intent] Groq unreachable, defaulting to lookup:', err.message);
    }

    console.log(`[intent] query: "${query}" → ${intent}`);
    return intent;
}

module.exports = { detectIntent };
