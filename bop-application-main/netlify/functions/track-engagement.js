const { createNetlifyHandler } = require("./_adapter");
const trackEngagement = require("../../api/track-engagement");

exports.handler = createNetlifyHandler(trackEngagement);
