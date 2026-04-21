# HANA Vector Search Patterns

## Serialize embedding for storage
Buffer.from(new Float32Array(embeddingArray).buffer)

## Deserialize from HANA
new Float32Array(buffer.buffer)

## HANA SQL Vector Search
SELECT TOP 10 ID, name, description,
  COSINE_SIMILARITY(embedding, TO_REAL_VECTOR(?)) AS score
FROM SMART_SEARCH_CUSTOMERS
WHERE embedding IS NOT NULL
ORDER BY score DESC

## CAP db query alternative (when possible)
const results = await db.run(
  `SELECT TOP 10 * FROM ${entity} 
   ORDER BY COSINE_SIMILARITY(embedding, TO_REAL_VECTOR(?)) DESC`,
  [serializedVector]
);