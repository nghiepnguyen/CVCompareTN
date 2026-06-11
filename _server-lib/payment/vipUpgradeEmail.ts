import { Resend } from 'resend';
import { escapeHtml } from '../escapeHtml.js';

export interface VipUpgradeEmailParams {
  userEmail: string;
  userName?: string | null;
  planName: string;
  durationDays: number;
  planExpiresAt: string; // ISO date string
  planType?: 'pro' | 'recruiter'; // for differentiated benefits
}

/**
 * Sends a VIP upgrade notification email to the user after successful Pro/Recruiter activation.
 * Includes plan-specific benefit details and plan expiration date.
 */
export async function sendVipUpgradeEmail(
  params: VipUpgradeEmailParams
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('sendVipUpgradeEmail: RESEND_API_KEY not configured');
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }

  const safeName = escapeHtml(params.userName || '');
  const safeEmail = escapeHtml(params.userEmail);
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  // Format expiry date for Vietnamese locale
  const expiryDate = new Date(params.planExpiresAt);
  const formattedExpiry = Number.isNaN(expiryDate.getTime())
    ? `${params.durationDays} ngày`
    : expiryDate.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

  // Differentiated benefit lists reflecting src/lib/planLimits.ts
  const isRecruiter = params.planType === 'recruiter';
  const benefits = isRecruiter
    ? [
        'Phân tích tối đa <strong>50 CV</strong> cùng lúc (so với 1 CV ở gói Free)',
        'Lưu <strong>không giới hạn</strong> JD (so với 3 JD ở gói Free)',
        'Lưu tối đa <strong>50 CV</strong> (so với 1 CV ở gói Free)',
        'Lịch sử phân tích <strong>không giới hạn</strong> thời gian (so với 7 ngày ở gói Free)',
        'Tạo tối đa <strong>10 chiến dịch</strong> tuyển dụng',
        'Mỗi chiến dịch phân tích tối đa <strong>50 CV</strong>',
      ]
    : [
        'Phân tích tối đa <strong>5 CV</strong> cùng lúc (so với 1 CV ở gói Free)',
        'Lưu <strong>không giới hạn</strong> JD (so với 3 JD ở gói Free)',
        'Lưu tối đa <strong>10 CV</strong> (so với 1 CV ở gói Free)',
        'Lịch sử phân tích <strong>không giới hạn</strong> thời gian (so với 7 ngày ở gói Free)',
      ];

  const benefitsHtml = benefits.map((b) => `<li style="margin-bottom: 8px;">✅ ${b}</li>`).join('');

  const displayName = safeName || 'Bạn';

  try {
    const resendClient = new Resend(apiKey);
    await resendClient.emails.send({
      from: `cvFit <${fromEmail}>`,
      to: [safeEmail],
      subject: `🎉 Chúc mừng! Bạn đã nâng cấp thành công lên cvFit ${params.planName}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #334155; line-height: 1.6;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); padding: 40px 20px; text-align: center; border-radius: 20px 20px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 26px;">Chúc mừng ${displayName}! 🎉</h1>
            <p style="color: #e0e7ff; margin-top: 12px; font-size: 16px;">
              Bạn đã nâng cấp thành công lên <strong style="color: #fbbf24;">cvFit ${params.planName}</strong>
            </p>
          </div>

          <!-- Plan Info Banner -->
          <div style="padding: 24px; background: #faf5ff; border: 1px solid #e9d5ff; border-top: none; text-align: center;">
            <p style="margin: 0 0 8px 0; font-size: 15px; color: #6b21a8;">
              📅 Thời hạn sử dụng: <strong>${params.durationDays} ngày</strong>
            </p>
            <p style="margin: 0; font-size: 15px; color: #6b21a8;">
              ⏳ Ngày hết hạn: <strong>${formattedExpiry}</strong>
            </p>
          </div>

          <!-- Benefits Section -->
          <div style="padding: 30px; background: white; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 20px 20px;">
            <h2 style="font-size: 20px; color: #1e293b; margin: 0 0 20px 0; text-align: center;">
              🔥 Quyền lợi của bạn
            </h2>
            <ul style="list-style: none; padding: 0; margin: 0; font-size: 15px; color: #475569;">
              ${benefitsHtml}
            </ul>

            <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
              <a href="https://cvfit.pro" style="display: inline-block; background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); color: white; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px;">
                🚀 Bắt đầu phân tích ngay
              </a>
            </div>

            <p style="text-align: center; margin-top: 20px; font-size: 13px; color: #94a3b8;">
              Cảm ơn bạn đã tin tưởng và đồng hành cùng <strong>cvFit</strong>.<br/>
              Nếu có thắc mắc, hãy liên hệ với chúng tôi qua trang Hỗ trợ.
            </p>
          </div>
        </div>
      `,
    });

    return { ok: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('sendVipUpgradeEmail failed:', message);
    return { ok: false, error: message };
  }
}