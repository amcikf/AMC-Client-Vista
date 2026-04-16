const { handleDriveFileProxy } = require("./_shared");

module.exports = async function handler(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  await handleDriveFileProxy(req, res, requestUrl);
};
