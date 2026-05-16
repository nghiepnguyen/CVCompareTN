
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Resend } from "npm:resend"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const resend = new Resend(Deno.env.get('RESEND_API_KEY'))

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { type, data } = await req.json()

    let subject = ""
    let html = ""
    let to = ""

    if (type === 'welcome') {
      to = data.userEmail
      subject = 'Chào mừng bạn! Cùng tối ưu CV để chinh phục công việc mơ ước 🚀'
      html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 16px;">
          <h2 style="color: #4f46e5;">Chào ${data.userName || 'bạn'},</h2>
          <p>Cảm ơn bạn đã sử dụng <strong>CV Matcher</strong>.</p>
          <p>Hãy tải CV lên để bắt đầu tối ưu ngay nhé!</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://cv.thanhnghiep.top" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 10px; font-weight: bold;">Thử ngay</a>
          </div>
          <p>Trân trọng,<br>Đội ngũ CV Matcher</p>
        </div>
      `
    } else if (type === 'feedback') {
      to = Deno.env.get('FEEDBACK_RECIPIENT_EMAIL') || ""
      subject = `Feedback mới: ${data.title}`
      html = `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #4f46e5;">Phản hồi mới</h2>
          <p><strong>Đánh giá:</strong> ${data.rating}/5 sao</p>
          <p><strong>Người gửi:</strong> ${data.userEmail || 'Ẩn danh'}</p>
          <hr />
          <p><strong>Nội dung:</strong></p>
          <p style="white-space: pre-wrap;">${data.content}</p>
        </div>
      `
    }

    const { data: resendData, error: resendError } = await resend.emails.send({
      from: `CV Matcher <${Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev'}>`,
      to: [to],
      subject: subject,
      html: html,
    })

    if (resendError) throw resendError

    return new Response(JSON.stringify(resendData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
