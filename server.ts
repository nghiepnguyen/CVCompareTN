import 'dotenv/config';
import express from 'express';
import { initSentryServer, Sentry } from './_server-lib/sentry';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';

// Rate limiters
import { apiLimiter, strictLimiter, emailLimiter, staticLimiter } from './server/lib/rateLimiter';

// Routes
import configRouter from './server/routes/config';
import feedbackRouter from './server/routes/feedback';
import welcomeEmailRouter from './server/routes/welcomeEmail';
import pdfRouter from './server/routes/pdf';
import paymentRouter from './server/routes/payment';
import recruiterRouter from './server/routes/recruiter';
import analyzeRouter from './server/routes/analyze';
import adminRouter from './server/routes/admin';

async function startServer() {
  initSentryServer();
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(
    cors({
      origin: [
        'https://cvfit.pro',
        'https://www.cvfit.pro',
        ...(process.env.NODE_ENV !== 'production'
          ? ['http://localhost:5173', 'http://localhost:3000']
          : []),
      ],
      credentials: true,
    })
  );
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // API Routes
  // Apply global rate limiting to all /api routes (100 req / 15 min per IP)
  app.use('/api', apiLimiter);

  // Apply route-specific stricter limits for expensive operations
  app.use('/api/config', configRouter);
  app.use('/api/send-feedback', emailLimiter, feedbackRouter); // Resend email — 5 req / hour
  app.use('/api/send-welcome-email', emailLimiter, welcomeEmailRouter); // Resend email — 5 req / hour
  app.use('/api/extract-pdf', strictLimiter, pdfRouter); // PDF parsing — 10 req / 15 min
app.use('/api/payment', strictLimiter, paymentRouter); // Payment ops — 10 req / 15 min
app.use('/api/recruiter', strictLimiter, recruiterRouter); // Recruiter save-analysis — 10 req / 15 min
app.use('/api/analyze', strictLimiter, analyzeRouter); // Gemini analysis — 10 req / 15 min
app.use('/api/admin', strictLimiter, adminRouter); // Admin operations — 10 req / 15 min

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(staticLimiter);
    app.use(express.static(distPath));
    app.get('*', staticLimiter, (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  Sentry.setupExpressErrorHandler(app);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();