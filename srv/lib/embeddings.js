'use strict';

const HF_URL = 'https://api-inference.huggingface.co/models/nomic-ai/nomic-embed-text-v1';

async function embedText(text, isQuery = true) {
    const apiKey = process.env.HF_API_KEY;
    if (!apiKey) throw new Error('HuggingFace API key not configured');

    const prefix = isQuery ? 'search_query: ' : 'search_document: ';
    const input = prefix + text;

    const call = async () => fetch(HF_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: input }),
    });

    let response = await call();

    if (response.status === 503) {
        console.log('[embeddings] HF model loading, retrying...');
        await new Promise(r => setTimeout(r, 20000));
        response = await call();
    }

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`HuggingFace embedding failed (${response.status}): ${body}`);
    }

    const json = await response.json();
    const flat = Array.isArray(json[0]) ? json[0] : json;
    const vector = new Float32Array(flat);

    console.log(`[embeddings] HF embedded ${text.length} chars → ${vector.length} dimensions`);
    return vector;
}

function serializeEmbedding(float32Array) {
    return Buffer.from(float32Array.buffer);
}

function deserializeEmbedding(buffer) {
    return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}

module.exports = { embedText, serializeEmbedding, deserializeEmbedding };
