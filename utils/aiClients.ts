import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function callOpenAIWithSearch(prompt: string, systemPrompt: string): Promise<string> {
  const result = await openai.responses.create({
    model: "gpt-5.4",
    tools: [{ type: "web_search_preview" as const }],
    instructions: systemPrompt,
    input: prompt,
  });
  const texts: string[] = [];
  for (const o of result.output ?? []) {
    if (o.type === "message" && "content" in o) {
      for (const c of (o as unknown as { content: { type: string; text?: string }[] }).content) {
        if (c.type === "output_text" && c.text) texts.push(c.text);
      }
    }
  }
  return texts.join("\n");
}

export async function callClaude(prompt: string, systemPrompt: string): Promise<string> {
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
    system: systemPrompt,
  });
  return res.content[0]?.type === "text" ? res.content[0].text : "";
}
