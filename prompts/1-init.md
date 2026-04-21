I'm building a Smart Search AI app using SAP CAP + SAPUI5 + HANA Cloud + 
Anthropic Claude API. Use @cap-js/mcp-server context.

Please scaffold the complete project:

1. Run: cds init smart-search --add hana,samples

2. Create db/schema.cds with these entities:
   - Customers: ID (UUID), name, country, region, creditLimit (Decimal)
   - Products: ID (UUID), name, category, description, price (Decimal), stock (Integer)
   - SalesOrders: ID (UUID), customer (Association to Customers), orderDate, 
     status (enum: Open/Confirmed/Delivered/Cancelled), totalAmount (Decimal)
   - Invoices: ID (UUID), salesOrder (Association to SalesOrders), 
     dueDate, paidDate, amount (Decimal), 
     status (enum: Open/Overdue/Paid)
   - Each entity needs an extra field: embedding (LargeBinary)

3. Create srv/search-service.cds:
   - Expose all 4 entities as read-only
   - Add a searchAI action: input query(String), 
     output answer(String) + results(array of String)

4. Create srv/search-service.js with placeholder handlers

5. Create package.json with dependencies:
   @sap/cds, @sap/cds-dk, @anthropic-ai/sdk, 
   openai, express, hdb, @sap/hana-client

6. Create .env.example with:
   ANTHROPIC_API_KEY=
   HANA_HOST=
   HANA_PORT=443
   HANA_USER=DBADMIN
   HANA_PASSWORD=

7. Create .gitignore including .env and node_modules