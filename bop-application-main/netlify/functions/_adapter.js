function parseBody(event) {
  if (!event.body) return {};

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  const contentType = event.headers?.["content-type"] || event.headers?.["Content-Type"] || "";

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(rawBody);
    } catch {
      return rawBody;
    }
  }

  return rawBody;
}

function createResponse() {
  const state = {
    statusCode: 200,
    headers: {},
    body: "",
  };

  const res = {
    setHeader(name, value) {
      state.headers[name] = value;
      return res;
    },
    status(code) {
      state.statusCode = code;
      return res;
    },
    json(value) {
      state.headers["Content-Type"] = state.headers["Content-Type"] || "application/json";
      state.body = JSON.stringify(value);
      return state;
    },
    send(value) {
      state.body = value == null ? "" : String(value);
      return state;
    },
    writeHead(code, headers = {}) {
      state.statusCode = code;
      state.headers = { ...state.headers, ...headers };
      return res;
    },
    end(value = "") {
      state.body = value == null ? "" : String(value);
      return state;
    },
  };

  return { res, state };
}

function toNetlifyResponse(state) {
  return {
    statusCode: state.statusCode,
    headers: state.headers,
    body: state.body,
  };
}

function createNetlifyHandler(vercelHandler) {
  return async (event) => {
    const { res, state } = createResponse();
    const req = {
      method: event.httpMethod,
      headers: event.headers || {},
      query: event.queryStringParameters || {},
      body: parseBody(event),
    };

    try {
      await vercelHandler(req, res);
      return toNetlifyResponse(state);
    } catch (error) {
      console.error("Netlify API adapter failed:", error);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: error.message }),
      };
    }
  };
}

module.exports = { createNetlifyHandler };
