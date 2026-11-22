import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { SUMMARY_SYSTEM, summaryPrompt, templateSummary, type ClassFacts } from "@/lib/class-summary";

export type Summary = { text: string; by: "claude" | "template" };

/**
 * Claude writes the summary when ANTHROPIC_API_KEY is set (server only); any problem -> the template text, so the
 * professor always gets a summary. Refusals fall back to another model on the server ("default" fallbacks).
 */
export async function writeSummary(facts: ClassFacts): Promise<Summary> {
  if (!process.env.ANTHROPIC_API_KEY) return { text: templateSummary(facts), by: "template" };
  try {
    const client = new Anthropic({ timeout: 60_000, maxRetries: 2 });
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" }, // a short summary of given facts: no deep reasoning needed
      system: SUMMARY_SYSTEM,
      messages: [{ role: "user", content: summaryPrompt(facts) }],
    });
    if (response.stop_reason === "refusal") return { text: templateSummary(facts), by: "template" };
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text ? { text: text.slice(0, 4000), by: "claude" } : { text: templateSummary(facts), by: "template" };
  } catch (error) {
    if (error instanceof Anthropic.APIError) console.error(JSON.stringify({ at: "class-summary", status: error.status, message: error.message }));
    else console.error(JSON.stringify({ at: "class-summary", error: String(error) }));
    return { text: templateSummary(facts), by: "template" };
  }
}
