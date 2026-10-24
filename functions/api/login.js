// Cloudflare Pages Function: /api/login
export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { username, password } = body;

    const adminUser = env.ADMIN_USER || 'admin';
    const adminEmail = env.ADMIN_EMAIL || 'moataz.emam.de@gmail.com';
    const adminPass = env.ADMIN_PASS || 'Moataz@2026';

    const matchUser = (username === adminUser || username?.toLowerCase() === adminEmail.toLowerCase());
    const matchPass = (password === adminPass);

    if (matchUser && matchPass) {
      const token = crypto.randomUUID();
      // Store session in D1
      await env.DB.prepare('INSERT INTO sessions (token, created) VALUES (?, ?)')
        .bind(token, new Date().toISOString())
        .run();

      const cookie = `auth_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure`;
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': cookie
        }
      });
    }

    return new Response(JSON.stringify({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'بيانات غير صالحة' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
