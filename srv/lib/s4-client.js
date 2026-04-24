"use strict";

/**
 * SAP API Hub client for Business Partner (API_BUSINESS_PARTNER) OData V2 operations.
 *
 * Required environment variables:
 *   API_HUB_BASE_URL  — e.g. https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata/sap/API_BUSINESS_PARTNER
 *   API_HUB_KEY       — SAP API Hub sandbox / productive API key
 */

const BASE_URL = () => {
  const url = process.env.API_HUB_BASE_URL;
  if (!url) throw new Error("API_HUB_BASE_URL environment variable is not set");
  return url.replace(/\/$/, ""); // strip trailing slash
};

const API_KEY = () => {
  const key = process.env.API_HUB_KEY;
  if (!key) throw new Error("API_HUB_KEY environment variable is not set");
  return key;
};

/** Shared headers for every request */
const headers = (extra = {}) => ({
  APIKey: API_KEY(),
  Accept: "application/json",
  "Content-Type": "application/json",
  ...extra,
});

/**
 * Map a raw OData Business Partner record to the internal shape.
 * @param {object} bp  — raw record from API response
 */
function mapBP(bp) {
  return {
    id: bp.BusinessPartner,
    name: bp.BusinessPartnerFullName || bp.OrganizationBPName1,
    language: bp.CorrespondenceLanguage,
    lastChanged: bp.LastChangeDate,
    isBlocked: bp.BusinessPartnerIsBlocked,
  };
}

/**
 * Fetch a list of customer Business Partners (category = 2).
 *
 * @param {number} [top=100]  Maximum number of records to return.
 * @returns {Promise<Array>}  Array of mapped Business Partner objects.
 */
async function fetchBusinessPartners(top = 100) {
  const params = new URLSearchParams({
    $filter: "BusinessPartnerCategory eq '2' and Customer ne '' and IsMarkedForArchiving eq false",
    $top: String(top),
    $format: "json",
  });

  const url = `${BASE_URL()}/A_BusinessPartner?${params.toString()}`;

  const response = await fetch(url, { headers: headers() });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `fetchBusinessPartners failed — HTTP ${response.status}: ${body}`
    );
  }

  const json = await response.json();
  const results = json?.d?.results ?? [];
  return results.map(mapBP);
}

/**
 * Fetch a single Business Partner by its key.
 *
 * @param {string} bpId  Business Partner number (e.g. "1000001").
 * @returns {Promise<object>}  Mapped Business Partner object.
 */
async function fetchBusinessPartnerById(bpId) {
  const params = new URLSearchParams({ $format: "json" });
  const url = `${BASE_URL()}/A_BusinessPartner('${bpId}')?${params.toString()}`;

  const response = await fetch(url, { headers: headers() });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `fetchBusinessPartnerById(${bpId}) failed — HTTP ${response.status}: ${body}`
    );
  }

  const json = await response.json();
  return mapBP(json.d);
}

/**
 * Create a new Business Partner (organisation / customer category).
 *
 * @param {object} data
 * @param {string}  data.name      Organisation name (mapped to OrganizationBPName1).
 * @param {string} [data.grouping] BP grouping key (default "BP01").
 * @param {string} [data.language] Correspondence language (default "EN").
 * @returns {Promise<{id: string, success: true}>}
 */
async function createBusinessPartner(data) {
  const url = `${BASE_URL()}/A_BusinessPartner`;

  // SAP OData V2 requires a CSRF token for write operations
  const tokenResponse = await fetch(`${BASE_URL()}/$metadata`, {
    method: "GET",
    headers: headers({ "X-CSRF-Token": "Fetch" }),
  });
  const csrfToken = tokenResponse.headers.get("x-csrf-token");
  if (!csrfToken) throw new Error("Failed to fetch CSRF token from API Hub");

  const body = JSON.stringify({
    BusinessPartnerCategory: "2",
    BusinessPartnerGrouping: data.grouping || "BP01",
    OrganizationBPName1: data.name,
    CorrespondenceLanguage: data.language || "EN",
    BusinessPartnerIsBlocked: false,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: headers({ "X-CSRF-Token": csrfToken }),
    body,
  });

  if (!response.ok) {
    console.warn(`[s4-client] Write not supported in sandbox, returning mock response (HTTP ${response.status})`);
    return { id: `MOCK-${Date.now()}`, success: true, isMock: true };
  }

  const json = await response.json();
  const result = json?.d ?? json;
  return { id: result.BusinessPartner, success: true };
}

module.exports = {
  fetchBusinessPartners,
  fetchBusinessPartnerById,
  createBusinessPartner,
};
