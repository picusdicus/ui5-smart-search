'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT =
    'You are an SAP data assistant. Answer questions about business data. ' +
    'If the data doesn\'t contain the answer, say so clearly. ' +
    'Format numbers as currency where appropriate.';

/**
 * Formats an array of HANA result rows into a human-readable context string.
 * The EMBEDDING field is always excluded to avoid sending binary data to the LLM.
 *
 * @param {Array<object>} rows       - Raw rows returned from vectorSearch.
 * @param {string}        entityType - The entity name (e.g. 'Customers').
 * @returns {string} A multi-line text representation of the rows.
 */
function formatContext(rows, entityType) {
    return rows
        .map((row, index) => {
            const lines = [`[${entityType} record ${index + 1}]`];
            for (const [key, value] of Object.entries(row)) {
                if (key === 'EMBEDDING' || key === 'embedding') continue;
                lines.push(`  ${key}: ${value}`);
            }
            return lines.join('\n');
        })
        .join('\n\n');
}

/**
 * Sends a query and contextual data rows to Claude and returns a concise answer.
 *
 * @param {string}        query       - The user's natural-language question.
 * @param {Array<object>} contextRows - Top-k rows from HANA vector search.
 * @param {string}        entityType  - The entity name for labelling context (e.g. 'Products').
 * @returns {Promise<{ answer: string, tokensUsed: number }>} Claude's answer and total token count.
 */
async function askClaude(query, contextRows, entityType) {
    const formattedContext = formatContext(contextRows, entityType);

    const userMessage =
        `Given the following ${entityType} records:\n\n` +
        `${formattedContext}\n\n` +
        `Answer this question concisely: ${query}`;

    const response = await client.messages.create({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system:     SYSTEM_PROMPT,
        messages: [
            { role: 'user', content: userMessage },
        ],
    });

    const usage = response.usage;
    const tokensUsed = usage.input_tokens + usage.output_tokens;
    console.log('[claude-client] tokens used:', tokensUsed);

    const answer = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');

    return { answer, tokensUsed };
}

module.exports = { askClaude };
