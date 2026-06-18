const { findContactIdByEmail, trackAction } = require("./ghl-engagement");

function safeRedirectUrl(value) {
  const url = value || process.env.KOPPOH_BOP_COMMUNITY_URL;
  if (!url) return "";
  if (url.startsWith("https://chat.whatsapp.com/") || url.startsWith("https://wa.me/") || url.startsWith("https://api.whatsapp.com/")) {
    return url;
  }
  return "";
}

module.exports = async (req, res) => {
  const redirectUrl = safeRedirectUrl(req.query?.to);
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
