const { createNetlifyHandler } = require("./_adapter");
const submit = require("../../api/submit");

exports.handler = createNetlifyHandler(submit);
