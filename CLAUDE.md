# Smart Search — AI-Powered SAP Data Search

## Project Overview
A Smart Search application that lets users query SAP business data 
(Customers, Products, SalesOrders, Invoices) using natural language.
Built with SAP CAP + SAPUI5 + HANA Cloud Vector Engine + Ollama (local LLM).

## Architecture
- **Frontend**: SAPUI5 Fiori Freestyle app (app/webapp)
- **Backend**: SAP CAP Node.js service (srv/)
- **Database**: SAP HANA Cloud with Vector Engine (db/)
- **AI**: Ollama llama3.2 (local) for answers
- **Embeddings**: Ollama nomic-embed-text (768 dims)

## RAG Flow
1. User types natural language query in SAPUI5
2. CAP service embeds query → vector (Ollama nomic-embed-text)
3. HANA vector search finds top-10 relevant records
4. llama3.2 receives context + query → generates answer
5. SAPUI5 shows answer + structured results table

## Key Files
- db/schema.cds — data model with vector embedding columns
- srv/search-service.cds — OData service + searchAI action
- srv/search-service.js — AI orchestration logic
- srv/lib/embeddings.js — vector embedding utility (Ollama nomic-embed-text)
- srv/lib/hana-vector.js — HANA vector search utility
- srv/lib/ollama-client.js — Ollama llama3.2 chat client
- app/webapp/ — SAPUI5 frontend

## Environment Variables (.env)
- OLLAMA_URL — Ollama server URL (default: http://localhost:11434)
- HANA_HOST — from BTP service key
- HANA_PORT — HANA port (default: 443)
- HANA_USER — HANA user (default: DBADMIN)
- HANA_PASSWORD — from BTP service key

## Coding Standards
- Always use async/await, never callbacks
- All CAP handlers must have try/catch
- CDS entities use UUID keys
- UI5 follows MVC pattern strictly
- Never hardcode credentials
