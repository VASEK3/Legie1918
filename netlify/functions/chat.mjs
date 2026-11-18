import OpenAI from 'openai';

function json(body, status = 200, extra = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...extra } });
}

export default async function chat(request) {
  if (request.method !== 'POST') return json({ error: 'Použij odeslání zprávy.' }, 405, { Allow: 'POST' });
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Nepovolený původ požadavku.' }, 403);
  const accessCode = Netlify.env.get('CHAT_ACCESS_CODE');
  if (accessCode && request.headers.get('X-Legie-Access') !== accessCode) {
    return json({ error: 'Zadej platný přístupový kód.' }, 403);
  }
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 16000) return json({ error: 'Zpráva je příliš dlouhá.' }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Zprávu se nepodařilo přečíst.' }, 400);
  }
  if (!body || typeof body.message !== 'string' || !body.message.trim() || body.message.length > 700) {
    return json({ error: 'Napiš otázku o délce 1 až 700 znaků.' }, 400);
  }
  const history = Array.isArray(body.history) ? body.history.slice(-8).filter(item =>
    item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string'
  ).map(item => ({ role: item.role, content: item.content.slice(0, 2000) })) : [];
  try {
    const client = new OpenAI({ timeout: 25000, maxRetries: 0 });
    const result = await client.chat.completions.create({
      model: 'gpt-4.1-mini',
      max_tokens: 650,
      messages: [
        { role: 'system', content: 'Jsi František, fiktivní legionář a český vzdělávací průvodce aplikace LEGIE 1918. Odpovídej česky, přátelsky a stručně (nejvýše 3 krátké odstavce) o československých legiích v Rusku, Francii a Itálii, první světové válce a vzniku Československa. Jasně rozlišuj doložená fakta od výukové fikce. Nevydávej se za skutečného pamětníka a nevymýšlej osobní svědectví, citace ani zdroje. Pokud si nejsi jistý, řekni to a doporuč ověření například ve Vojenském historickém ústavu nebo Československé obci legionářské. Zborov: 2. července 1917; Bachmač: březen 1918; vznik Československa: 28. října 1918; návrat posledních transportů z Ruska: 1920. Na nesouvisející dotazy stručně nabídni návrat k historii legií.' },
        ...history,
        { role: 'user', content: body.message.trim() },
      ],
    });
    const reply = result.choices[0]?.message?.content?.trim();
    if (!reply) return json({ error: 'AI nevrátila odpověď. Zkus otázku znovu.' }, 502);
    return json({ reply });
  } catch (error) {
    if (error.status === 429) return json({ error: 'AI je právě vytížená. Zkus to za chvíli.' }, 429);
    return json({ error: 'AI je dočasně nedostupná. Zkus to prosím za chvíli.' }, 503);
  }
}
