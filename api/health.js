/**
 * Health Check — Vercel Serverless Function
 * Endpoint: GET /api/health
 */

module.exports = (req, res) => {
  res.status(200).json({
    status: 'online',
    agent: 'Manus3',
    timestamp: new Date().toISOString(),
  });
};
