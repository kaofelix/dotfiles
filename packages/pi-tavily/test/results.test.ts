import assert from 'node:assert/strict';
import test from 'node:test';
import { formatSearchResults } from '../index.ts';

test('requested search source content reaches the model alongside its snippet', () => {
  const text = formatSearchResults([{
    title: 'Documentation', url: 'https://example.com/docs', content: 'snippet',
    id: 'source', rawContent: 'Full documentation body', score: 0.9, publishedDate: '',
  }]);
  assert.match(text, /snippet/);
  assert.match(text, /Full documentation body/);
});

test('search image URLs and descriptions reach the model', () => {
  const text = formatSearchResults([], undefined, [{url: 'https://example.com/image.png', description: 'Architecture diagram'}]);
  assert.match(text, /https:\/\/example.com\/image.png/);
  assert.match(text, /Architecture diagram/);
});

test('source-associated image descriptions are included next to their source', () => {
  const text = formatSearchResults([{id: 'source', title: 'Guide', url: 'https://example.com', score: 1,
    content: 'snippet', publishedDate: '', images: [{url: 'https://example.com/source.png', description: 'Source diagram'}]}]);
  assert.match(text, /https:\/\/example.com\/source.png/);
  assert.match(text, /Source diagram/);
});
