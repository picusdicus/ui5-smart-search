sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/Column",
    "sap/m/ColumnListItem",
    "sap/m/Label",
    "sap/m/Text"
], function (Controller, Column, ColumnListItem, Label, Text) {
    "use strict";

    var CAP_URL     = "http://localhost:4004/search/searchAI";
    var SUGGEST_URL = "http://localhost:4004/search/suggestCustomer";
    var CREATE_URL  = "http://localhost:4004/search/createCustomer";

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
        },

        onNewCustomer: function () {
            this._resetDialog();
            this.byId("newCustomerDialog").open();
        },

        _resetDialog: function () {
            this.byId("customerDescription").setValue("");
            this.byId("fieldName").setValue("");
            this.byId("fieldLanguage").setValue("");
            this.byId("fieldGrouping").setValue("");
            this.byId("fieldIndustry").setValue("");
            this.byId("fieldPartnerType").setValue("");
            this.byId("fieldName").setValueState("None");
            this.byId("suggestedByStrip").setVisible(false);
            this.byId("duplicateWarningStrip").setVisible(false);
            this.byId("createErrorStrip").setVisible(false);
            this.byId("dialogBusy").setVisible(false);
        },

        onCancelDialog: function () {
            this.byId("newCustomerDialog").close();
        },

        onGetSuggestions: function () {
            var sQuery = this.byId("customerDescription").getValue().trim();
            if (!sQuery) return;

            this.byId("dialogBusy").setVisible(true);
            this.byId("suggestedByStrip").setVisible(false);
            this.byId("duplicateWarningStrip").setVisible(false);
            this.byId("createErrorStrip").setVisible(false);

            fetch(SUGGEST_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: sQuery })
            })
            .then(function (oResponse) {
                if (!oResponse.ok) {
                    return oResponse.text().then(function (t) { throw new Error("HTTP " + oResponse.status + ": " + t); });
                }
                return oResponse.json();
            })
            .then(this._onSuggestSuccess.bind(this))
            .catch(this._onSuggestError.bind(this));
        },

        _onSuggestSuccess: function (oResult) {
            this.byId("dialogBusy").setVisible(false);

            var oFields = {};
            try { oFields = JSON.parse(oResult.suggestedFields || "{}"); } catch (e) { /* ignore */ }

            this.byId("fieldName").setValue(oFields.name || "");
            this.byId("fieldLanguage").setValue(oFields.language || "EN");
            this.byId("fieldGrouping").setValue(oFields.grouping || "BP01");
            this.byId("fieldIndustry").setValue(oFields.industry || "");
            this.byId("fieldPartnerType").setValue(oFields.partnerType || "2");

            if (oResult.similarBPName) {
                this.byId("suggestedByStrip").setText("Suggested based on: " + oResult.similarBPName);
                this.byId("suggestedByStrip").setVisible(true);
            }
            if (oResult.duplicateWarning) {
                this.byId("duplicateWarningStrip").setVisible(true);
            }
        },

        _onSuggestError: function (oError) {
            this.byId("dialogBusy").setVisible(false);
            var oStrip = this.byId("createErrorStrip");
            oStrip.setText("Suggestion failed: " + (oError.message || "Unknown error"));
            oStrip.setVisible(true);
        },

        onCreateCustomer: function () {
            var sName        = this.byId("fieldName").getValue().trim();
            var sLanguage    = this.byId("fieldLanguage").getValue().trim();
            var sGrouping    = this.byId("fieldGrouping").getValue().trim();
            var sIndustry    = this.byId("fieldIndustry").getValue().trim();
            var sPartnerType = this.byId("fieldPartnerType").getValue().trim();

            if (!sName) {
                this.byId("fieldName").setValueState("Error");
                return;
            }
            this.byId("fieldName").setValueState("None");
            this.byId("createErrorStrip").setVisible(false);
            this.byId("dialogBusy").setVisible(true);

            fetch(CREATE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name:        sName,
                    language:    sLanguage    || "EN",
                    grouping:    sGrouping    || "BP01",
                    industry:    sIndustry,
                    partnerType: sPartnerType || "2"
                })
            })
            .then(function (oResponse) {
                if (!oResponse.ok) {
                    return oResponse.text().then(function (t) { throw new Error("HTTP " + oResponse.status + ": " + t); });
                }
                return oResponse.json();
            })
            .then(this._onCreateSuccess.bind(this))
            .catch(this._onCreateError.bind(this));
        },

        _onCreateSuccess: function (oResult) {
            this.byId("dialogBusy").setVisible(false);
            this.byId("newCustomerDialog").close();
            var oStrip = this.byId("errorStrip");
            oStrip.setType("Success");
            oStrip.setText("Business Partner " + oResult.id + " created successfully.");
            oStrip.setVisible(true);
        },

        _onCreateError: function (oError) {
            this.byId("dialogBusy").setVisible(false);
            var oStrip = this.byId("createErrorStrip");
            oStrip.setText("Creation failed: " + (oError.message || "Unknown error"));
            oStrip.setVisible(true);
        }

    });
});
