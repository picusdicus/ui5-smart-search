# Smart Search — AI-Powered SAP Data Search

## Project Overview
A Smart Search application that lets users query SAP business data 
(Customers, Products, SalesOrders, Invoices) using natural language.
Built with SAP CAP + SAPUI5 + HANA Cloud Vector Engine + Anthropic Claude API.

## Architecture
- **Frontend**: SAPUI5 Fiori Freestyle app (app/webapp)
- **Backend**: SAP CAP Node.js service (srv/)
- **Database**: SAP HANA Cloud with Vector Engine (db/)
- **AI**: Anthropic Claude API (claude-sonnet-4-20250514) for answers
- **Embeddings**: OpenAI text-embedding-3-small for vector generation

## RAG Flow
1. User types natural language query in SAPUI5
2. CAP service embeds query → vector (OpenAI)
3. HANA vector search finds top-10 relevant records
4. Claude receives context + query → generates answer
5. SAPUI5 shows answer + structured results table

## Key Files
- db/schema.cds — data model with vector embedding columns
- srv/search-service.cds — OData service + searchAI action
- srv/search-service.js — AI orchestration logic
- srv/lib/embeddings.js — vector embedding utility
- srv/lib/hana-vector.js — HANA vector search utility
- srv/lib/claude-client.js — Anthropic API client
- app/webapp/ — SAPUI5 frontend

## Environment Variables (.env)
- ANTHROPIC_API_KEY — Claude API key
- OPENAI_API_KEY — for text-embedding-3-small
- HANA_HOST — from BTP service key
- HANA_PASSWORD — from BTP service key

## Coding Standards
- Always use async/await, never callbacks
- All CAP handlers must have try/catch
- CDS entities use UUID keys
- UI5 follows MVC pattern strictly
- Never hardcode credentials