sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/Column",
    "sap/m/ColumnListItem",
    "sap/m/Label",
    "sap/m/Text"
], function (Controller, Column, ColumnListItem, Label, Text) {
    "use strict";

    var CAP_URL = "http://localhost:4004/search/searchAI";

    return Controller.extend("ui5.smartsearch.controller.Search", {

        onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("query") || oEvent.getSource().getValue();
            if (!sQuery || !sQuery.trim()) {
                return;
            }
            this._executeSearch(sQuery.trim());
        },

        onLiveChange: function (oEvent) {
            if (!oEvent.getParameter("newValue")) {
                this.clearSearch();
            }
        },

        onErrorStripClose: function () {
            this.byId("errorStrip").setVisible(false);
        },

        _executeSearch: function (sQuery) {
            this._setBusy(true);
            this._hidePanels();
            this.byId("errorStrip").setVisible(false);

            fetch(CAP_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: sQuery })
            })
            .then(function (oResponse) {
                if (!oResponse.ok) {
                    return oResponse.text().then(function (sText) {
                        throw new Error("HTTP " + oResponse.status + ": " + sText);
                    });
                }
                return oResponse.json();
            })
            .then(this._onSearchSuccess.bind(this))
            .catch(this._onSearchError.bind(this));
        },

        _onSearchSuccess: function (oResult) {
            this._setBusy(false);

            var sAnswer = oResult.answer || "";
            var aResults = oResult.results || [];
            var sSQL = oResult.generatedSQL || "";

            this.byId("answerText").setText(sAnswer);
            this.byId("answerPanel").setVisible(true);

            this._buildResultsTable(aResults);
            this.byId("resultsPanel").setVisible(aResults.length > 0);

            var oI18n = this.getView().getModel("i18n").getResourceBundle();
            this.byId("resultsCount").setText(
                oI18n.getText("resultsCount", [aResults.length])
            );

            var oSqlPanel = this.byId("sqlPanel");
            if (sSQL) {
                this.byId("sqlText").setText(sSQL);
                oSqlPanel.setVisible(true);
                oSqlPanel.setExpanded(false);
            } else {
                oSqlPanel.setVisible(false);
            }
        },

        _onSearchError: function (oError) {
            this._setBusy(false);
            var sMessage = (oError && oError.message) ? oError.message : "An unexpected error occurred.";
            var oStrip = this.byId("errorStrip");
            oStrip.setText(sMessage);
            oStrip.setVisible(true);
        },

        _buildResultsTable: function (aResults) {
            var oTable = this.byId("resultsTable");
            oTable.destroyColumns();
            oTable.destroyItems();

            if (!aResults || aResults.length === 0) {
                return;
            }

            // Results may arrive as JSON strings (multi-entity path) or plain objects
            var SKIP_KEYS = { EMBEDDING: true, embedding: true, entityType: true };
            var aParsed = aResults.map(function (r) {
                return typeof r === "string" ? JSON.parse(r) : r;
            });

            var aKeys = Object.keys(aParsed[0]).filter(function (k) {
                return !SKIP_KEYS[k];
            });

            aKeys.forEach(function (sKey) {
                oTable.addColumn(new Column({
                    header: new Label({ text: sKey })
                }));
            });

            aParsed.forEach(function (oRecord) {
                var oCells = aKeys.map(function (sKey) {
                    var vVal = oRecord[sKey];
                    var sText = (vVal !== null && vVal !== undefined) ? String(vVal) : "";
                    // Escape UI5 binding syntax to prevent "{...}" from being parsed as bindings
                    sText = sText.replace(/\{/g, "\\{");
                    return new Text({ text: sText });
                });
                oTable.addItem(new ColumnListItem({ cells: oCells }));
            });
        },

        clearSearch: function () {
            this._hidePanels();
            this.byId("errorStrip").setVisible(false);
            this.byId("answerText").setText("");
            this.byId("resultsCount").setText("");
        },

        _hidePanels: function () {
            this.byId("answerPanel").setVisible(false);
            this.byId("resultsPanel").setVisible(false);
            this.byId("sqlPanel").setVisible(false);
        },

        _setBusy: function (bBusy) {
            this.byId("busyIndicator").setVisible(bBusy);
        }

    });
});
