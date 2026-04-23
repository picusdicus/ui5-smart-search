'use strict';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

// Only send the fields that matter for answering questions — keeps the prompt small
const RELEVANT_FIELDS = {
    Customers:   ['ID', 'NAME', 'EMAIL', 'PHONE', 'COUNTRY'],
    Products:    ['ID', 'NAME', 'CATEGORY', 'PRICE', 'CURRENCY', 'STOCK', 'DESCRIPTION'],
    SalesOrders: ['ID', 'ORDERDATE', 'STATUS', 'TOTALAMOUNT', 'CURRENCY', 'NOTES'],
    Invoices:    ['ID', 'INVOICEDATE', 'DUEDATE', 'STATUS', 'AMOUNT', 'CURRENCY', 'NOTES'],
};

async function askLlama(query, contextRows, entityType) {
    const allowedFields = RELEVANT_FIELDS[entityType] || null;

    const formattedContext = contextRows.map((row) => {
        const lines = Object.entries(row)
            .filter(([key]) => {
                if (key === 'EMBEDDING' || key === 'embedding' || key === 'SCORE') return false;
                if (allowedFields) return allowedFields.includes(key.toUpperCase());
                return true;
            })
            .map(([key, value]) => `  ${key}: ${value}`)
            .join('\n');
        return `[${entityType}]\n${lines}`;
    }).join('\n\n');

    const userContent =
        `Given the following ${entityType} records:\n\n${formattedContext}\n\n` +
        `Answer this question concisely: ${query}`;

    let response;
    try {
        response = await fetch(`${OLLAMA_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama3.2',
                stream: false,
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are an SAP data assistant. Answer questions about business data ' +
                            'concisely in 1-3 sentences. Format numbers as currency where appropriate.',
                    },
                    { role: 'user', content: userContent },
                ],
            }),
        });
    } catch (err) {
        throw new Error(`Ollama not reachable at ${OLLAMA_URL}. Is it running?`);
    }

    if (!response.ok) {
        throw new Error(`Ollama chat request failed: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    const answer = json.message?.content || '(No answer returned by model)';
    return { answer };
}

/**
 * Asks Llama to analyse cross-entity business data with a richer system prompt.
 *
 * @param {string}   query       - The user's natural language question.
 * @param {string}   contextBlock - Structured text from buildContextBlock().
 * @param {string[]} entityTypes - Names of the entities that were searched.
 * @returns {Promise<{ answer: string }>}
 */
async function askLlamaMultiEntity(query, contextBlock, entityTypes) {
    const entityList = entityTypes.join(', ');
    const userContent =
        `The following SAP business records were retrieved from: ${entityList}.\n\n` +
        `${contextBlock}\n\n` +
        `Answer this question thoroughly: ${query}`;

    let response;
    try {
        response = await fetch(`${OLLAMA_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama3.2',
                stream: false,
                options: { num_predict: 2048 },
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are an SAP business data analyst with expertise in ' +
                            'reading related business records across multiple tables. ' +
                            'Analyze the provided data holistically. ' +
                            'Identify relationships between records. ' +
                            'Highlight patterns, totals, and anomalies. ' +
                            'Be concise but thorough. Format numbers as currency.',
                    },
                    { role: 'user', content: userContent },
                ],
            }),
        });
    } catch (err) {
        throw new Error(`Ollama not reachable at ${OLLAMA_URL}. Is it running?`);
    }

    if (!response.ok) {
        throw new Error(`Ollama chat request failed: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    const answer = json.message?.content || '(No answer returned by model)';
    return { answer };
}

module.exports = { askLlama, askLlamaMultiEntity };
