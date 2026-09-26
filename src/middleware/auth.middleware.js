import { timingSafeEqual } from 'node:crypto';
export function authenticate(apiKey) {
  return (req, res, next) => {
    if (!apiKey) return next();
    const actual = Buffer.from(req.get('x-api-key') || '');
    const expected = Buffer.from(apiKey);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return res.status(401).json({ error: 'Invalid API key' });
    next();
  };
}
