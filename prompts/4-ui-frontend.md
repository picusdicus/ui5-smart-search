
Using ui5-agent, CLAUDE.md and ui5-ai-patterns skill as reference, create a 
complete SAPUI5 Fiori freestyle app in app/webapp/ for the Smart 
Search application.

1. Create app/webapp/manifest.json:
   - App ID: ui5.smartsearch
   - OData V4 model pointing to /odata/v4/search/
   - Default route → Search view
   - i18n resource bundle

2. Create app/webapp/view/Search.view.xml:
   - sap.m.Page with "Smart Search" title
   - sap.m.SearchField (large, centered, placeholder: 
     "Ask anything about your SAP data...")
   - sap.m.Panel (id: answerPanel, visible: false):
       - Header: "AI Answer"
       - sap.m.Text (id: answerText, wrapping: true)
   - sap.m.Panel (id: resultsPanel, visible: false):
       - Header: "Matching Records"  
       - sap.m.Table (id: resultsTable) with dynamic columns
   - sap.m.BusyIndicator (id: busyIndicator, visible: false)
   - sap.m.MessageStrip (id: errorStrip, visible: false, 
     type: Error)

3. Create app/webapp/controller/Search.controller.js:
   - onSearch(oEvent) handler:
       a. Show busyIndicator, hide panels
       b. Call searchAI action via OData V4 bound action
       c. On success: populate answerText, populate resultsTable,
          show both panels, hide busyIndicator
       d. On error: show errorStrip with message,
          hide busyIndicator
   - buildResultsTable(results) helper:
       builds dynamic columns based on returned data keys
   - clearSearch() resets all panels

4. Create app/webapp/i18n/i18n.properties:
   - All visible text as i18n keys
   - English values

5. Create app/webapp/index.html:
   - Bootstrap SAPUI5 from CDN
   - theme: sap_horizon
   - Loads the app correctly

6. Update app/webapp/manifest.json to register 
   the CAP service as datasource correctly for 
   local development on port 4004

Use sap.m controls only. 
Follow MVC strictly.
No business logic in the view.
Handle busy state and errors gracefully.