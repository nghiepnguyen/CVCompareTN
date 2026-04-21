import 'dotenv/config';
import { Resend } from 'resend';

// Use the API key from .env
const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  console.error('RESEND_API_KEY is missing in .env file');
  process.exit(1);
}

const resend = new Resend(apiKey);

async function sendTestEmail() {
  console.log('Sending test email via Resend...');
  
  try {
    const { data, error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: 'thanhnghiep.top@gmail.com',
      subject: 'Hello World from CV Matcher',
      html: '<p>Congrats on sending your <strong>first email</strong> from the CV Matcher project!</p>'
    });

    if (error) {
      console.error('Error sending email:', error);
    } else {
      console.log('Email sent successfully!', data);
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

sendTestEmail();
