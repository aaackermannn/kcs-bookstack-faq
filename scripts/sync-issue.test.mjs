import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArticle, syncIssue } from './sync-issue.mjs';

const issue = {number:1,title:'[KCS] Нет письма о восстановлении',body:'## Решение\nПроверить **Спам**.\n<script>alert(1)</script>',state:'open',updated_at:'2026-10-30T10:00:00Z',html_url:'https://github.com/example/repo/issues/1'};
test('Markdown is rendered and executable HTML is removed', () => {
  const article = buildArticle(issue, 'example/repo');
  assert.match(article.html, /<strong>Спам<\/strong>/);
  assert.doesNotMatch(article.html, /<script|alert\(1\)/);
  assert.equal(article.name, '[FAQ #1] Нет письма о восстановлении');
});
test('opened creates, edited and closed update the same page', async () => {
  let page = null; const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push(options.method);
    if (options.method === 'GET') return {ok:true,json:async()=>({contents:page?[{type:'page',...page}]:[]})};
    page = {id:17,...JSON.parse(options.body)};
    return {ok:true,json:async()=>page};
  };
  const opts = {repository:'example/repo',baseUrl:'https://bookstack.example',tokenId:'id',tokenSecret:'secret',bookId:1,fetchImpl:fakeFetch};
  assert.equal((await syncIssue({...opts,issue})).operation, 'created');
  assert.equal((await syncIssue({...opts,issue:{...issue,body:'## Решение\nИсправленный ответ'}})).pageId,17);
  assert.equal((await syncIssue({...opts,issue:{...issue,state:'closed'}})).pageId,17);
  assert.deepEqual(calls,['GET','POST','GET','PUT','GET','PUT']);
  assert.match(page.html,/Решено/);
});
test('failed API request stops the synchronization', async () => {
  await assert.rejects(syncIssue({issue,repository:'example/repo',baseUrl:'https://bookstack.example',tokenId:'id',tokenSecret:'secret',bookId:1,
    fetchImpl:async()=>({ok:false,status:401})}), /HTTP 401/);
});
