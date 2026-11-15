const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const runtime = readFileSync(require.resolve('../src/main.js'), 'utf8');
const loadRuntime = () => {
  const context = {
    module: {},
    require: () => ({ Plugin: class {}, PluginSettingTab: class {} }),
  };
  return runInNewContext(runtime + '\n({ normalizeSettings, annotations, maskInline, descriptionMarkdown })', context);
};

test('settings from disk fall back per field and keep valid choices', () => {
  const { normalizeSettings } = loadRuntime();
  const config = normalizeSettings({
    triggerStyle: 'bubble', iconPosition: 'middle', wordColor: ' #F0A001 ',
    panelBackground: 'url(https://example.com)', margin: 5, width: 9999, shadow: false,
  });
  assert.equal(normalizeSettings(null).margin, 6);
  assert.equal(config.triggerStyle, 'bubble');
  assert.equal(config.iconPosition, 'middle');
  assert.equal(config.wordColor, '#F0A001');
  assert.equal(config.panelBackground, '');
  assert.equal(config.margin, 5);
  assert.equal(config.width, 320);
  assert.equal(config.shadow, false);
});

test('inline Markdown keeps delimiters within code and links', () => {
  const { annotations, maskInline, descriptionMarkdown } = loadRuntime();
  const source = '{word/`a & {b/c}` & [web](https://example.com/?a=1&b=2) & [[Note|Alias]]}';
  const matches = [...annotations(maskInline(source))];
  assert.equal(matches.length, 1);
  assert.equal(matches[0].end, source.length);
  assert.equal(descriptionMarkdown(source.slice(matches[0].slash + 1, -1)),
    '`a & {b/c}`<br>[web](https://example.com/?a=1&b=2)<br>[[Note|Alias]]');
});

test('per-tooltip style prefixes leave the word and Markdown description intact', () => {
  const { annotations, maskInline } = loadRuntime();
  const sample = '{hello/plain} {d/dots/one} {t/source/[[Note|Link]]} {b/chat/[Web](https://example.com/a/b)} {h/mark/==text==} {d/letter}';
  const matches = [...annotations(maskInline(sample))].map(({ labelStart, slash, end, style }) =>
    [sample.slice(labelStart, slash), sample.slice(slash + 1, end - 1), style]);
  assert.deepEqual(matches, [
    ['hello', 'plain', undefined],
    ['dots', 'one', 'dotted'],
    ['source', '[[Note|Link]]', 'info'],
    ['chat', '[Web](https://example.com/a/b)', 'bubble'],
    ['mark', '==text==', 'highlight'],
    ['d', 'letter', undefined],
  ]);
});
