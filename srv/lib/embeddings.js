'use strict';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

/**
 * Generates a 768-dimensional embedding vector for the given text
 * using the Ollama nomic-embed-text model via REST (native fetch, no npm HTTP packages).
 *
 * @param {string} text - The input text to embed.
 * @returns {Promise<Float32Array>} The embedding as a Float32Array (768 dims).
 * @throws {Error} If Ollama is not reachable or returns an unexpected response.
 */
async function embedText(text) {
    let response;
    try {
        response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'nomic-embed-text', prompt: text }),
        });
    } catch (err) {
        throw new Error(`Ollama not reachable at ${OLLAMA_URL}. Is it running?`);
    }

    if (!response.ok) {
        throw new Error(`Ollama embeddings request failed: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    return new Float32Array(json.embedding);
}

/**
 * Serializes a Float32Array embedding into a Buffer suitable for HANA REAL_VECTOR storage.
 *
 * @param {Float32Array} float32Array - The embedding vector to serialize.
 * @returns {Buffer} A Buffer containing the raw binary representation of the vector.
 */
function serializeEmbedding(float32Array) {
    return Buffer.from(float32Array.buffer);
}

/**
 * Deserializes a Buffer retrieved from HANA REAL_VECTOR storage back into a Float32Array.
 * Handles non-zero byteOffset correctly.
 *
 * @param {Buffer} buffer - The raw buffer from HANA.
 * @returns {Float32Array} The reconstructed embedding vector.
 */
function deserializeEmbedding(buffer) {
    return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}

module.exports = { embedText, serializeEmbedding, deserializeEmbedding };
