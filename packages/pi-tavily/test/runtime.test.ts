import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentSession, createCodemodeExtension, DefaultResourceLoader, SettingsManager, SessionManager } from '@earendil-works/pi-coding-agent';
import extension from '../index.ts';
import type { RequestRunner } from '../transport.ts';

async function checkCodemode(code: string, run?: RequestRunner) {
  const directory = await mkdtemp(join(tmpdir(), 'pi-tavily-runtime-'));
  const settingsManager = SettingsManager.inMemory({defaultTools: ['+codemode']});
  const loader = new DefaultResourceLoader({
    cwd: directory, agentDir: directory, settingsManager,
    extensionFactories: [createCodemodeExtension({mode: 'on'}), ...(run ? [(pi: Parameters<typeof extension>[0]) => extension(pi, run)] : [])],
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    additionalExtensionPaths: run ? [] : [fileURLToPath(new URL('../index.ts', import.meta.url))],
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  const sessionManager = SessionManager.inMemory(directory);
  sessionManager.appendMessage({
    role: 'assistant', content: [{type: 'toolCall', id: 'runtime-check', name: 'codemode', arguments: {code}}],
    api: 'openai-completions', provider: 'openai', model: 'gpt-4o-mini', stopReason: 'toolUse', timestamp: Date.now(),
    usage: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0}},
  });
  const {session} = await createAgentSession({cwd: directory, agentDir: directory, settingsManager, resourceLoader: loader, sessionManager});
  try {
    await session.bindExtensions({});
    for (const name of ['tavily_search', 'tavily_extract']) assert.ok(session.agent.state.tools.some(tool => tool.name === name));
    const result = await session.agent.state.tools.find(tool => tool.name === 'codemode')!.execute('runtime-check', {code});
    assert.notEqual(result.isError, true, JSON.stringify(result.content));
  } finally {
    session.dispose();
  }
}

test('Pi loads directly callable Tavily tools with shared namespace discovery and instructions', async () => {
  await checkCodemode(`
    const namespace = await describeNamespace('tavily');
    if (!namespace?.instructions?.includes('status')) throw new Error('Missing shared result guidance');
    if (!namespace.tools.includes('tavily_search') || !namespace.tools.includes('tavily_extract')) throw new Error('Missing namespace tools');
    const found = await searchTools('web', {namespace: 'tavily', limit: 20});
    if (found.length !== 2 || found.some(tool => !tool.name.startsWith('tavily_'))) throw new Error('Invalid namespace discovery');
    text({namespace, found});
  `);
});

test('native codemode can filter complete Tavily data larger than model previews', async () => {
  const saved = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = 'test-key';
  try {
    await checkCodemode(`
      const result = await tools.tavily_search({query: 'guide', includeRawContent: 'markdown'});
      if (result.truncated || result.results[0].rawContent.length !== 60000) throw new Error('Programmatic data was clipped');
      text({url: result.results[0].url, length: result.results[0].rawContent.length});
    `, async () => ({query: 'guide', images: [], responseTime: 0.1, requestId: 'fixture', results: [
      {url: 'https://example.com', title: 'Guide', score: 1, id: 'source', publishedDate: '', content: 'snippet', rawContent: 'source line\n'.repeat(5000)},
    ]}));
  } finally {
    if (saved === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = saved;
  }
});
