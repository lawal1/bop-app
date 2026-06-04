const { createNetlifyHandler } = require("./_adapter");
const webinarAttendance = require("../../api/webinar-attendance");

exports.handler = createNetlifyHandler(webinarAttendance);
