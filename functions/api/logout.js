// Cloudflare Pages Function: /api/logout
export async function onRequestPost(context) {
  const { request, env } = context;
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/auth_session=([a-f0-9-]+)/);

  if (match) {
    const token = match[1];
    try {
      await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    } catch (e) {}
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'auth_session=; Path=/; HttpOnly; Max-Age=0; Secure'
    }
  });
}
