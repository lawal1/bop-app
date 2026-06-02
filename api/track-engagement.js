const { ACTIONS, findContactIdByEmail, trackAction } = require("./ghl-engagement");

const ACTION_ALIASES = {
  community: "community",
  "joined-community": "community",
  "in-community": "community",
  webinar: "webinar",
  "webinar-attended": "webinar",
  attended: "webinar",
  interest: "interest",
  interested: "interest",
  "asked-about-bop": "interest",
  "asked-about-programme": "interest",
  interested: "interest",
};

module.exports = async (req, res) => {
  try {
    const requestedAction = String(req.query?.action || req.body?.action || "").toLowerCase();
    const action = ACTION_ALIASES[requestedAction];
    if (!action || !ACTIONS[action]) throw new Error(`Unsupported action: ${requestedAction || "missing"}`);

    const contactId = req.query?.contactId || req.body?.contactId || (await findContactIdByEmail(req.query?.email || req.body?.email));
    if (!contactId) throw new Error("Missing contactId or known contact email");

    const engagementScore = await trackAction(contactId, action);
    return res.status(200).json({ success: true, action, contactId, engagementScore });
  } catch (error) {
    console.error("BOP engagement tracking failed:", error.message);
    return res.status(400).json({ success: false, error: error.message });
  }
};
