const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const csvPath = path.join(root, "applications.csv");
const port = process.env.PORT || 4178;

const headers = [
  "timestamp",
  "name",
  "email",
  "phone",
  "ageRange",
  "country",
  "region",
  "role",
  "niche",
  "source",
  "portfolio",
  "businessStage",
  "revenue90",
  "highestClient",
  "bookingFrequency",
  "branchReason",
  "achievementGoals",
  "timeCommitment",
  "paymentReadiness",
  "whyNow",
  "sixMonthImpact",
  "whyBedge",
  "score",
  "applicationStatus",
  "leadCategory",
];

function invokeApiHandler(handler, req, res, body) {
  req.body = body;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(payload));
  };
  res.send = (payload) => {
    res.end(payload);
  };
  return handler(req, res);
}

const scoreMaps = {
  businessStage: { "Not started": 0, Beginner: 1, Inconsistent: 2, Underpaid: 3, Scaling: 4 },
  revenue90: { "Less than 500k": 1, "500k - 1m": 2, "1m - 5m": 3, "5m - 10m": 4, "10m or more": 5 },
  highestClient: { "Less than 500k": 1, "500k - 1m": 2, "1m - 5m": 3, "5m - 10m": 4, "10m or more": 5 },
  bookingFrequency: { "Never gotten a client": 0, "Once in a while": 1, "Get clients consistently": 3, "Fully booked": 4 },
  achievementGoals: {
    "Get consistent bookings": 2,
    "Charge premium prices": 3,
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
  timeCommitment: { Yes: 3, No: 0 },
  paymentReadiness: { "Ready now": 4, "Few days or weeks": 3, "Payment plan": 2, "Just exploring": 0 },
};

function score(data, key) {
  return scoreMaps[key]?.[data[key]] || 0;
}

function multiScore(data, key) {
  const values = Array.isArray(data[key]) ? data[key] : [];
  return values.reduce((sum, value) => sum + (scoreMaps[key]?.[value] || 0), 0);
}

function emailExists(email) {
  if (!email || !fs.existsSync(csvPath)) return false;
  const target = String(email).trim().toLowerCase();
  const rows = fs.readFileSync(csvPath, "utf8").split(/\r?\n/).filter(Boolean);
  if (rows.length < 2) return false;
  return rows.slice(1).some((row) => {
    const cells = row.match(/("(?:""|[^"])*"|[^,]*)/g)?.filter((cell, index) => index % 2 === 0) || [];
    const emailCell = (cells[2] || "").replace(/^"|"$/g, "").replace(/""/g, '"').trim().toLowerCase();
    return emailCell === target;
  });
}

function wordCount(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function containsAny(text, terms) {
  const lower = String(text || "").toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function buildGapFeedback(data, achievementGoals) {
  const branch = String(data.branchReason || "").toLowerCase();
  const goals = Array.isArray(achievementGoals) ? achievementGoals : [];
  const hasGoal = (goal) => goals.includes(goal);
  const issueScores = {
    acquisition: 0,
    pipeline: 0,
    premium: 0,
    systems: 0,
    commercial: 0,
    commitment: 0,
  };

  if (data.bookingFrequency === "Never gotten a client") issueScores.acquisition += 35;
  if (data.businessStage === "Not started") issueScores.acquisition += 30;
  if (data.businessStage === "Beginner") issueScores.acquisition += 24;
  if (branch.includes("find serious clients") || branch.includes("clear client acquisition")) issueScores.acquisition += 14;
  if (data.revenue90 === "Less than 500k") issueScores.acquisition += 7;

  if (data.businessStage === "Inconsistent") issueScores.pipeline += 30;
  if (data.bookingFrequency === "Once in a while") issueScores.pipeline += 25;
  if (hasGoal("Get consistent bookings")) issueScores.pipeline += 12;
  if (branch.includes("random referrals") || branch.includes("follow-up") || branch.includes("conversion")) issueScores.pipeline += 14;

  if (data.businessStage === "Underpaid") issueScores.premium += 32;
  if (hasGoal("Charge premium prices")) issueScores.premium += 20;
  if (branch.includes("premium value") || branch.includes("higher prices") || branch.includes("justify the fee")) issueScores.premium += 16;
  if (data.highestClient === "Less than 500k" || data.highestClient === "500k - 1m") issueScores.premium += 8;

  if (data.businessStage === "Scaling") issueScores.systems += 32;
  if (data.bookingFrequency === "Fully booked") issueScores.systems += 24;
  if (hasGoal("Build a multi-million photography business") || hasGoal("All of the above")) issueScores.systems += 20;
  if (hasGoal("Build better client systems")) issueScores.systems += 12;
  if (branch.includes("systems") || branch.includes("client experience") || branch.includes("financial structure") || branch.includes("brand positioning")) issueScores.systems += 16;

  if (data.revenue90 === "Less than 500k") issueScores.commercial += 22;
  if (data.highestClient === "Less than 500k") issueScores.commercial += 16;
  if (data.revenue90 === "500k - 1m" && data.highestClient === "Less than 500k") issueScores.commercial += 8;

  if (data.paymentReadiness === "Just exploring") issueScores.commitment += 24;
  if (data.timeCommitment === "No") issueScores.commitment += 30;
  if (branch.includes("guidance") || branch.includes("accountability")) issueScores.commitment += 6;

  const ranked = Object.entries(issueScores).sort((a, b) => b[1] - a[1]);
  const primary = ranked[0][1] > 0 ? ranked[0][0] : "generic";
  const secondary = ranked.find(([key, value]) => key !== primary && value >= 18)?.[0];

  const stageNotes = {
    "Not started": "You are still at the starting point, so your creative work needs a clearer path toward serious paying clients.",
    Beginner: "You are still at the point where your photography needs a clearer path to serious paying clients.",
    Inconsistent: "You already have signs of demand, but the business is still too dependent on occasional jobs.",
    Underpaid: "You are getting clients, but your answers show that your pricing and positioning are not yet matching the level you want.",
    Scaling: "You already have momentum, but the business needs stronger structure if it is going to scale beyond busy work.",
  };
  const gapNotes = {
    acquisition: "The biggest gap is client acquisition: you need a clearer offer, target client, and route from visibility to paid bookings.",
    pipeline: "The biggest gap is consistency: you need a stronger enquiry, follow-up, conversion, and repeat-booking system.",
    premium: "The biggest gap is premium positioning: your pricing, portfolio, and client experience need to make higher fees feel justified.",
    systems: "The biggest gap is structure: your pricing, delivery, client experience, and brand systems need to become more intentional.",
    commercial: "The biggest gap is income: you are not yet making enough money from photography to build the kind of business you say you want.",
    commitment: "The biggest gap is readiness: your answers do not yet show enough time, payment, or implementation commitment.",
    generic: "The biggest gap is clarity: we need to see a sharper picture of who you serve, what you sell, and how bookings will become consistent.",
  };
  const secondaryNotes = {
    acquisition: "Client acquisition also needs attention.",
    pipeline: "Consistency also needs attention.",
    premium: "Premium positioning also needs attention.",
    systems: "Business structure also needs attention.",
    commercial: "Income also needs attention.",
    commitment: "Readiness also needs attention.",
  };
  const evidenceNotes = [];
  if (data.revenue90 === "Less than 500k" || data.revenue90 === "500k - 1m") evidenceNotes.push("your recent revenue is still low for the size of brand you want");
  if (data.highestClient === "Less than 500k" || data.highestClient === "500k - 1m") evidenceNotes.push("your highest client value still leaves room for stronger pricing");
  if (data.bookingFrequency === "Never gotten a client" || data.bookingFrequency === "Once in a while") evidenceNotes.push("your booking flow is not yet dependable");
  if (!evidenceNotes.length && (data.bookingFrequency === "Fully booked" || data.businessStage === "Scaling")) evidenceNotes.push("you have demand, but demand now needs systems");
  if (!evidenceNotes.length) evidenceNotes.push("your answers show potential, but the business needs a more deliberate growth structure");
  const readinessNote =
    data.timeCommitment === "No"
      ? "Because you are not ready to commit to 8 weeks of learning yet, the next step is important for testing whether this is the right time."
      : data.paymentReadiness === "Ready now"
      ? "Your payment readiness is strong, so the next work is turning that seriousness into execution."
      : data.paymentReadiness === "Payment plan"
        ? "A payment plan can work, but your commitment and implementation must be serious."
        : data.paymentReadiness === "Few days or weeks"
          ? "You look close to ready, but the next step should help you decide with clarity."
          : "Because you are still exploring, the next step is important for testing whether you are truly ready.";
  const goalNote = hasGoal("Build a multi-million photography business") || hasGoal("All of the above")
    ? "BOP can only help you reach that kind of ambition if the business foundations become stronger."
    : hasGoal("Charge premium prices")
      ? "To charge better, your offer and client experience must make the higher price feel obvious."
      : hasGoal("Get consistent bookings")
        ? "To book more consistently, you need a repeatable system, not only better pictures."
        : hasGoal("Build better client systems")
          ? "Better systems will matter because growth should not depend only on your personal effort."
          : "That is why the next stage should help you see what must change before you commit.";
  const extra = secondary ? ` ${secondaryNotes[secondary]}` : "";
  return `${stageNotes[data.businessStage] || stageNotes.Inconsistent} ${gapNotes[primary] || gapNotes.generic} This shows up in your application because ${evidenceNotes.slice(0, 2).join(" and ")}.${extra} ${readinessNote} ${goalNote}`;
}

function buildReview(data) {
  const achievementGoals = Array.isArray(data.achievementGoals) ? data.achievementGoals : [];
  const text = [data.branchReason, data.whyNow, data.sixMonthImpact, data.whyBedge, achievementGoals.join(" ")].join(" ");
  const commercial = Math.min(
    40,
    score(data, "businessStage") * 2.5 +
      score(data, "revenue90") * 2 +
      score(data, "highestClient") * 1.6 +
      score(data, "bookingFrequency") * 2 +
      score(data, "branchReason")
  );
  const commitment = Math.min(
    15,
    score(data, "timeCommitment") * 1.7 + score(data, "paymentReadiness") * 1.75 + Math.min(multiScore(data, "achievementGoals"), 3)
  );
  const theory = Math.min(
    15,
    Math.min(Math.floor(wordCount(text) / 25), 9) +
      (containsAny(text, [
        "client",
        "pricing",
        "premium",
        "brand",
        "business",
        "system",
        "income",
        "portfolio",
        "wedding",
        "commercial",
        "team",
        "structure",
        "global",
        "million",
      ])
        ? 3
        : 0) +
      (data.admissionsConsent ? 1 : 0) +
      (wordCount(data.whyBedge) > 35 ? 2 : 0)
  );
  const rawScore = Math.min(70, Math.round(commercial + commitment + theory));
  const total = rawScore;
  const percent = rawScore;
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

  const gap = buildGapFeedback(data, achievementGoals);

  return {
    total,
    rawScore,
    percent,
    status,
    lead,
    headline: "Application submitted for review.",
    intro:
      "Your BOP application has been received. We have completed an initial readiness review based on your commercial evidence, written responses, and fit for The Business of Photography by Bedge.",
    gap,
    next:
      "Your application may be considered for the next stage of admission. To proceed, you are required to attend the admissions webinar, where the team will explain the programme structure, selection expectations, payment options, and what is required to secure admission.",
  };
}

function csvEscape(value) {
  if (Array.isArray(value)) return csvEscape(value.join("; "));
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function appendApplication(data) {
  const headerLine = headers.join(",");
  if (fs.existsSync(csvPath)) {
    const existingHeader = fs.readFileSync(csvPath, "utf8").split(/\r?\n/)[0];
    if (existingHeader !== headerLine) {
      fs.renameSync(csvPath, path.join(root, `applications-backup-${Date.now()}.csv`));
    }
  }
  if (!fs.existsSync(csvPath)) fs.writeFileSync(csvPath, headerLine + "\n");
  const row = headers.map((key) => {
    if (key === "timestamp") return csvEscape(new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" }));
    if (key === "score") return csvEscape(data.review?.total || "");
    if (key === "applicationStatus") return csvEscape(data.review?.status || "");
    if (key === "leadCategory") return csvEscape(data.review?.lead || "");
    return csvEscape(data[key]);
  });
  fs.appendFileSync(csvPath, row.join(",") + "\n");
}

function serveFile(req, res) {
  const urlPath = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const filePath = path.join(root, urlPath);
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    const contentType = ext === ".png" ? "image/png" : ext === ".csv" ? "text/csv" : "text/html";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/webinar-attendance") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const handler = require("./api/webinar-attendance");
        invokeApiHandler(handler, req, res, JSON.parse(body || "{}"));
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/submit") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const data = JSON.parse(body || "{}");
        data.review = buildReview(data);
        appendApplication(data);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, review: data.review }));
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }
  serveFile(req, res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`BOP admissions app running at http://127.0.0.1:${port}`);
  console.log(`CSV export: http://127.0.0.1:${port}/applications.csv`);
});
