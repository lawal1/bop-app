const GHL_LOCATION_ID = process.env.KOPPOH_GHL_LOCATION_ID;
const GHL_PIT_TOKEN = process.env.KOPPOH_GHL_PIT_TOKEN;
const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

const FIELD_IDS = {
  quizScore: "baiyn6YFSHl5flGHb03J",
  engagementScore: "9TJLm8PcrmATCy0gWsBr",
  communityStatus: "eVA2TbqKcGzjCyYhXScr",
  webinarStatus: "35LsJoYXcSuSmgTpIT2P",
};

const ACTIONS = {
  community: {
    tag: "bop-in-community",
    field: { id: FIELD_IDS.communityStatus, value: "Joined" },
    stage: "In Community",
  },
  webinar: {
    tag: "bop-webinar-attended",
    field: { id: FIELD_IDS.webinarStatus, value: "Attended" },
    stage: "Webinar Attended",
  },
  interest: {
    tag: "bop-interested",
    stage: "Interested",
  },
};

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

function tagNames(contact) {
  return (contact.tags || []).map((tag) => (typeof tag === "string" ? tag : tag.name || tag.tag || "")).filter(Boolean);
}

function customFieldValue(contact, fieldId) {
  const field = (contact.customFields || []).find((item) => item.id === fieldId || item.fieldId === fieldId);
  return field?.value ?? "";
}

function hasAction(contact, tag, fieldId, fieldValue) {
  const tags = tagNames(contact);
  return tags.includes(tag) || (fieldId && String(customFieldValue(contact, fieldId)).toLowerCase() === String(fieldValue).toLowerCase());
}

async function findContactIdByEmail(email) {
  if (!email) return "";
  const data = await ghl(`/contacts/?locationId=${GHL_LOCATION_ID}&query=${encodeURIComponent(email)}&limit=5`);
  const contacts = data.contacts || [];
  const match = contacts.find((contact) => String(contact.email || "").toLowerCase() === String(email).toLowerCase()) || contacts[0];
  return match?.id || "";
}

async function getContact(contactId) {
  const data = await ghl(`/contacts/${contactId}`);
  return data.contact || data;
}

async function addTags(contactId, tags) {
  if (!tags.length) return;
  await ghl(`/contacts/${contactId}/tags`, {
    method: "POST",
    body: JSON.stringify({ tags }),
  });
}

async function updateCustomFields(contactId, customFields) {
  if (!customFields.length) return;
  await ghl(`/contacts/${contactId}`, {
    method: "PUT",
    body: JSON.stringify({ customFields }),
  });
}

async function getPipelineStageId(stageName) {
  const data = await ghl(`/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`);
  const pipeline = (data.pipelines || []).find((item) => item.name === "BOP Admissions");
  const stage = pipeline?.stages?.find((item) => item.name === stageName);
  if (!pipeline || !stage) throw new Error(`BOP Admissions pipeline stage not found: ${stageName}`);
  return { pipelineId: pipeline.id, stageId: stage.id };
}

async function moveOpportunity(contactId, stageName) {
  const { pipelineId, stageId } = await getPipelineStageId(stageName);
  const data = await ghl(`/opportunities/search?location_id=${GHL_LOCATION_ID}&contact_id=${contactId}&pipeline_id=${pipelineId}&status=all`);
  const opportunity = (data.opportunities || []).find((item) => item.pipelineId === pipelineId && item.status === "open") || data.opportunities?.[0];
  if (!opportunity?.id) {
    const contact = await getContact(contactId);
    const name = String(contact.name || `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || contact.email || "BOP Applicant").trim();
    const created = await ghl("/opportunities/", {
      method: "POST",
      body: JSON.stringify({
        pipelineId,
        locationId: GHL_LOCATION_ID,
        name: `${name} - BOP Application`,
        pipelineStageId: stageId,
        status: "open",
        contactId,
        monetaryValue: 0,
      }),
    });
    return created.opportunity || created;
  }

  const updated = await ghl(`/opportunities/${opportunity.id}`, {
    method: "PUT",
    body: JSON.stringify({ pipelineId, pipelineStageId: stageId, status: "open" }),
  });
  return updated.opportunity || updated;
}

function calculateEngagementScore(contact) {
  const quizScore = Number(customFieldValue(contact, FIELD_IDS.quizScore)) || 0;
  let actionPoints = 0;

  if (hasAction(contact, "bop-in-community", FIELD_IDS.communityStatus, "Joined")) actionPoints += 5;
  if (hasAction(contact, "bop-webinar-attended", FIELD_IDS.webinarStatus, "Attended")) actionPoints += 5;
  if (hasAction(contact, "bop-interested")) actionPoints += 5;

  return quizScore + actionPoints;
}

async function refreshEngagementScore(contactId) {
  const contact = await getContact(contactId);
  const score = calculateEngagementScore(contact);
  await updateCustomFields(contactId, [{ id: FIELD_IDS.engagementScore, value: String(score) }]);
  return score;
}

async function trackAction(contactId, actionName) {
  const action = ACTIONS[actionName];
  if (!action) throw new Error(`Unknown BOP engagement action: ${actionName}`);

  await addTags(contactId, [action.tag]);
  if (action.field) await updateCustomFields(contactId, [action.field]);
  if (action.stage) await moveOpportunity(contactId, action.stage);

  return refreshEngagementScore(contactId);
}

module.exports = {
  ACTIONS,
  FIELD_IDS,
  findContactIdByEmail,
  refreshEngagementScore,
  trackAction,
};
