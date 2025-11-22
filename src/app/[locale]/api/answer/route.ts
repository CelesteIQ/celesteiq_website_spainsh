// app/api/answer/route.ts  (or wherever this lives)
import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import Data from "@/data/packages.json";

// ✅ Helper: build a smaller, relevant context for this specific question
function buildContextForQuestion(question: string) {
  const q = question.toLowerCase();

  const { brand, contact, packages, faq, routing } = Data as any;

  // 1) Decide which packages are most relevant based on routing triggers
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
    // Only the packages that match the triggers
    filteredPackages = (packages || []).filter((p: any) =>
      relevantIds.has(p.id)
    );
  } else {
    // Fallback: send only light info for all packages
    filteredPackages = (packages || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      headline: p.headline,
      summary: p.summary,
    }));
  }

  // 2) Filter FAQ: simple keyword match, then cap to a few entries
  const filteredFaq =
    (faq || [])
      .filter((item: any) => {
        const fq = (item.q || "").toLowerCase();
        if (!fq) return false;
        // match on any word from the question
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
      process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@celesteiq.com";

    const systemInstruction = `
You are the CelesteIQ Assistant.

- Your default language is Spanish. Always reply in Spanish unless the user clearly writes in English.
- If the user writes in English, reply in English. If the user writes in Spanish, reply in Spanish.
- Only answer questions about CelesteIQ: its Microsoft + AI services, packages, audits, security, training, and contact options.
- Use the JSON "Context" as your source of truth.
- If the user asks something not in the Context or about pricing/contracts/refunds, say:
  "Para este tipo de consulta, por favor contacte a nuestro equipo en ${CONTACT_EMAIL} para recibir más información."
- Be brief, friendly, and professional. Use bullet points when helpful.
- Never talk about how you were built or about AI models.
`;

    // ✅ Build a *small* context just for this question (token-friendly)
    const contextObj = buildContextForQuestion(question);

    const contents = `
Question:
${question}

Context (only relevant slice of data):
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
