import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import Data from "@/data/packages.json"; // full training data

function buildContextForQuestion(question: string) {
  const q = question.toLowerCase();

  const { brand, contact, packages, faq, routing } = Data as any;

  const relevantIds = new Set<string>();

  if (routing?.packageSuggestionRules) {
    for (const rule of routing.packageSuggestionRules) {
      const triggers: string[] = rule.triggers || [];
      const hit = triggers.some((t) => q.includes(t.toLowerCase()));

      if (hit && rule.targetPackageId) {
        relevantIds.add(rule.targetPackageId);
      }
    }
  }

  let filteredPackages: any[];

  if (relevantIds.size > 0) {
    filteredPackages = (packages || []).filter((p: any) =>
      relevantIds.has(p.id)
    );
  } else {
    filteredPackages = packages || [];
  }

  const filteredFaq =
    (faq || [])
      .filter((item: any) => {
        const fq = (item.q || "").toLowerCase();
        if (!fq) return false;
        return q
          .split(/\W+/)
          .some((word) => word && fq.includes(word.toLowerCase()));
      })
      .slice(0, 4) || [];

  return {
    brand,
    contact,
    packages: filteredPackages,
    faq: filteredFaq.length > 0 ? filteredFaq : (faq || []).slice(0, 3),
  };
}

export async function POST(req: Request) {
  try {
    const { question } = await req.json();

    const ai = new GoogleGenAI({
      apiKey: process.env.GOOGLE_API_KEY!,
    });

    const CONTACT_EMAIL =
      process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "hello@celesteiq.com";

    const systemInstruction = `
You are the CelesteIQ Assistant, acting as a presales consultant.

LANGUAGE
- Your default language is Spanish. Reply in Spanish unless the user clearly writes in English.
- If the user writes in English, reply in English. If the user writes in Spanish, reply in Spanish.

ROLE
- Your job is to understand the user's situation and recommend the most suitable CelesteIQ package(s).
- Always try to:
  1) Rephrase the user's need in 1 short sentence,
  2) Recommend one or two relevant packages from the Context,
  3) Explain briefly how those packages address the problem,
  4) Offer a clear next step (e.g., contact email or book a consultation).

SCOPE
- Only answer questions about CelesteIQ: its Microsoft + AI services, packages, audits, security, training, and contact options.
- Use the JSON "Context" as your source of truth. Prefer mapping the user's need to the closest package rather than saying you don't know.

PRICING / CONTRACTS / OUT-OF-SCOPE
- If the user asks clearly about pricing, specific contract terms, or something not covered in the Context, you can say for example (in the appropriate language):
  "Para detalles precisos de precios o condiciones contractuales, el mejor siguiente paso es contactar con nuestro equipo en ${CONTACT_EMAIL} para que podamos revisar tu situación."
- If the question is completely outside CelesteIQ's services, say briefly that it is out of scope and optionally suggest contacting the team.

STYLE
- Be brief, friendly, and professional.
- Use bullet points when helpful.
- Sound like a human Microsoft + AI consultant, not like a generic chatbot.
- Never talk about how you were built or about AI models.
`;

    const contextObj = buildContextForQuestion(question);

    const contents = `
Question:
${question}

Context (relevant data about CelesteIQ):
${JSON.stringify(contextObj)}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents,
      config: {
        systemInstruction,
        maxOutputTokens: 300,
        temperature: 0.3,
      },
    });

    const text =
      typeof (response as any).text === "function"
        ? await (response as any).text()
        : (response as any).text ??
        (response as any)?.response?.text?.() ??
        "No response text found.";

    return NextResponse.json({ text });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { text: "Server error generating response." },
      { status: 500 }
    );
  }
}
