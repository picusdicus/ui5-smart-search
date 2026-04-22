'use strict';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

/**
 * Asks the local Ollama llama3.2 model a question grounded in the provided
 * SAP entity context rows.
 *
 * @param {string}        query      - The user's natural-language question.
 * @param {Array<object>} contextRows - Top-k rows from HANA vector search.
 * @param {string}        entityType - Entity label used in the prompt (e.g. 'Customers').
 * @returns {Promise<{ answer: string }>} The model's answer.
 * @throws {Error} If Ollama is not reachable or returns an unexpected response.
 */
async function askLlama(query, contextRows, entityType) {
    // Format rows, skipping binary embedding fields
    const formattedContext = contextRows.map((row) => {
        const lines = Object.entries(row)
            .filter(([key]) => key !== 'EMBEDDING' && key !== 'embedding')
            .map(([key, value]) => `  - ${key}: ${value}`)
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
                            'concisely. If the data doesn\'t contain the answer, say so clearly. ' +
                            'Format numbers as currency where appropriate.',
                    },
                    {
                        role: 'user',
                        content: userContent,
                    },
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
    const answer = json.message && json.message.content
        ? json.message.content
        : '(No answer returned by model)';

    return { answer };
}

module.exports = { askLlama };
