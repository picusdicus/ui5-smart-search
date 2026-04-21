@cap-agent 

Using the project defined in CLAUDE.md, scaffold the complete CAP project:

1. Run: cds init . --add hana
2. Create db/schema.cds with entities: Customers, Products, 
   SalesOrders, Invoices — all with UUID keys and an 
   "embedding" LargeBinary field
3. Create srv/search-service.cds exposing all entities as 
   read-only + a searchAI action
4. Create srv/search-service.js with empty handler stubs
5. Create .env.example with all variables from CLAUDE.md
6. Create .gitignore (node_modules, .env, gen/, dist/)
7. Update package.json with all dependencies from CLAUDE.md

Do NOT run npm install yet. Do NOT connect to HANA yet.