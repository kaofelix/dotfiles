import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeContext, validateToolArguments, type JsonObject } from '@earendil-works/pi-ai';
import { stream as openaiStream } from '@earendil-works/pi-ai/api/openai-responses';
import { stream as anthropicStream } from '@earendil-works/pi-ai/api/anthropic-messages';
import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import extension from '../index.ts';

function definitions() {
  const tools: ToolDefinition<any, any>[] = [];
  extension({registerTool: (tool: ToolDefinition<any, any>) => { tools.push(tool); }, on: () => () => {}} as unknown as ExtensionAPI);
  return tools;
}

async function request(provider: 'openai' | 'anthropic', supportsStrict: boolean) {
  const tools = definitions();
  const context = normalizeContext({tools, messages: [{role: 'user', content: 'Find documentation', timestamp: 1}]});
  let payload: any;
  const options = {apiKey: 'sk-test', maxRetries: 0, onPayload(value: unknown) {
    payload = value;
    // Inspect the native adapter's final payload without network access or model charges.
    throw new Error('Captured test payload');
  }};
  const base = {id: 'test', name: 'Test', provider, baseUrl: 'http://127.0.0.1:1', reasoning: false,
    input: ['text'] as ['text'], cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0}, contextWindow: 10000, maxTokens: 1000};
  const stream = provider === 'openai'
    ? openaiStream({...base, api: 'openai-responses', compat: {supportsStrictMode: supportsStrict}}, context, options)
    : anthropicStream({...base, api: 'anthropic-messages', compat: {supportsStrictTools: supportsStrict}}, context, options);
  await stream.result();
  assert.ok(payload, 'Native provider must construct a payload before the deliberate stop');
  return {payload, tools};
}

test('OpenAI requests strict Tavily argument schemas without mutating local validation schemas', async () => {
  const {payload, tools} = await request('openai', true);
  assert.equal(payload.tools.length, 2);
  for (const sent of payload.tools) {
    assert.equal(sent.strict, true);
    assert.equal(sent.parameters.additionalProperties, false);
    assert.deepEqual(sent.parameters.required, Object.keys(sent.parameters.properties));
    const original = tools.find(tool => tool.name === sent.name)!;
    assert.deepEqual(original.parameters.required, [sent.name === 'tavily_search' ? 'query' : 'urls']);
    const required: JsonObject = sent.name === 'tavily_search' ? {query: 'guide'} : {urls: ['https://example.com']};
    const arguments_: JsonObject = {...Object.fromEntries(Object.keys(sent.parameters.properties).map(key => [key, null])), ...required};
    assert.deepEqual(validateToolArguments(original, {type: 'toolCall', id: 'id', name: sent.name, arguments: arguments_}), required);
  }
});

test('unsupported providers and Anthropic-incompatible constraints fall back to ordinary Tavily tools', async () => {
  for (const [provider, supportsStrict] of [['openai', false], ['anthropic', true], ['anthropic', false]] as const) {
    const {payload, tools} = await request(provider, supportsStrict);
    for (const sent of payload.tools) {
      assert.notEqual(sent.strict, true);
      const original = tools.find(tool => tool.name === sent.name)!;
      const parameters = provider === 'openai' ? sent.parameters : sent.input_schema;
      assert.deepEqual(parameters.required, original.parameters.required);
      assert.equal((parameters.properties.query ?? parameters.properties.urls).minLength ?? parameters.properties.urls?.minItems, 1);
    }
  }
});
