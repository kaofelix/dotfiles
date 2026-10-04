import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Value } from 'typebox/value';
import { createAgentSession, createCodemodeExtension, DefaultResourceLoader, SettingsManager, SessionManager, initTheme, ToolExecutionComponent } from '@earendil-works/pi-coding-agent';

if (!process.env.TAVILY_API_KEY) throw new Error('Live smoke checks require TAVILY_API_KEY and consume API credits');
const directory = await mkdtemp(join(tmpdir(), 'pi-tavily-smoke-'));
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const settingsManager = SettingsManager.inMemory({defaultTools: ['+codemode']});
const loader = new DefaultResourceLoader({
  cwd: directory, agentDir: directory, settingsManager,
  extensionFactories: [createCodemodeExtension({mode: 'on'})],
  noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  additionalExtensionPaths: [join(root, 'index.ts')],
});
await loader.reload();
const loaded = loader.getExtensions();
assert.deepEqual(loaded.errors, []);
assert.deepEqual(loaded.warnings ?? [], []);
assert.equal(loaded.extensions.length, 2);
const registered = loaded.extensions.find(extension => extension.tools.has('tavily_search'))!.tools;
assert.deepEqual([...registered.keys()].sort(), ['tavily_extract', 'tavily_search']);
const sessionManager = SessionManager.inMemory(directory);
const code = 'const result = await tools.tavily_search({query: "Tavily SDK", maxResults: 1, searchDepth: "ultra-fast"}); if (!Array.isArray(result.results) || !result.requestId) throw new Error("Expected structured Tavily response"); text({results: result.resultCount, credits: result.usage?.credits});';
// An in-memory assistant call gives nested execution its parent context,
// without paying for a model request to trigger a deterministic smoke check.
sessionManager.appendMessage({
  role: 'assistant', content: [{type: 'toolCall', id: 'structured-smoke', name: 'codemode', arguments: {code}}],
  api: 'openai-completions', provider: 'openai', model: 'gpt-4o-mini', stopReason: 'toolUse', timestamp: Date.now(),
  usage: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0}},
});
const {session} = await createAgentSession({cwd: directory, agentDir: directory, settingsManager, resourceLoader: loader, sessionManager});
try {
  await session.bindExtensions({});
  initTheme('dark', false);
  const summary = [];
  for (const [name, params] of [
    ['tavily_search', {query: 'Tavily JavaScript SDK documentation', maxResults: 2, searchDepth: 'fast', includeRawContent: 'markdown', includeImages: true, includeImageDescriptions: true, timeout: 60}],
    ['tavily_extract', {urls: ['https://docs.tavily.com/sdk/javascript/reference'], query: 'search options', chunksPerSource: 2, extractDepth: 'basic', format: 'markdown', timeout: 30}],
  ] as const) {
    const tool = registered.get(name)!.definition;
    const executable = session.agent.state.tools.find(tool => tool.name === name)!;
    assert.ok(executable);
    const component = new ToolExecutionComponent(name, name, params, {}, tool,
      {requestRender() {}} as any, directory);
    const pendingViews: string[] = [];
    const result = await executable.execute(name, params, undefined, update => {
      component.updateResult({...update, isError: false}, true);
      pendingViews.push(component.render(100).join('\n'));
    });
    assert.equal(pendingViews.length, 1);
    assert.match(pendingViews[0], name === 'tavily_search' ? /Searching/ : /Extracting/);
    assert.notEqual(result.isError, true, JSON.stringify(result.content));
    assert.equal(Value.Check(tool.outputSchema!, result.structuredContent), true);
    const data = result.structuredContent as Record<string, any>;
    assert.ok(data.resultCount > 0);
    assert.ok(data.requestId);
    assert.ok(data.results.some((source: {rawContent?: string}) => source.rawContent?.length));
    if (!(result.details as Record<string, any>).truncated) {
      const text = result.content.filter(part => part.type === 'text').map(part => part.text).join('\n');
      for (const source of data.results) if (source.rawContent) assert.ok(text.includes(source.rawContent));
      for (const image of data.images ?? []) assert.ok(text.includes(image.url));
    }
    component.updateResult({...result, isError: result.isError === true}, false);
    const views = [false, true].map(expanded => {
      component.setExpanded(expanded);
      return component.render(100).join('\n');
    });
    await writeFile(join(directory, `${name}-result.json`), JSON.stringify(data, null, 2), {mode: 0o600});
    await writeFile(join(directory, `${name}-render.txt`), pendingViews.join('\n') + '\n\n--- COMPACT ---\n\n' + views.join('\n\n--- EXPANDED ---\n\n'), {mode: 0o600});
    summary.push({tool: name, results: data.resultCount, credits: data.usage?.credits, requestId: data.requestId, truncated: data.truncated});
  }
  const codemode = session.agent.state.tools.find(tool => tool.name === 'codemode')!;
  assert.ok(codemode);
  const structuredCheck = await codemode.execute('structured-smoke', {code});
  assert.notEqual(structuredCheck.isError, true, JSON.stringify(structuredCheck.content));
  console.log(JSON.stringify({summary, codemode: structuredCheck.content, artifacts: directory}, null, 2));
} finally {
  session.dispose();
}
