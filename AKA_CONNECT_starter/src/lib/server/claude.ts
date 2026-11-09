import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

export const anthropic = new Anthropic(); // lit ANTHROPIC_API_KEY
export const MODEL = 'claude-opus-5-5';

type Effort = 'low' | 'medium' | 'high';

// Repli automatique côté serveur si un classifieur de sécurité refuse la requête.
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };

function textOf(msg: Anthropic.Beta.BetaMessage): string {
  return msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');
}

function assertUsable(msg: Anthropic.Beta.BetaMessage) {
  if (msg.stop_reason === 'refusal') {
    throw new Error(`Requête refusée par le modèle (${msg.stop_details?.category ?? 'inconnu'})`);
  }
  if (msg.stop_reason === 'max_tokens') throw new Error('Réponse tronquée (max_tokens)');
}

/** Appel simple avec sortie JSON garantie par un schéma (structured outputs). */
export async function jsonCall<T>(opts: {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  effort?: Effort;
}): Promise<T> {
  const msg = await anthropic.beta.messages.create({
    ...FALLBACK,
    model: MODEL,
    max_tokens: 16000,
    system: opts.system,
    messages: [{ role: 'user', content: opts.prompt }],
    output_config: { effort: opts.effort ?? 'medium', format: { type: 'json_schema', schema: opts.schema } },
  });
  assertUsable(msg);
  return JSON.parse(textOf(msg)) as T;
}

/**
 * Boucle de recherche : Claude utilise les outils serveur (web_search / web_fetch)
 * puis remet son résultat en appelant l'outil client `deliverTool` (schéma strict).
 * Renvoie l'input de cet appel.
 */
export async function researchCall<T>(opts: {
  system: string;
  prompt: string;
  serverTools: Anthropic.Beta.BetaToolUnion[];
  deliverTool: Anthropic.Beta.BetaTool;
  effort?: Effort;
  maxTurns?: number;
}): Promise<T> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: opts.prompt }];
  const tools = [...opts.serverTools, opts.deliverTool];

  for (let turn = 0; turn < (opts.maxTurns ?? 8); turn++) {
    const msg = await anthropic.beta.messages.create({
      ...FALLBACK,
      model: MODEL,
      max_tokens: 16000,
      system: opts.system,
      tools,
      messages,
      output_config: { effort: opts.effort ?? 'medium' },
    });
    assertUsable(msg);
    messages.push({ role: 'assistant', content: msg.content });

    const deliver = msg.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === opts.deliverTool.name,
    );
    if (deliver) return deliver.input as T;

    // Tour serveur en pause : on renvoie tel quel pour qu'il continue.
    if (msg.stop_reason === 'pause_turn') continue;

    // Le modèle s'est arrêté sans livrer : on le relance une fois explicitement.
    messages.push({
      role: 'user',
      content: `Appelle maintenant l'outil ${opts.deliverTool.name} avec tes résultats (liste vide si rien de pertinent).`,
    });
  }
  throw new Error('La recherche n’a pas abouti (nombre de tours maximum atteint)');
}
