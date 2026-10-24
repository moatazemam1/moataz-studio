// Helper to verify session from D1
async function isAuthenticated(request, env) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/auth_session=([a-f0-9-]+)/);
  if (!match) return false;

  const token = match[1];
  const row = await env.DB.prepare('SELECT token FROM sessions WHERE token = ?').bind(token).first();
  return Boolean(row);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const authed = await isAuthenticated(request, env);

  const row = await env.DB.prepare('SELECT data, version FROM portfolio WHERE id = ?').bind('main').first();

  let data = null;
  let version = 1;

  if (row && row.data) {
    try {
      data = JSON.parse(row.data);
      version = row.version || 1;
    } catch (e) {}
  }

  return new Response(JSON.stringify({
    data,
    version,
    canEdit: authed
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const authed = await isAuthenticated(request, env);

  if (!authed) {
    return new Response(JSON.stringify({ error: 'تسجيل الدخول مطلوب للحفظ' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const payload = await request.json();
    if (!payload.data || typeof payload.version !== 'number') {
      return new Response(JSON.stringify({ error: 'بيانات غير صالحة' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const nextVersion = payload.version + 1;
    const dataStr = JSON.stringify(payload.data);

    await env.DB.prepare('UPDATE portfolio SET data = ?, version = ? WHERE id = ?')
      .bind(dataStr, nextVersion, 'main')
      .run();

    return new Response(JSON.stringify({ version: nextVersion }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'فشل حفظ التعديلات' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
