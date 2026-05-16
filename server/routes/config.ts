import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  });
});

export default router;
