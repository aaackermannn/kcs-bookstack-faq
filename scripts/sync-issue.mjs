import fs from 'node:fs';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export function buildArticle(issue, repository) {
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = issue.state === 'closed' ? 'Решено' : 'В работе';
  const rendered = sanitizeHtml(marked.parse(issue.body || ''), {
    allowedTags: sanitizeHtml.defaults.allowedTags,
    allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, a: ['href', 'title'] },
    allowedSchemes: ['http', 'https', 'mailto'],
  });
  return {
    name: `[FAQ #${issue.number}] ${issue.title.replace(/^\[KCS\]\s*/, '')}`.slice(0, 255),
    html: `<p><strong>Источник:</strong> <a href="${escape(issue.html_url)}">${escape(repository)}#${issue.number}</a></p>` +
      `<p><strong>Состояние обращения:</strong> ${state}. <strong>Обновлено в GitHub:</strong> ${escape(issue.updated_at)}</p>\n${rendered}`,
    tags: [{name:'github-issue',value:`${repository}#${issue.number}`},{name:'status',value:issue.state},{name:'topic',value:'faq'}],
  };
}

export async function syncIssue({issue, repository, baseUrl, tokenId, tokenSecret, bookId, fetchImpl = fetch}) {
  const base = baseUrl.replace(/\/$/, '');
  async function api(path, method = 'GET', payload) {
    const response = await fetchImpl(`${base}/api/${path}`, {
      method,
      headers: { Authorization: `Token ${tokenId}:${tokenSecret}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`BookStack ${method} ${path}: HTTP ${response.status}`);
    return await response.json();
  }
  const book = await api(`books/${bookId}`);
  const pages = (book.contents || []).flatMap(item => item.type === 'chapter' ? (item.pages || []) : [item]);
  const existing = pages.filter(p => p.name.startsWith(`[FAQ #${issue.number}] `));
  if (existing.length > 1) throw new Error('More than one article has the same issue number; resolve duplicate before retry.');
  const article = buildArticle(issue, repository);
  const result = existing.length
    ? await api(`pages/${existing[0].id}`, 'PUT', article)
    : await api('pages', 'POST', {book_id: Number(bookId), ...article});
  return {operation: existing.length ? 'updated' : 'created', issue: issue.number, state: issue.state, pageId: result.id, articleName: result.name};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const env = process.env;
  for (const name of ['GITHUB_EVENT_PATH','GITHUB_REPOSITORY','BOOKSTACK_URL','BOOKSTACK_API_ID','BOOKSTACK_API_SECRET','BOOKSTACK_BOOK_ID']) {
    if (!env[name]) throw new Error(`Missing environment variable ${name}`);
  }
  const event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  let issue = event.issue;
  // Read latest issue state to make queued opened/edited events safe after a later edit.
  if (env.GITHUB_TOKEN) {
    const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/issues/${issue.number}`, {
      headers: {Authorization:`Bearer ${env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`GitHub issue read failed: HTTP ${response.status}`);
    issue = await response.json();
  }
  console.log(JSON.stringify(await syncIssue({issue, repository:env.GITHUB_REPOSITORY,baseUrl:env.BOOKSTACK_URL,
    tokenId:env.BOOKSTACK_API_ID,tokenSecret:env.BOOKSTACK_API_SECRET,bookId:env.BOOKSTACK_BOOK_ID})));
}
