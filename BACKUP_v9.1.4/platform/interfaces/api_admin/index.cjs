const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', namespace: 'admin' });
});

module.exports = router;
