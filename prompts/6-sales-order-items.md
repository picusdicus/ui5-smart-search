
IMPORTANT! Use cap-agent and hana-agent for this task

Add SalesOrderItems entity linking SalesOrders to Products 
(SAP VBAK/VBAP pattern). Use existing project conventions:
camelCase columns, quoted "smart_search_" table names,
EMBEDDING as LargeBinary with @cds.persistence.exists:false.

1. db/src/schema.cds — add entity:
   SalesOrderItems: cuid+managed, fields:
   salesOrder→SalesOrders, product→Products,
   quantity(Integer), unitPrice(Decimal 15,2),
   currency(String 3), embedding(LargeBinary+annotations)

2. srv/search-service.cds — expose SalesOrderItems read-only

3. db/src/seed-data/salesorderitems.csv — 60 rows:
   2-3 items per SalesOrder, real Product+SalesOrder IDs,
   quantity 1-20, matching currency, no embedding column

4. db/src/CV_SALESORDERITEMS_SEARCH.hdbview:
   SELECT SOI.ID, "salesOrder_ID", "product_ID",
     quantity, unitPrice, currency,
     P.name AS productName, P.category AS productCategory,
     COSINE_SIMILARITY(SOI.EMBEDDING, TO_REAL_VECTOR(?)) AS score
   FROM "smart_search_SalesOrderItems" SOI
   JOIN "smart_search_Products" P ON SOI."product_ID" = P.ID
   WHERE SOI.EMBEDDING IS NOT NULL

5. srv/lib/hana-vector.js:
   Add SalesOrderItems to TABLE_NAMES and vectorSearch SQL.
   Include: "salesOrder_ID","product_ID",quantity,
   unitPrice,currency,productName,productCategory

6. srv/lib/context-builder.js:
   Add SalesOrderItems keyword detection:
   item,items,line,product,category,quantity
   
   Enrichment for SalesOrderItems rows:
   → SalesOrders WHERE ID = salesOrder_ID → get customer_ID
   → Customers WHERE ID = customer_ID → get name, country
   → relatedData: {customerName, customerCountry,
                   productName, productCategory}
   
   buildContextBlock() format:
   "${productName}|${productCategory}|Qty:${quantity}|
    ${unitPrice} ${currency}|Customer:${customerName}"

7. srv/lib/seed-embeddings.js:
   Add SalesOrderItems after Products+SalesOrders:
   embed: "${productName} ${productCategory} 
           quantity ${quantity} at ${unitPrice} ${currency}"
   UPDATE "smart_search_SalesOrderItems" SET EMBEDDING=? 
   WHERE ID=?

8. test/revenue-queries.http — add 3 tests:
   "monthly revenue by product category"
   "which products are selling the most"
   "top customers by total purchase amount"