module.exports = {
  rateLimit: {points: 1, duration: 1},
  handle: (req, res) => res.end('ok')
};
