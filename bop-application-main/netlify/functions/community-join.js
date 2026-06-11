const { createNetlifyHandler } = require("./_adapter");
const communityJoin = require("../../api/community-join");

exports.handler = createNetlifyHandler(communityJoin);
