'use strict';

const serverless = require('serverless-http');
const app = require('../../server/index');

// Wraps the Express app for Netlify Functions (AWS Lambda-compatible).
// Netlify passes the original request path in event.path because the
// netlify.toml redirect uses status=200 (rewrite), so Express routes
// registered at /api/* match without any path manipulation.
exports.handler = serverless(app);
