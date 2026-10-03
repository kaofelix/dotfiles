import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

import { CandidateCollector } from "./candidate-collector.js";
import { validateSessionPath } from "./launch.js";

const SYSTEM_PROMPT = `You are a Pi session finder. Locate saved Pi coding-agent sessions that best match the user's natural-language request.

Use search_sessions repeatedly with concise terms likely to occur in the conversation. Start specific, then broaden or use synonyms when needed. Search results contain only user and assistant text. Use preview_session when a result needs closer inspection.

Finish by calling return_session_candidates exactly once. Return at most 8 ranked candidates. Never invent a path or claim evidence absent from tool results. Explanations should say why each session matches; excerpts should be short and useful. Return an empty list when there is no credible match.`;

const candidateSchema = Type.Object({
  sessionFile: Type.String({ description: "Absolute JSONL session path copied exactly from search results" }),
  title: Type.String({ description: "Short descriptive title" }),
  explanation: Type.String({ description: "Why this session matches the request" }),
  excerpt: Type.String({ description: "Short supporting excerpt from the session" }),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
  cwd: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
});

export function createFinderTools({ search, collector }) {
  const searchTool = defineTool({
    name: "search_sessions",
    label: "Search sessions",
    description: "Search compact user/assistant conversation text across saved Pi sessions using literal terms",
    parameters: Type.Object({
      terms: Type.Array(Type.String(), { minItems: 1, maxItems: 8 }),
      match: Type.Optional(StringEnum(["any", "all"])),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
    }),
    async execute(_id, params) {
      const rows = await search.search(params);
      return {
        content: [{ type: "text", text: JSON.stringify(rows) }],
        details: { count: rows.length },
      };
    },
  });

  const previewTool = defineTool({
    name: "preview_session",
    label: "Preview session",
    description: "Read the latest compact user/assistant messages from one session returned by search_sessions",
    parameters: Type.Object({
      sessionFile: Type.String(),
      maxMessages: Type.Optional(Type.Integer({ minimum: 1, maximum: 80 })),
    }),
    async execute(_id, params) {
      await validateSessionPath(params.sessionFile);
      const rows = await search.preview(params);
      return {
        content: [{ type: "text", text: JSON.stringify(rows) }],
        details: { count: rows.length },
      };
    },
  });

  const returnTool = defineTool({
    name: "return_session_candidates",
    label: "Return candidates",
    description: "Return the final ranked session candidates and end the search",
    parameters: Type.Object({
      candidates: Type.Array(candidateSchema, { maxItems: 8 }),
    }),
    async execute(_id, params) {
      await collector.accept(params.candidates);
      return {
        content: [{ type: "text", text: `Returned ${collector.candidates.length} validated candidates.` }],
        details: { candidates: collector.candidates },
        terminate: true,
      };
    },
  });

  return [searchTool, previewTool, returnTool];
}

export async function findSessions(query, search, { onToolStart } = {}) {
  const collector = new CandidateCollector({ validatePath: validateSessionPath });
  const cwd = process.cwd();
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: SYSTEM_PROMPT,
  });
  await resourceLoader.reload();

  const tools = createFinderTools({ search, collector });
  const { session, modelFallbackMessage } = await createAgentSession({
    cwd,
    resourceLoader,
    sessionManager: SessionManager.inMemory(cwd),
    customTools: tools,
    tools: tools.map((tool) => tool.name),
  });

  const unsubscribe = session.subscribe((event) => {
    if (event.type === "tool_execution_start") onToolStart?.(event.toolName, event.args);
  });

  try {
    if (modelFallbackMessage) process.stderr.write(`${modelFallbackMessage}\n`);
    await session.prompt(`Find sessions matching this request:\n\n${query}`, {
      expandPromptTemplates: false,
    });
  } finally {
    unsubscribe();
    session.dispose();
  }

  if (collector.candidates.length === 0) {
    throw new Error("The finder did not return any credible session candidates");
  }
  return collector.candidates;
}
