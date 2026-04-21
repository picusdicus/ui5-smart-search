@hana-agent

Using the vector-search skill and CLAUDE.md as reference, enhance 
the existing db/src/schema.cds for HANA Cloud Vector Engine:

1. Change the "embedding" field on ALL entities to store 
   Float32 vectors compatible with HANA REAL_VECTOR(1536)
   Use LargeBinary with annotation @Core.MediaType: 'application/octet-stream'

2. Add @cds.persistence.exists: false annotations where needed 
   for vector columns so HDI handles them correctly

3. Create db/src/vector-search.hdbview for each entity with:
   - A SQL view exposing COSINE_SIMILARITY search
   - Named: CV_CUSTOMERS_SEARCH, CV_PRODUCTS_SEARCH, 
     CV_SALESORDERS_SEARCH, CV_INVOICES_SEARCH

4. Update db/src/.hdiconfig to include:
   - .hdbview plugin
   - .hdbtable plugin  
   - .hdbindex plugin

5. Create db/src/seed-data/ with realistic CSV files:
   - customers.csv (20 rows, mix of countries/regions)
   - products.csv (20 rows, mix of categories)
   - salesorders.csv (30 rows, various statuses)
   - invoices.csv (30 rows, mix of paid/overdue/open)

6. Create db/src/undeploy.json listing all artifacts

7. Once you are done, tell me how to test it

Do NOT deploy to HANA yet. Local files only.