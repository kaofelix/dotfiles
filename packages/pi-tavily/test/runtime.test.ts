import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentSession, createCodemodeExtension, DefaultResourceLoader, SettingsManager, SessionManager } from '@earendil-works/pi-coding-agent';

test('Pi loads directly callable Tavily tools with shared namespace discovery and instructions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pi-tavily-runtime-'));
  const settingsManager = SettingsManager.inMemory({defaultTools: ['+codemode']});
  const loader = new DefaultResourceLoader({
    cwd: directory, agentDir: directory, settingsManager,
    extensionFactories: [createCodemodeExtension({mode: 'on'})],
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    additionalExtensionPaths: [fileURLToPath(new URL('../index.ts', import.meta.url))],
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  const sessionManager = SessionManager.inMemory(directory);
  const code = `
    const namespace = await describeNamespace('tavily');
    if (!namespace?.instructions?.includes('status')) throw new Error('Missing shared result guidance');
    if (!namespace.tools.includes('tavily_search') || !namespace.tools.includes('tavily_extract')) throw new Error('Missing namespace tools');
    const found = await searchTools('web', {namespace: 'tavily', limit: 20});
    if (found.length !== 2 || found.some(tool => !tool.name.startsWith('tavily_'))) throw new Error('Invalid namespace discovery');
    text({namespace, found});
  `;
  sessionManager.appendMessage({
    role: 'assistant', content: [{type: 'toolCall', id: 'namespace-check', name: 'codemode', arguments: {code}}],
    api: 'openai-completions', provider: 'openai', model: 'gpt-4o-mini', stopReason: 'toolUse', timestamp: Date.now(),
    usage: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0}},
  });
  const {session} = await createAgentSession({cwd: directory, agentDir: directory, settingsManager, resourceLoader: loader, sessionManager});
  try {
    await session.bindExtensions({});
    for (const name of ['tavily_search', 'tavily_extract']) assert.ok(session.agent.state.tools.some(tool => tool.name === name));
    const result = await session.agent.state.tools.find(tool => tool.name === 'codemode')!.execute('namespace-check', {code});
    assert.notEqual(result.isError, true, JSON.stringify(result.content));
  } finally {
    session.dispose();
  }
});
