const app = require('../backend/server');
const { connect } = require('../backend/src/config/db');

let dbReady;

module.exports = async (req, res) => {
  if (!dbReady) dbReady = connect();
  await dbReady;
  return app(req, res);
};

