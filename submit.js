const SHEET_ID = process.env.BOP_ADMISSIONS_SHEET_ID || "1HPYhjU-SlTgaCw8aLtqeWki1aft6efddkc0IxCypJGA";

async function getToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GWS_CLIENT_ID,
      client_secret: process.env.GWS_CLIENT_SECRET,
      refresh_token: process.env.GWS_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Token failed: " + JSON.stringify(data));
  return data.access_token;
}

function wordCount(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function containsAny(text, terms) {
  const lower = String(text || "").toLowerCase();
  return terms.some((term) => lower.includes(term));
}

const scoreMaps = {
  stage: {
    "No paying client yet": 1,
    "Occasional jobs": 2,
    "Booked but underpaid": 3,
    "Skilled but not structured": 3,
    "Growing brand": 4,
  },
  revenue90: {
    "No revenue": 0,
    "Under N100k": 1,
    "N100k-N500k": 2,
    "N500k-N1.5M": 3,
    "Above N1.5M": 4,
  },
  highestClient: {
    "No paying client yet": 0,
    "Under N50k": 1,
    "N50k-N200k": 2,
    "N200k-N750k": 3,
    "Above N750k": 4,
  },
  bookingFrequency: {
    Never: 0,
    Occasionally: 1,
    Monthly: 3,
    "Busy but underpaid": 4,
  },
  weakestArea: {
    "Client acquisition": 2,
    Pricing: 2,
    Positioning: 2,
    Systems: 2,
    Confidence: 1,
    "Brand visibility": 1,
  },
  timeCommitment: {
    "Fully ready": 3,
    "Need structure": 2,
    Unsure: 1,
  },
  paymentReadiness: {
    "Ready now": 4,
    "Few days": 3,
    "Payment plan": 2,
    "Still deciding": 1,
  },
};

function score(data, key) {
  return scoreMaps[key]?.[data[key]] || 0;
}

function buildReview(data) {
  const assets = Array.isArray(data.businessAssets) ? data.businessAssets : [];
  const assetCount = assets.filter((item) => item !== "None yet").length;
  const businessStageScore = Math.min(
    20,
    score(data, "stage") * 2 +
      score(data, "revenue90") * 2 +
      score(data, "highestClient") * 2 +
      score(data, "bookingFrequency") * 2 +
      Math.min(assetCount, 4)
  );
  const buyingPowerScore = Math.min(
    20,
    score(data, "revenue90") * 3 +
      score(data, "highestClient") * 2 +
      score(data, "paymentReadiness") * 2
  );
  const essays = [
    data.whyNow,
    data.sixMonthImpact,
    data.futureBusiness,
    data.blocker,
    data.whyBedge,
    data.proofOfSeriousness,
    data.cohortContribution,
  ];
  const essayWords = essays.reduce((sum, item) => sum + wordCount(item), 0);
  const specificity = essays.join(" ");
  const specificityBonus =
    (containsAny(specificity, [
      "client",
      "clients",
      "premium",
      "pricing",
      "price",
      "brand",
      "business",
      "system",
      "income",
      "portfolio",
      "wedding",
      "event",
      "commercial",
      "team",
    ])
      ? 4
      : 0) +
    (containsAny(specificity, [
      "6 months",
      "six months",
      "year",
      "years",
      "weekly",
      "daily",
      "consistent",
      "structure",
    ])
      ? 3
      : 0);
  const seriousnessScore = Math.min(
    20,
    Math.floor(essayWords / 28) +
      specificityBonus +
      score(data, "timeCommitment") * 2 +
      (data.fitConsent && data.webinarConsent ? 3 : 0)
  );
  const fitScore = Math.min(
    20,
    score(data, "weakestArea") * 4 +
      (containsAny(specificity, [
        "business",
        "pricing",
        "client",
        "clients",
        "positioning",
        "brand",
        "system",
        "premium",
        "structure",
      ])
        ? 6
        : 2) +
      (data.whyBedge && wordCount(data.whyBedge) > 25 ? 3 : 0) +
      (data.niche !== "I am still figuring it out" ? 3 : 1)
  );
  const total = businessStageScore + buyingPowerScore + seriousnessScore + fitScore;
  let segment = "Development Track";
  if (total >= 62 && buyingPowerScore >= 10 && seriousnessScore >= 12) segment = "Priority Applicant";
  else if (total >= 46 && seriousnessScore >= 10) segment = "Strong Potential";
  else if (total < 30 || seriousnessScore < 7) segment = "Nurture Lead";

  const isEarly = data.stage === "No paying client yet" || data.revenue90 === "No revenue";
  const wantsPremium = containsAny(specificity, [
    "premium",
    "high-ticket",
    "high ticket",
    "million",
    "scale",
    "brand",
    "team",
    "system",
    "clients",
  ]);

  const copy = {
    "Priority Applicant": {
      headline: "Your application shows strong potential for BOP.",
      intro:
        "Your answers suggest that you are not only interested in photography, you are thinking about business structure, better clients, and a more serious market position.",
      strength: wantsPremium
        ? "Your ambition is clear. You are already connecting skill with positioning, pricing, systems, and the kind of brand you want to build."
        : "Your current business evidence gives the admissions team something solid to work with. You are closer to the kind of applicant BOP is designed to accelerate.",
      gap:
        assetCount < 4
          ? "The main gap is infrastructure. Before the webinar, think through your client process, pricing documents, contracts, and delivery workflow."
          : "The next gap is refinement. Your systems exist, but BOP will expect you to improve how they support premium client trust.",
      next:
        "Come to the webinar ready to explain your current offer, your target client, and the income level you want the business to support.",
      followUp:
        "Priority webinar route. Sales team should follow up quickly and speak to scale, pricing confidence, and cohort fit.",
      cta: "Join the Admissions Webinar on WhatsApp",
    },
    "Strong Potential": {
      headline: "You have the ambition BOP is built for.",
      intro:
        "Your application shows desire and direction, but there are still gaps in structure, pricing, client acquisition, or proof of execution that need attention.",
      strength:
        "Your answers show that you are taking this seriously. You can describe what you want to change, which matters more than pretending everything is already perfect.",
      gap: isEarly
        ? "You need more business evidence. Start thinking about how you will get your first few serious clients, document your work, and turn attention into paid demand."
        : "You need sharper business clarity. Your next step is to define your ideal client, your strongest offer, and why your current pricing no longer matches your value.",
      next:
        "Use the webinar to understand the standard BOP expects and the specific business habits you will need to practise weekly.",
      followUp:
        "Warm route. Sales team should invite them strongly, handle payment-plan questions if needed, and reinforce implementation support.",
      cta: "Join the Webinar and Prepare for the Next Stage",
    },
    "Development Track": {
      headline: "Your application shows early potential.",
      intro:
        "You may still be building clarity, evidence, or consistency, but your answers show areas BOP can help you understand before you decide.",
      strength:
        "The strongest part of your application is your willingness to name the gap. That is useful if you are ready to move from interest to implementation.",
      gap:
        "Your answers need more specificity. Before joining a serious programme, you should be clearer about your niche, the client you want, and what business result you are chasing.",
      next:
        "Attend the webinar and listen for the commitment required. Come prepared with your niche, your current pricing, and your biggest business blocker.",
      followUp:
        "Education route. Sales team should nurture with webinar teaching, examples, and clarity before pushing payment.",
      cta: "Join the Webinar on WhatsApp",
    },
    "Nurture Lead": {
      headline: "Your application needs more clarity before BOP.",
      intro:
        "Your answers suggest interest, but the application does not yet show enough clarity, commitment, or business evidence for a strong admissions signal.",
      strength: "You took the first step by applying, and that gives you a starting point.",
      gap:
        "Your biggest gap is specificity. The admissions team needs to see what you are building, why it matters now, and what proof shows you will implement.",
      next:
        "Join the webinar to understand the programme standard. If BOP is right for you, use what you learn there to sharpen your direction.",
      followUp:
        "Long nurture route. Sales team should send education-first content and avoid hard closing until intent improves.",
      cta: "Join the Webinar on WhatsApp",
    },
  }[segment];

  return {
    segment,
    totalScore: total,
    scores: { businessStageScore, buyingPowerScore, seriousnessScore, fitScore },
    recommendedSalesAngle: copy.followUp,
    ...copy,
  };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const data = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const review = buildReview(data);
    const token = await getToken();

    const timestamp = new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" });
    const row = [
      timestamp,
      data.name || "",
      data.email || "",
      data.phone || "",
      data.ageRange || "",
      data.location || "",
      data.role || "",
      data.niche || "",
      data.source || "",
      data.portfolio || "",
      data.stage || "",
      data.revenue90 || "",
      data.highestClient || "",
      data.bookingFrequency || "",
      data.weakestArea || "",
      Array.isArray(data.businessAssets) ? data.businessAssets.join(", ") : "",
      data.timeCommitment || "",
      data.paymentReadiness || "",
      data.whyNow || "",
      data.sixMonthImpact || "",
      data.futureBusiness || "",
      data.blocker || "",
      data.whyBedge || "",
      data.proofOfSeriousness || "",
      data.cohortContribution || "",
      review.segment,
      review.totalScore,
      review.scores.businessStageScore,
      review.scores.buyingPowerScore,
      review.scores.seriousnessScore,
      review.scores.fitScore,
      review.recommendedSalesAngle,
      review.gap,
      review.next,
    ];

    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/A:AH:append?valueInputOption=RAW&insertDataOption=OVERWRITE`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: [row] }),
      }
    );

    if (!sheetRes.ok) {
      const err = await sheetRes.text();
      throw new Error("Sheet append failed: " + err);
    }

    return res.status(200).json({ success: true, review });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};
