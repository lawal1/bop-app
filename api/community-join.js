const fs = require("node:fs");
const { findContactIdByEmail, trackAction } = require("./ghl-engagement");

// Where the live WhatsApp group link is read from.
// Edit Config!B2 in this sheet to change the link instantly — no redeploy needed.
const CONFIG_SHEET_ID = process.env.BOP_ADMISSIONS_SHEET_ID || "1HPYhjU-SlTgaCw8aLtqeWki1aft6efddkc0IxCypJGA";
const CONFIG_RANGE = "Config!B2";

// Short in-memory cache so warm invocations do not refetch on every click.
// A new link in the sheet goes live within this window.
const CACHE_MS = 60 * 1000;
let cachedLink = { url: "", at: 0 };

function isWhatsAppUrl(value) {
  return (
    typeof value === "string" &&
    (value.startsWith("https://chat.whatsapp.com/") ||
      value.startsWith("https://wa.me/") ||
      value.startsWith("https://api.whatsapp.com/"))
  );
}

function getExportedGwsCredentials() {
  if (process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON) {
    return JSON.parse(process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON);
  }
  if (process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE) {
    return JSON.parse(fs.readFileSync(process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE, "utf8"));
  }
  // Fallback to the discrete GWS_* vars used elsewhere in this project.
  const { GWS_CLIENT_ID, GWS_CLIENT_SECRET, GWS_REFRESH_TOKEN } = process.env;
  if (GWS_CLIENT_ID && GWS_CLIENT_SECRET && GWS_REFRESH_TOKEN) {
    return { client_id: GWS_CLIENT_ID, client_secret: GWS_CLIENT_SECRET, refresh_token: GWS_REFRESH_TOKEN };
  }
  return null;
}

async function getAccessToken() {
  const creds = getExportedGwsCredentials();
  if (!creds?.client_id || !creds?.client_secret || !creds?.refresh_token) return "";
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json().catch(() => ({}));
  return res.ok ? json.access_token : "";
}

// Reads the current link from the Config sheet. Cached, validated, best-effort.
async function getLinkFromSheet() {
  if (cachedLink.url && Date.now() - cachedLink.at < CACHE_MS) return cachedLink.url;
  try {
    const token = await getAccessToken();
    if (!token) return "";
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG_SHEET_ID}/values/${encodeURIComponent(CONFIG_RANGE)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const json = await res.json().catch(() => ({}));
    const url = (json?.values?.[0]?.[0] || "").trim();
    if (isWhatsAppUrl(url)) {
      cachedLink = { url, at: Date.now() };
      return url;
    }
  } catch (error) {
    console.error("Config sheet read failed:", error.message);
  }
  return "";
}

// Resolution order: explicit ?to= (validated) -> live sheet cell -> env var fallback.
async function resolveRedirectUrl(queryTo) {
  if (isWhatsAppUrl(queryTo)) return queryTo;
  const fromSheet = await getLinkFromSheet();
  if (fromSheet) return fromSheet;
  const envUrl = (process.env.KOPPOH_BOP_COMMUNITY_URL || "").trim();
  return isWhatsAppUrl(envUrl) ? envUrl : "";
}

module.exports = async (req, res) => {
  const redirectUrl = await resolveRedirectUrl(req.query?.to);
  const contactIdParam = req.query?.contactId || req.query?.contact_id || req.query?.id;
  const emailParam = req.query?.email || req.query?.e;

  try {
    const contactId = contactIdParam || (await findContactIdByEmail(emailParam));
    if (!contactId) throw new Error("Missing contactId or known contact email");

    await trackAction(contactId, "community");
  } catch (error) {
    console.error("Community join tracking failed:", error.message);
  }

  if (redirectUrl) {
    res.writeHead(302, { Location: redirectUrl, "Cache-Control": "no-store, no-cache, must-revalidate" });
    return res.end();
  }

  return res.status(200).send("Your community click has been recorded. The community link is not configured yet.");
};
