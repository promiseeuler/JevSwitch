import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

const openai = new OpenAI();
const Ticket = z.object({
  category: z.enum(["billing", "technical", "sales", "other"]),
});

export async function classifyTicket(ticket: string) {
  return openai.responses.parse({
    model: "gpt-5-mini",
    input: `Classify this support ticket into exactly one category: ${ticket}`,
    text: { format: zodTextFormat(Ticket, "ticket") },
  });
}
