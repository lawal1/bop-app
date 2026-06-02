const SHEET_ID = process.env.BOP_ADMISSIONS_SHEET_ID || "1HPYhjU-SlTgaCw8aLtqeWki1aft6efddkc0IxCypJGA";
const GHL_LOCATION_ID = process.env.KOPPOH_GHL_LOCATION_ID;
const GHL_PIT_TOKEN = process.env.KOPPOH_GHL_PIT_TOKEN;
const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { refreshEngagementScore } = require("./ghl-engagement");
const STATUS_FIELD_IDS = {
  community: "eVA2TbqKcGzjCyYhXScr",
  webinar: "35LsJoYXcSuSmgTpIT2P",
  offer: "M86ptPjfc8zDzsHCUt6n",
  enrollment: "IaZZ2wzWxmK5QWj097Uj",
};
const BOP_FIELD_IDS = {
  score: "baiyn6YFSHl5flGHb03J",
  scorePercent: "oa7eDmlCQxzOpLYrmzfA",
  engagementScore: "9TJLm8PcrmATCy0gWsBr",
  leadTier: "GUMoXzk3vCmbasipb2dz",
  applicationStatus: "YrE8LDrSVmFx1kRPQ71I",
  businessStage: "cLEKBpV0zHunDE9UmGeg",
  revenue90: "9C1qAz3lc9eq4fsA4mk8",
  highestClient: "MdeGQdVukXTZ1I30rMTO",
  bookingFrequency: "lsSw5GwS2q0w5VhIlmlw",
  timeCommitment: "lznu53QfYHVFexuxS6KT",
  paymentReadiness: "7G7JhMN6ClcokZwrU39u",
  portfolioUrl: "Ee5C5PHQIKH1Z3QyhzSM",
  achievementGoals: "EwjXKUxymOhI3N9qCryQ",
  mainBusinessGap: "NqinCnSkNFTyoX6z13XP",
  responseSummary: "9hKDP8WOygCrCgw7JW4J",
  gapFeedback: "WJ4blK2rTUp7e9wXhBcm",
  leadSource: "qXlBt96FN2I8l0dgDRu0",
};

const scoreMaps = {
  businessStage: { "Not started": 0, Beginner: 1, Inconsistent: 2, Underpaid: 3, Scaling: 4 },
  revenue90: { "Less than 500k": 1, "500k - 1m": 2, "1m - 5m": 3, "5m - 10m": 4, "10m or more": 5 },
  highestClient: { "Less than 500k": 1, "500k - 1m": 2, "1m - 5m": 3, "5m - 10m": 4, "10m or more": 5 },
  bookingFrequency: { "Never gotten a client": 0, "Once in a while": 1, "Get clients consistently": 3, "Fully booked": 4 },
  timeCommitment: { Yes: 3, No: 0 },
  paymentReadiness: { "Ready now": 4, "Few days or weeks": 3, "Payment plan": 2, "Just exploring": 0 },
  achievementGoals: {
    "Get consistent bookings": 2,
    "Charge premium prices": 3,
    "Improve my photography skills in general": 2,
    "Shoot and deliver weddings at a higher standard": 2,
    "Build a portfolio that attracts better clients": 3,
    "Build better client systems": 3,
    "Build a multi-million photography business": 4,
    "All of the above": 7,
  },
  branchReason: {
    "I do not know how to find serious clients": 1,
    "I do not know how to package or price my offer": 2,
    "I lack confidence in my work and portfolio": 1,
    "I need direct guidance and accountability": 2,
    "I depend too much on random referrals": 2,
    "I do not have a clear client acquisition system": 3,
    "My pricing and offer are not structured well": 2,
    "I struggle with follow-up and conversion": 2,
    "My positioning does not communicate premium value": 3,
    "I do not know how to defend higher prices": 2,
    "My portfolio or client experience does not justify the fee yet": 2,
    "I lack guidance on how premium photography businesses sell": 3,
    "Stronger brand positioning and market perception": 3,
    "Better systems for enquiries, contracts, delivery and follow-up": 3,
    "A more premium client experience": 3,
    "Better financial structure and business discipline": 2,
    "All of the above": 4,
  },
};

function score(data, key) {
  return scoreMaps[key]?.[data[key]] || 0;
}

function multiScore(data, key) {
  const values = Array.isArray(data[key]) ? data[key] : [];
  return values.reduce((sum, value) => sum + (scoreMaps[key]?.[value] || 0), 0);
}

function wordCount(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function containsAny(text, terms) {
  const lower = String(text || "").toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function gwsCandidates() {
  const localBin = path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "gws.cmd" : "gws");
  const localCliJs = path.join(process.cwd(), "node_modules", "@googleworkspace", "cli", "run-gws.js");
  const localCliJsLegacy = path.join(process.cwd(), "node_modules", "@googleworkspace", "cli", "run.js");
  const candidates = [
    process.env.GWS_CLI_PATH && { command: process.env.GWS_CLI_PATH, prefixArgs: [] },
    { command: process.execPath, prefixArgs: [localCliJs] },
    { command: process.execPath, prefixArgs: [localCliJsLegacy] },
    { command: localBin, prefixArgs: [] },
  ];
  if (process.platform === "win32" && process.env.APPDATA) {
    candidates.push(
      { command: process.execPath, prefixArgs: [path.join(process.env.APPDATA, "npm", "node_modules", "@googleworkspace", "cli", "run-gws.js")] },
      { command: process.execPath, prefixArgs: [path.join(process.env.APPDATA, "npm", "node_modules", "@googleworkspace", "cli", "run.js")] },
      { command: path.join(process.env.APPDATA, "npm", "gws.cmd"), prefixArgs: [] }
    );
  }
  candidates.push({ command: "gws", prefixArgs: [] });
  return candidates.filter(Boolean);
}

function prepareGwsCredentialsEnv() {
  if (process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON && !process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE) {
    const credentialsPath = path.join(os.tmpdir(), "gws-credentials.json");
    fs.writeFileSync(credentialsPath, process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON, { mode: 0o600 });
    process.env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE = credentialsPath;
  }
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
    return null;
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
  if (!tokenRes.ok) throw new Error(`gws credential token refresh failed: ${JSON.stringify(tokenJson)}`);
  return tokenJson.access_token;
}

function runGws(args) {
  prepareGwsCredentialsEnv();
  const candidates = gwsCandidates();

  return new Promise((resolve, reject) => {
    const tryNext = (index, previousError) => {
      const command = candidates[index];
      if (!command) {
        reject(previousError || new Error("gws CLI not found"));
        return;
      }

      try {
        execFile(command.command, [...command.prefixArgs, ...args], { timeout: 20000, windowsHide: true }, (error, stdout, stderr) => {
          if (error) {
            tryNext(index + 1, new Error(stderr || error.message));
            return;
          }

          resolve({ stdout, stderr, command: command.command });
        });
      } catch (error) {
        tryNext(index + 1, error);
      }
    };

    tryNext(0);
  });
}

async function appendToSheet(row) {
  const accessToken = await getAccessTokenFromExportedGwsCredentials();
  if (accessToken) {
    const appendRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/A:AA:append?valueInputOption=RAW&insertDataOption=OVERWRITE`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [row] }),
      }
    );
    const appendJson = await appendRes.json().catch(async () => ({ raw: await appendRes.text() }));
    if (!appendRes.ok) throw new Error(`gws credential Sheet append failed: ${JSON.stringify(appendJson)}`);
    return appendJson;
  }

  const jsonValues = JSON.stringify([row.map((value) => (value === undefined || value === null ? "" : String(value)))]);
  const result = await runGws([
    "sheets",
    "+append",
    "--spreadsheet",
    SHEET_ID,
    "--json-values",
    jsonValues,
    "--format",
    "json",
  ]);
  return result.stdout ? JSON.parse(result.stdout) : { success: true };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function bold(value) {
  return `<strong>${escapeHtml(value)}</strong>`;
}

function firstName(name) {
  return String(name || "Applicant").trim().split(/\s+/)[0] || "Applicant";
}

function buildFeedbackTemplate(data, achievementGoals, status) {
  const branch = String(data.branchReason || "").toLowerCase();
  const goals = Array.isArray(achievementGoals) ? achievementGoals : [];
  const hasGoal = (goal) => goals.includes(goal);
  const issueScores = { acquisition: 0, consistency: 0, premium: 0, portfolio: 0, systems: 0, foundation: 0, readiness: 0 };

  if (data.businessStage === "Not started") issueScores.acquisition += 36;
  if (data.businessStage === "Beginner") issueScores.acquisition += 30;
  if (data.bookingFrequency === "Never gotten a client") issueScores.acquisition += 35;
  if (branch.includes("find serious clients") || branch.includes("client acquisition")) issueScores.acquisition += 25;

  if (data.businessStage === "Inconsistent") issueScores.consistency += 30;
  if (data.bookingFrequency === "Once in a while") issueScores.consistency += 30;
  if (branch.includes("random referrals") || branch.includes("follow-up") || branch.includes("conversion")) issueScores.consistency += 24;
  if (hasGoal("Get consistent bookings")) issueScores.consistency += 14;

  if (data.businessStage === "Underpaid") issueScores.premium += 30;
  if (hasGoal("Charge premium prices")) issueScores.premium += 22;
  if (branch.includes("premium value") || branch.includes("higher prices") || branch.includes("defend higher prices")) issueScores.premium += 28;
  if (data.highestClient === "500k - 1m" || data.highestClient === "1m - 5m") issueScores.premium += 10;

  if (hasGoal("Build a portfolio that attracts better clients")) issueScores.portfolio += 25;
  if (branch.includes("portfolio") || branch.includes("client experience") || branch.includes("justify the fee")) issueScores.portfolio += 28;

  if (data.businessStage === "Scaling") issueScores.systems += 30;
  if (data.bookingFrequency === "Fully booked") issueScores.systems += 30;
  if (hasGoal("Build better client systems") || hasGoal("Build a multi-million photography business") || hasGoal("All of the above")) issueScores.systems += 20;
  if (branch.includes("systems") || branch.includes("contracts") || branch.includes("delivery") || branch.includes("financial structure") || branch.includes("brand positioning")) issueScores.systems += 28;

  if (data.revenue90 === "Less than 500k") issueScores.foundation += 25;
  if (data.highestClient === "Less than 500k") issueScores.foundation += 25;
  if (data.bookingFrequency === "Never gotten a client") issueScores.foundation += 15;

  if (data.timeCommitment === "No") issueScores.readiness += 30;
  if (data.paymentReadiness === "Just exploring") issueScores.readiness += 35;
  if (data.paymentReadiness === "Payment plan") issueScores.readiness += 10;

  const diagnosis = Object.entries(issueScores).sort((a, b) => b[1] - a[1])[0]?.[0] || "acquisition";
  const name = firstName(data.name);
  const selectedGoal = goals.find((goal) => goal !== "All of the above") || goals[0] || "your selected goal";
  const mainGap = data.branchReason || "your selected business gap";
  const booking = data.bookingFrequency || "your current booking pattern";
  const revenue = data.revenue90 || "your recent photography revenue";
  const highestClient = data.highestClient || "your highest client value";
  const timeCommitment = data.timeCommitment || "your time commitment answer";
  const paymentReadiness = data.paymentReadiness || "your payment readiness answer";

  const template = {
    acquisition: {
      text: `${name}, your application shows ${status}. Your answers suggest that your biggest challenge is getting serious paying clients. You selected ${mainGap}, and your current booking pattern is ${booking}. Your work may be good, but you need a clearer system for attracting serious clients and turning enquiries into paid bookings. The next step is to join our free webinar, where we will explain BOP in detail and show you how it can help you build a stronger client acquisition system.`,
      html: `${escapeHtml(name)}, your application shows ${bold(status)}. Your answers suggest that your biggest challenge is ${bold("getting serious paying clients")}. You selected ${bold(mainGap)}, and your current booking pattern is ${bold(booking)}. Your work may be good, but you need a clearer system for attracting serious clients and turning enquiries into paid bookings. The next step is to join our free webinar, where we will explain BOP in detail and show you how it can help you build a stronger client acquisition system.`,
    },
    consistency: {
      text: `${name}, your application shows ${status}. You are already getting some paid work, but your answers point to inconsistent bookings as the main issue. You selected ${mainGap}, and your booking pattern is ${booking}. This means you need a more reliable system for enquiries, follow-up, and conversion, so your business is not depending only on random referrals. The next step is to join our free webinar, where we will explain BOP in detail and show you how it can help you get more consistent bookings.`,
      html: `${escapeHtml(name)}, your application shows ${bold(status)}. You are already getting some paid work, but your answers point to ${bold("inconsistent bookings")} as the main issue. You selected ${bold(mainGap)}, and your booking pattern is ${bold(booking)}. This means you need a more reliable system for enquiries, follow-up, and conversion, so your business is not depending only on random referrals. The next step is to join our free webinar, where we will explain BOP in detail and show you how it can help you get more consistent bookings.`,
    },
    premium: {
      text: `${name}, your application shows ${status}. You are already getting clients, but your answers point to premium positioning as the main gap. Your highest client value is ${highestClient}, and you selected ${mainGap}. Your work has value, but your offer, pricing, and client experience need to be stronger before clients will confidently pay premium prices. The next step is to join our free webinar, where we will explain BOP in detail and show you how it can help you improve your pricing, positioning, and client systems.`,
      html: `${escapeHtml(name)}, your application shows ${bold(status)}. You are already getting clients, but your answers point to ${bold("premium positioning")} as the main gap. Your highest client value is ${bold(highestClient)}, and you selected ${bold(mainGap)}. Your work has value, but your offer, pricing, and client experience need to be stronger before clients will confidently pay premium prices. The next step is to join our free webinar, where we will explain BOP in detail and show you how it can help you improve your pricing, positioning, and client systems.`,
    },
    portfolio: {
      text: `${name}, your application shows ${status}. Your answers suggest that the main gap is portfolio trust. You selected ${mainGap}, and one of your goals is ${selectedGoal}. This means your work needs to be presented in a way that makes better clients trust your skill, your process, and your price. The next step is to join our free webinar, where we will explain BOP in detail and show you how it can help you build stronger proof, better positioning, and a more convincing client experience.`,
      html: `${escapeHtml(name)}, your application shows ${bold(status)}. Your answers suggest that the main gap is ${bold("portfolio trust")}. You selected ${bold(mainGap)}, and one of your goals is ${bold(selectedGoal)}. This means your work needs to be presented in a way that makes better clients trust your skill, your process, and your price. The next step is to join our free webinar, where we will explain BOP in detail and show you how it can help you build stronger proof, better positioning, and a more convincing client experience.`,
    },
    systems: {
      text: `${name}, your application shows ${status}. Your answers suggest that you already have momentum, but your biggest gap is business structure. You selected ${mainGap}, and your booking pattern is ${booking}. This means the next level is not just getting more jobs; it is building better systems for enquiries, pricing, delivery, follow-up, and client experience. The next step is to join our free webinar, where we will explain BOP in detail and show you how it can help you structure your photography business for growth.`,
      html: `${escapeHtml(name)}, your application shows ${bold(status)}. Your answers suggest that you already have momentum, but your biggest gap is ${bold("business structure")}. You selected ${bold(mainGap)}, and your booking pattern is ${bold(booking)}. This means the next level is not just getting more jobs; it is building better systems for enquiries, pricing, delivery, follow-up, and client experience. The next step is to join our free webinar, where we will explain BOP in detail and show you how it can help you structure your photography business for growth.`,
    },
    foundation: {
      text: `${name}, your application shows ${status}. Your answers suggest that your biggest gap is business foundation. Your recent photography revenue is ${revenue}, and your highest client value is ${highestClient}. This means you need to strengthen how you package your work, price your service, and convert interest into paid jobs. The next step is to join our free webinar, where we will explain BOP in detail and show you how it can help you build a stronger photography business foundation.`,
      html: `${escapeHtml(name)}, your application shows ${bold(status)}. Your answers suggest that your biggest gap is ${bold("business foundation")}. Your recent photography revenue is ${bold(revenue)}, and your highest client value is ${bold(highestClient)}. This means you need to strengthen how you package your work, price your service, and convert interest into paid jobs. The next step is to join our free webinar, where we will explain BOP in detail and show you how it can help you build a stronger photography business foundation.`,
    },
    readiness: {
      text: `${name}, your application shows ${status}. Your answers suggest that you are interested in BOP, but your readiness is still unclear. You selected ${timeCommitment} for time commitment and ${paymentReadiness} for payment readiness. This means you may need more clarity on the programme, the commitment required, and whether this is the right time for you to join. The next step is to join our free webinar, where we will explain BOP in detail and help you decide if the programme is the right fit.`,
      html: `${escapeHtml(name)}, your application shows ${bold(status)}. Your answers suggest that you are interested in BOP, but your ${bold("readiness is still unclear")}. You selected ${bold(timeCommitment)} for time commitment and ${bold(paymentReadiness)} for payment readiness. This means you may need more clarity on the programme, the commitment required, and whether this is the right time for you to join. The next step is to join our free webinar, where we will explain BOP in detail and help you decide if the programme is the right fit.`,
    },
  };

  return template[diagnosis] || template.acquisition;
}

function buildGapFeedback(data, achievementGoals, status) {
  return buildFeedbackTemplate(data, achievementGoals, status).text;
}

function buildGapFeedbackHtml(data, achievementGoals, status) {
  return buildFeedbackTemplate(data, achievementGoals, status).html;
}

function buildReview(data) {
  const achievementGoals = Array.isArray(data.achievementGoals) ? data.achievementGoals : [];
  const text = [data.branchReason, data.whyNow, data.sixMonthImpact, data.whyBedge, achievementGoals.join(" ")].join(" ");
  const commercial = Math.min(40, score(data, "businessStage") * 2.5 + score(data, "revenue90") * 2 + score(data, "highestClient") * 1.6 + score(data, "bookingFrequency") * 2 + score(data, "branchReason"));
  const commitment = Math.min(15, score(data, "timeCommitment") * 1.7 + score(data, "paymentReadiness") * 1.75 + Math.min(multiScore(data, "achievementGoals"), 3));
  const theory = Math.min(
    15,
    Math.min(Math.floor(wordCount(text) / 25), 9) +
      (containsAny(text, ["client", "pricing", "premium", "brand", "business", "system", "income", "portfolio", "wedding", "commercial", "team", "structure", "global", "million"]) ? 3 : 0) +
      (data.admissionsConsent ? 1 : 0) +
      (wordCount(data.whyBedge) > 35 ? 2 : 0)
  );
  const rawScore = Math.min(70, Math.round(commercial + commitment + theory));
  let status = "Early Potential";
  let lead = "Low Lead";
  if (rawScore >= 56) {
    status = "Priority Applicant";
    lead = "High Lead";
  } else if (rawScore >= 40) {
    status = "Strong Potential";
    lead = "Medium Lead";
  } else if (rawScore >= 28) {
    status = "Early Potential";
    lead = "Medium Lead";
  }
  return {
    total: rawScore,
    rawScore,
    percent: rawScore,
    status,
    lead,
    headline: "Application submitted for review.",
    intro: "Your BOP application has been received. We have completed an initial readiness review based on your commercial evidence, written responses, and fit for The Business of Photography by Bedge.",
    gap: buildGapFeedback(data, achievementGoals, status),
    gapHtml: buildGapFeedbackHtml(data, achievementGoals, status),
    next: "Your application may be considered for the next stage of admission. To proceed, you are required to attend the admissions webinar, where the team will explain the programme structure, selection expectations, payment options, and what is required to secure admission.",
  };
}

function ghlHeaders() {
  return {
    Authorization: `Bearer ${GHL_PIT_TOKEN}`,
    Version: GHL_VERSION,
    "Content-Type": "application/json",
  };
}

function tierTag(rawScore) {
  if (rawScore >= 56) return "bop-hot-lead";
  if (rawScore >= 40) return "bop-warm-lead";
  return "bop-cold-lead";
}

function formatList(value) {
  return Array.isArray(value) ? value.join("; ") : String(value || "");
}

function buildResponseSummary(data, review) {
  return [
    `Score: ${review.percent}%`,
    `Status: ${review.status}`,
    `Business stage: ${data.businessStage || "Not provided"}`,
    `90-day revenue: ${data.revenue90 || "Not provided"}`,
    `Highest client value: ${data.highestClient || "Not provided"}`,
    `Booking frequency: ${data.bookingFrequency || "Not provided"}`,
    `Main business gap: ${data.branchReason || "Not provided"}`,
    `Goals: ${formatList(data.achievementGoals) || "Not provided"}`,
    `Time commitment: ${data.timeCommitment || "Not provided"}`,
    `Payment readiness: ${data.paymentReadiness || "Not provided"}`,
  ].join("\n");
}

function buildGHLCustomFields(data, review, preserveStatuses = false) {
  const fields = [
    { id: BOP_FIELD_IDS.score, value: String(review.rawScore) },
    { id: BOP_FIELD_IDS.scorePercent, value: String(review.percent) },
    { id: BOP_FIELD_IDS.engagementScore, value: String(review.rawScore) },
    { id: BOP_FIELD_IDS.leadTier, value: tierTag(review.rawScore).replace("bop-", "").replace("-lead", "") },
    { id: BOP_FIELD_IDS.applicationStatus, value: review.status },
    { id: BOP_FIELD_IDS.leadSource, value: data.source || "" },
    { id: BOP_FIELD_IDS.businessStage, value: data.businessStage || "" },
    { id: BOP_FIELD_IDS.revenue90, value: data.revenue90 || "" },
    { id: BOP_FIELD_IDS.highestClient, value: data.highestClient || "" },
    { id: BOP_FIELD_IDS.bookingFrequency, value: data.bookingFrequency || "" },
    { id: BOP_FIELD_IDS.timeCommitment, value: data.timeCommitment || "" },
    { id: BOP_FIELD_IDS.paymentReadiness, value: data.paymentReadiness || "" },
    { id: BOP_FIELD_IDS.portfolioUrl, value: data.portfolio || "" },
    { id: BOP_FIELD_IDS.achievementGoals, value: formatList(data.achievementGoals) },
    { id: BOP_FIELD_IDS.mainBusinessGap, value: data.branchReason || "" },
    { id: BOP_FIELD_IDS.responseSummary, value: buildResponseSummary(data, review) },
    { id: BOP_FIELD_IDS.gapFeedback, value: review.gap || "" },
  ];

  if (!preserveStatuses) {
    fields.push(
      { id: STATUS_FIELD_IDS.community, value: "Not Joined" },
      { id: STATUS_FIELD_IDS.webinar, value: "Not Registered" },
      { id: STATUS_FIELD_IDS.offer, value: "Not Sent" },
      { id: STATUS_FIELD_IDS.enrollment, value: "Not Enrolled" }
    );
  }

  return fields;
}

async function upsertGHLContact(data, review) {
  const nameParts = String(data.name || "").trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  const body = {
    locationId: GHL_LOCATION_ID,
    firstName,
    lastName,
    email: data.email || undefined,
    phone: data.phone || undefined,
    source: data.source || "BOP Admissions Form",
  };

  const res = await fetch(`${GHL_BASE}/contacts/upsert`, {
    method: "POST",
    headers: ghlHeaders(),
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(`GHL contact upsert failed: ${JSON.stringify(json)}`);
  if (json.contact?.id) {
    await updateGHLCustomFields(json.contact.id, buildGHLCustomFields(data, review, true));
    await setInitialGHLStatuses(json.contact.id);
    await addGHLTags(json.contact.id, ["bop-applicant", tierTag(review.rawScore)]);
    await refreshEngagementScore(json.contact.id);
  }
  return json.contact;
}

async function updateGHLCustomFields(contactId, customFields) {
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
    method: "PUT",
    headers: ghlHeaders(),
    body: JSON.stringify({ customFields }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(`GHL custom fields update failed: ${JSON.stringify(json)}`);
}

async function addGHLTags(contactId, tags) {
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
    method: "POST",
    headers: ghlHeaders(),
    body: JSON.stringify({ tags }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(`GHL tags update failed: ${JSON.stringify(json)}`);
}

async function setInitialGHLStatuses(contactId) {
  const currentRes = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
    headers: ghlHeaders(),
  });
  const current = await currentRes.json();
  if (!currentRes.ok) throw new Error(`GHL contact fetch failed: ${JSON.stringify(current)}`);

  const existingFields = current.contact?.customFields || [];
  const hasValue = (id) => {
    const field = existingFields.find((item) => item.id === id);
    return field?.value !== undefined && field?.value !== null && String(field.value).trim() !== "";
  };
  const customFields = [
    !hasValue(STATUS_FIELD_IDS.community) && { id: STATUS_FIELD_IDS.community, value: "Not Joined" },
    !hasValue(STATUS_FIELD_IDS.webinar) && { id: STATUS_FIELD_IDS.webinar, value: "Not Registered" },
    !hasValue(STATUS_FIELD_IDS.offer) && { id: STATUS_FIELD_IDS.offer, value: "Not Sent" },
    !hasValue(STATUS_FIELD_IDS.enrollment) && { id: STATUS_FIELD_IDS.enrollment, value: "Not Enrolled" },
  ].filter(Boolean);
  if (!customFields.length) return;

  await updateGHLCustomFields(contactId, customFields);
}

async function getOrFindPipeline() {
  const res = await fetch(`${GHL_BASE}/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`, {
    headers: ghlHeaders(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`GHL pipeline fetch failed: ${JSON.stringify(json)}`);

  const pipelines = json.pipelines ?? [];
  const pipeline = pipelines.find((p) => p.name === "BOP Admissions");
  if (!pipeline) throw new Error("BOP Admissions pipeline not found in GHL. Create it first.");

  const appliedStage = pipeline.stages?.find((s) => s.name === "Applied");
  if (!appliedStage) throw new Error("Applied stage not found in BOP Admissions pipeline.");

  return { pipelineId: pipeline.id, stageId: appliedStage.id };
}

async function createGHLOpportunity(contactId, data, review) {
  const { pipelineId, stageId } = await getOrFindPipeline();

  const name = String(data.name || "").trim() || data.email || "BOP Applicant";
  const body = {
    pipelineId,
    locationId: GHL_LOCATION_ID,
    name: `${name} — BOP Application`,
    pipelineStageId: stageId,
    status: "open",
    contactId,
    monetaryValue: 0,
  };

  const res = await fetch(`${GHL_BASE}/opportunities/`, {
    method: "POST",
    headers: ghlHeaders(),
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(`GHL opportunity creation failed: ${JSON.stringify(json)}`);
  return json.opportunity;
}

async function pushToGHL(data, review) {
  if (!GHL_LOCATION_ID || !GHL_PIT_TOKEN) {
    console.warn("GHL env vars missing — skipping CRM push");
    return null;
  }

  try {
    const contact = await upsertGHLContact(data, review);
    const opportunity = await createGHLOpportunity(contact.id, data, review);
    return { contactId: contact.id, opportunityId: opportunity?.id ?? null };
  } catch (err) {
    console.error("GHL push error:", err.message);
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });

  try {
    const data = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const review = buildReview(data);
    const timestamp = new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" });

    const row = [
      timestamp,
      data.name || "",
      data.email || "",
      data.phone || "",
      data.ageRange || "",
      data.country || "",
      data.region || "",
      data.role || "",
      data.niche || "",
      data.source || "",
      data.portfolio || "",
      data.businessStage || "",
      data.revenue90 || "",
      data.highestClient || "",
      data.bookingFrequency || "",
      data.branchReason || "",
      Array.isArray(data.achievementGoals) ? data.achievementGoals.join("; ") : "",
      data.timeCommitment || "",
      data.paymentReadiness || "",
      data.whyNow || "",
      data.sixMonthImpact || "",
      data.whyBedge || "",
      review.rawScore,
      review.status,
      review.lead,
      review.gap,
      review.next,
    ];

    const [sheetResult, ghlResult] = await Promise.allSettled([appendToSheet(row), pushToGHL(data, review)]);
    const integrations = {
      sheet:
        sheetResult.status === "fulfilled"
          ? { success: true, result: sheetResult.value }
          : { success: false, error: sheetResult.reason?.message || String(sheetResult.reason) },
      ghl:
        ghlResult.status === "fulfilled" && ghlResult.value
          ? { success: true, result: ghlResult.value }
          : { success: false, error: ghlResult.status === "rejected" ? ghlResult.reason?.message || String(ghlResult.reason) : "GHL push skipped or failed" },
    };

    if (!integrations.sheet.success && !integrations.ghl.success) {
      throw new Error(`All integrations failed. Sheet: ${integrations.sheet.error}. GHL: ${integrations.ghl.error}`);
    }

    return res.status(200).json({ success: true, review, integrations, ghl: integrations.ghl.result || null });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
