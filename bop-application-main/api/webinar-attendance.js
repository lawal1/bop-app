const { trackAction } = require("./ghl-engagement");
const fs = require("node:fs");

const SHEET_ID = process.env.BOP_WEBINAR_ATTENDANCE_SHEET_ID || "1Hzf81otsIgjw3iIZV99ZV2rRYyd13-Oc0Ox8WUlgJLc";
const GHL_LOCATION_ID = process.env.KOPPOH_GHL_LOCATION_ID;
const GHL_PIT_TOKEN = process.env.KOPPOH_GHL_PIT_TOKEN;
const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const UNKNOWN_WEBINAR_TAG = "bop-webinar-attendee-unknown";
const WEBINAR_STATUS_FIELD_ID = "35LsJoYXcSuSmgTpIT2P";

function ghlHeaders() {
  return {
    Authorization: `Bearer ${GHL_PIT_TOKEN}`,
    Version: GHL_VERSION,
    "Content-Type": "application/json",
  };
}

async function ghl(path, options = {}) {
  const res = await fetch(`${GHL_BASE}${path}`, {
    ...options,
    headers: { ...ghlHeaders(), ...(options.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GHL ${options.method || "GET"} ${path} failed: ${JSON.stringify(json)}`);
  return json;
}

function getExportedGwsCredentials() {
  if (process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON) {
    return JSON.parse(process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON);
  }
  if (process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE) {
    return JSON.parse(fs.readFileSync(process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE, "utf8"));
  }
  return null;
}

async function getAccessTokenFromExportedGwsCredentials() {
  const credentials = getExportedGwsCredentials();
  if (!credentials?.client_id || !credentials?.client_secret || !credentials?.refresh_token) {
    throw new Error("Google Workspace credentials are not configured.");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      refresh_token: credentials.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(`Google token refresh failed: ${JSON.stringify(tokenJson)}`);
  return tokenJson.access_token;
}

function lagosDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

async function appendAttendanceLog({ name, email, phone }) {
  const token = await getAccessTokenFromExportedGwsCredentials();
  const { date } = lagosDateParts();
  const row = [date, name, email, phone];
  const appendRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Attendance!A:D:append?valueInputOption=RAW&insertDataOption=OVERWRITE`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [row] }),
    }
  );
  const appendJson = await appendRes.json().catch(async () => ({ raw: await appendRes.text() }));
  if (!appendRes.ok) throw new Error(`Attendance Sheet append failed: ${JSON.stringify(appendJson)}`);
  return appendJson;
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") return JSON.parse(body || "{}");
  if (Buffer.isBuffer(body)) return JSON.parse(body.toString("utf8") || "{}");
  return body;
}

function normalizePhone(value) {
  return String(value || "").replace(/[^\d+]/g, "");
}

function normalizePhoneDigits(value) {
  const digits = normalizePhone(value).replace(/\D/g, "");
  if (digits.startsWith("234") && digits.length === 13) return `0${digits.slice(3)}`;
  return digits;
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesMatch(inputName, contact) {
  const input = normalizeName(inputName);
  const contactName = normalizeName(contact.name || `${contact.firstName || ""} ${contact.lastName || ""}`);
  if (!input || !contactName) return false;

  const inputParts = input.split(" ").filter(Boolean);
  const contactParts = contactName.split(" ").filter(Boolean);
  if (input === contactName) return true;
  if (inputParts.length < 2 || contactParts.length < 2) return inputParts[0] && inputParts[0] === contactParts[0];

  const shared = inputParts.filter((part) => contactParts.includes(part));
  return shared.length >= 2;
}

function emailsMatch(inputEmail, contact) {
  return Boolean(inputEmail && contact.email && String(inputEmail).toLowerCase() === String(contact.email).toLowerCase());
}

function phonesMatch(inputPhone, contact) {
  const input = normalizePhoneDigits(inputPhone);
  const contactPhone = normalizePhoneDigits(contact.phone);
  if (!input || !contactPhone) return false;
  return input.endsWith(contactPhone) || contactPhone.endsWith(input);
}

function matchScore(input, contact) {
  const matches = {
    name: namesMatch(input.name, contact),
    email: emailsMatch(input.email, contact),
    phone: phonesMatch(input.phone, contact),
  };
  return { matches, score: Object.values(matches).filter(Boolean).length };
}

async function searchContacts(query) {
  const value = String(query || "").trim();
  if (!value) return [];

  const data = await ghl(`/contacts/?locationId=${GHL_LOCATION_ID}&query=${encodeURIComponent(value)}&limit=10`);
  return data.contacts || [];
}

async function findValidatedContact(input) {
  const candidates = new Map();
  const searches = [input.email, input.phone, input.name].filter(Boolean);

  for (const query of searches) {
    const contacts = await searchContacts(query);
    contacts.forEach((contact) => {
      if (contact.id) candidates.set(contact.id, contact);
    });
  }

  const scored = [...candidates.values()]
    .map((contact) => ({ contact, ...matchScore(input, contact) }))
    .sort((a, b) => b.score - a.score);

  return scored.find((item) => item.score >= 2) || scored[0] || null;
}

async function addGHLTags(contactId, tags) {
  await ghl(`/contacts/${contactId}/tags`, {
    method: "POST",
    body: JSON.stringify({ tags }),
  });
}

async function updateGHLContact(contactId, body) {
  return ghl(`/contacts/${contactId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

async function upsertUnknownWebinarAttendee({ name, email, phone }) {
  const nameParts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ");
  const data = await ghl("/contacts/upsert", {
    method: "POST",
    body: JSON.stringify({
      locationId: GHL_LOCATION_ID,
      firstName,
      lastName,
      email: email || undefined,
      phone: phone || undefined,
      source: "BOP Webinar Attendance Form",
    }),
  });
  const contact = data.contact || data;
  if (!contact?.id) throw new Error("GHL unknown attendee upsert did not return a contact ID.");

  await addGHLTags(contact.id, [UNKNOWN_WEBINAR_TAG]);
  await updateGHLContact(contact.id, {
    customFields: [{ id: WEBINAR_STATUS_FIELD_ID, value: "Unknown Attendee" }],
  });
  return contact;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });

  try {
    const data = parseBody(req.body);
    const name = String(data.name || "").trim();
    const email = String(data.email || "").trim().toLowerCase();
    const phone = String(data.phone || "").trim();
    const webinarTitle = String(data.webinarTitle || "BOP Admissions Webinar").trim();
    const webinarDate = String(data.webinarDate || "").trim();
    const webinarTime = String(data.webinarTime || "").trim();

    if (!name || !email || !phone) throw new Error("Full name, email, and phone are required.");

    await appendAttendanceLog({ name, email, phone });

    const crm = {
      attempted: false,
      moved: false,
      classified: "not-attempted",
      matchScore: 0,
      matches: null,
      contactId: null,
      error: null,
    };

    if (GHL_LOCATION_ID && GHL_PIT_TOKEN) {
      crm.attempted = true;
      try {
        const validated = await findValidatedContact({ name, email, phone });
        if (validated?.contact?.id && validated.score >= 2) {
          const engagementScore = await trackAction(validated.contact.id, "webinar");
          crm.moved = true;
          crm.classified = "validated-webinar-attended";
          crm.matchScore = validated.score;
          crm.matches = validated.matches;
          crm.contactId = validated.contact.id;
          crm.engagementScore = engagementScore;
        } else {
          const unknownContact = await upsertUnknownWebinarAttendee({ name, email, phone });
          crm.classified = "unknown-webinar-attendee";
          crm.matchScore = validated?.score || 0;
          crm.matches = validated?.matches || null;
          crm.contactId = unknownContact.id;
          crm.unknownTag = UNKNOWN_WEBINAR_TAG;
          crm.error = "No CRM contact matched at least 2 of name, email, and phone. Tagged as unknown webinar attendee.";
        }
      } catch (error) {
        crm.classified = "crm-error";
        crm.error = error.message;
        console.error("Webinar attendance CRM update failed:", error.message);
      }
    } else {
      crm.classified = "crm-not-configured";
      crm.error = "GHL is not configured.";
    }

    return res.status(200).json({
      success: true,
      logged: true,
      crm,
      webinar: { title: webinarTitle, date: webinarDate, time: webinarTime },
    });
  } catch (error) {
    console.error("Webinar attendance failed:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};
