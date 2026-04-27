'use strict';

const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const FAST_MODEL  = 'llama-3.1-8b-instant';
const SMART_MODEL = 'llama-3.3-70b-versatile';

const RELEVANT_FIELDS = {
    Customers:   ['ID', 'NAME', 'EMAIL', 'PHONE', 'COUNTRY'],
    Products:    ['ID', 'NAME', 'CATEGORY', 'PRICE', 'CURRENCY', 'STOCK', 'DESCRIPTION'],
    SalesOrders: ['ID', 'ORDERDATE', 'STATUS', 'TOTALAMOUNT', 'CURRENCY', 'NOTES'],
    Invoices:    ['ID', 'INVOICEDATE', 'DUEDATE', 'STATUS', 'AMOUNT', 'CURRENCY', 'NOTES'],
};

async function askGroq(query, contextRows, entityType) {
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

    const response = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
            {
                role: 'system',
                content:
                    'You are an SAP data assistant. Answer questions about business data ' +
                    'concisely in 1-3 sentences. Format numbers as currency where appropriate.',
            },
            { role: 'user', content: userContent },
        ],
        max_tokens: 1024,
        temperature: 0.3,
    });

    console.log(`[groq] tokens used: ${response.usage?.total_tokens}`);
    const answer = response.choices[0]?.message?.content || '(No answer returned by model)';
    return { answer };
}

async function askGroqMultiEntity(query, contextBlock, entityTypes) {
    const entityList = entityTypes.join(', ');
    const userContent =
        `The following SAP business records were retrieved from: ${entityList}.\n\n` +
        `${contextBlock}\n\n` +
        `Answer this question thoroughly: ${query}`;

    const response = await groq.chat.completions.create({
        model: SMART_MODEL,
        messages: [
            {
                role: 'system',
                content:
                    'You are an SAP business data analyst with expertise in ' +
                    'reading related business records across multiple tables. ' +
                    'Analyze the provided data holistically. ' +
                    'Identify relationships between records. ' +
                    'Highlight patterns, totals, and anomalies. ' +
                    'Be concise but thorough. ' +
                    'NEVER add amounts from different currencies together. ' +
                    'Group totals BY currency when multiple currencies exist. ' +
                    'Always show the currency code next to every amount. ' +
                    'If a customer name is available, always use it instead of showing the raw ID.',
            },
            { role: 'user', content: userContent },
        ],
        max_tokens: 1024,
        temperature: 0.3,
    });

    console.log(`[groq] tokens used: ${response.usage?.total_tokens}`);
    const answer = response.choices[0]?.message?.content || '(No answer returned by model)';
    return { answer };
}

module.exports = { askGroq, askGroqMultiEntity };
