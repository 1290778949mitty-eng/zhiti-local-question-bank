import test from 'node:test';
import assert from 'node:assert/strict';
import {transform} from 'esbuild';
import {readFile} from 'node:fs/promises';
const source=await transform(await readFile('lib/answer-studio-downloads.ts','utf8'),{loader:'ts',format:'esm'});
const {StudioDownloads}=await import(`data:text/javascript;base64,${Buffer.from(source.code).toString('base64')}`);
test('draft edits and restores revoke every previous export and backup URL',()=>{
  let next=0;const revoked=[];
  const downloads=new StudioDownloads({createObjectURL:()=>`blob:${++next}`,revokeObjectURL:url=>revoked.push(url)});
  const blob=new Blob(['sample']);
  downloads.offer(blob,'full.docx','full');
  assert.equal(downloads.offer(blob,'answers.docx','answers').length,2);
  assert.equal(downloads.offer(blob,'updated.docx','full').length,2);
  assert.deepEqual(revoked,['blob:1']);
  assert.deepEqual(downloads.invalidate(),[]);
  assert.deepEqual(revoked,['blob:1','blob:2','blob:3']);
  assert.equal(downloads.offer(blob,'new.json','backup').length,1);
});
