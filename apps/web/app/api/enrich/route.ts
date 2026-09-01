// Optional AI naming pass. Receives the structured tool list produced by the
// heuristic generator (never page HTML, never user data) and asks a model for
// clearer names and descriptions. Returns 501 when no API key is configured, so
// the app degrades to heuristic mode instead of failing.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TOOLS = 60;
const DEFAULT_MODEL = "gpt-4o-mini";

interface IncomingTool {
  readonly name: string;
  readonly capability: string;
  readonly description: string;
  readonly parameters: readonly { name: string; description: string }[];
}

const SYSTEM_PROMPT = `You rename browser automation tools so that an AI agent can pick the right one.

Rules:
- Reply with JSON only, shaped as {"tools":[{"originalName":string,"name":string,"description":string,"parameters":[{"name":string,"description":string}]}]}.
- "name" must be snake_case, lowercase, 1-60 characters, a verb followed by its object (for example send_invoice_to_client).
- Keep "originalName" exactly as given so the caller can match your answer.
- "description" is 1-3 sentences: what the tool does, when to use it, and what it returns. No marketing language.
- Never invent parameters. Only rewrite the description of parameters you were given, and keep their names unchanged.
- Never change what a tool does, and never claim a destructive tool is safe.`;

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "not_configured",
        message:
          "AI naming is not configured on this deployment. Set OPENAI_API_KEY to enable it; heuristic mode needs no key.",
      },
      { status: 501 },
    );
  }

  let tools: IncomingTool[];
  let pageTitle = "";
  try {
    const body: unknown = await request.json();
    const parsed = parseBody(body);
    tools = parsed.tools;
    pageTitle = parsed.title;
  } catch (error) {
    return NextResponse.json(
      { error: "bad_request", message: error instanceof Error ? error.message : "Invalid body." },
      { status: 400 },
    );
  }

  if (tools.length === 0) {
    return NextResponse.json({ tools: [] });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              page: pageTitle,
              tools: tools.map((tool) => ({
                originalName: tool.name,
                capability: tool.capability,
                currentDescription: tool.description,
                parameters: tool.parameters,
              })),
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json(
        { error: "upstream_error", message: `Model call failed (${response.status}).`, detail: detail.slice(0, 400) },
        { status: 502 },
      );
    }

    const payload: unknown = await response.json();
    const content = extractContent(payload);
    if (!content) {
      return NextResponse.json({ error: "empty_response", message: "The model returned no content." }, { status: 502 });
    }

    const parsed: unknown = JSON.parse(content);
    const rewrites = Array.isArray((parsed as { tools?: unknown }).tools)
      ? (parsed as { tools: unknown[] }).tools
      : [];
    return NextResponse.json({ tools: rewrites });
  } catch (error) {
    return NextResponse.json(
      { error: "enrichment_failed", message: error instanceof Error ? error.message : "Unknown failure." },
      { status: 502 },
    );
  }
}

function parseBody(body: unknown): { tools: IncomingTool[]; title: string } {
  if (typeof body !== "object" || body === null) throw new Error("Body must be a JSON object.");
  const record = body as { tools?: unknown; page?: unknown };
  if (!Array.isArray(record.tools)) throw new Error('Body must contain a "tools" array.');

  const page = typeof record.page === "object" && record.page !== null ? (record.page as { title?: unknown }) : {};
  const title = typeof page.title === "string" ? page.title : "";

  const tools: IncomingTool[] = [];
  for (const entry of record.tools.slice(0, MAX_TOOLS)) {
    if (typeof entry !== "object" || entry === null) continue;
    const tool = entry as { name?: unknown; capability?: unknown; description?: unknown; parameters?: unknown };
    if (typeof tool.name !== "string") continue;
    tools.push({
      name: tool.name,
      capability: typeof tool.capability === "string" ? tool.capability : "write",
      description: typeof tool.description === "string" ? tool.description : "",
      parameters: Array.isArray(tool.parameters)
        ? tool.parameters.flatMap((parameter) => {
            if (typeof parameter !== "object" || parameter === null) return [];
            const record = parameter as { name?: unknown; description?: unknown };
            if (typeof record.name !== "string") return [];
            return [
              { name: record.name, description: typeof record.description === "string" ? record.description : "" },
            ];
          })
        : [],
    });
  }
  return { tools, title };
}

function extractContent(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : null;
}
