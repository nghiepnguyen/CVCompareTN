import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';

// Routes
import configRouter from './server/routes/config';
import recaptchaRouter from './server/routes/recaptcha';
import feedbackRouter from './server/routes/feedback';
import welcomeEmailRouter from './server/routes/welcomeEmail';
import pdfRouter from './server/routes/pdf';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // API Routes
  app.use('/api/config', configRouter);
  app.use('/api/verify-recaptcha', recaptchaRouter);
  app.use('/api/send-feedback', feedbackRouter);
  app.use('/api/send-welcome-email', welcomeEmailRouter);
  app.use('/api/extract-pdf', pdfRouter);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
