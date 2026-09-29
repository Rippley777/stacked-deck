import { z } from 'zod';
import { AppError } from './errors.js';
import { valuationLimits } from '../shared/valuation.js';
export async function structuredResponse(options: {
  model: string;
  name: string;
  schema: object;
  instructions: string;
  input: unknown[];
  maxOutputTokens?: number;
}): Promise<unknown> {
  if (!process.env.OPENAI_API_KEY?.trim())
    throw new AppError(503, 'AI is not configured. Set OPENAI_API_KEY on the server.');
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(valuationLimits.timeoutMs),
      body: JSON.stringify({
        model: options.model,
        store: false,
        max_output_tokens: options.maxOutputTokens || 2000,
        instructions: options.instructions,
        input: options.input,
        text: {
          format: { type: 'json_schema', name: options.name, strict: true, schema: options.schema },
        },
      }),
    });
    if (!response.ok) {
      if (response.status === 429) {
        const detail = z
          .object({
            error: z.object({
              code: z.string().nullable().optional(),
              type: z.string().optional(),
            }),
          })
          .safeParse(await response.json().catch(() => null));
        const code = detail.success ? detail.data.error.code : undefined;
        const type = detail.success ? detail.data.error.type : undefined;
        const messages: Record<string, string> = {
          credit_balance_exhausted:
            'OpenAI API credits are exhausted. Add credits in the API billing settings for the organization associated with your API key, then try again.',
          organization_spend_limit_exceeded:
            'The OpenAI organization has reached its API spend limit. Update the organization spend limit or wait for it to reset.',
          project_spend_limit_exceeded:
            'The OpenAI project has reached its API spend limit. Update the spend limit for the project associated with your API key or wait for it to reset.',
          organization_usage_limit_exceeded:
            'The OpenAI organization has reached its approved API usage limit. Request a higher limit in the API settings.',
          insufficient_quota:
            'OpenAI API quota is unavailable. Check API credits and usage limits for the organization and project associated with your API key. Retrying will not restore quota.',
          rate_limit_exceeded:
            'OpenAI temporarily rate-limited this request. Wait before trying again, or check the model request and token limits.',
          slow_down:
            'OpenAI temporarily rate-limited this request. Wait before trying again and reduce how frequently you request estimates or scans.',
        };
        const message =
          (code && messages[code]) ||
          (type === 'insufficient_quota' && messages.insufficient_quota) ||
          (type === 'rate_limit_error' && messages.rate_limit_exceeded) ||
          'OpenAI rejected this request with a usage-limit error. Check API credits and limits before trying again.';
        throw new AppError(429, message);
      }
      if ([401, 403].includes(response.status))
        throw new AppError(
          503,
          'The AI service could not authenticate. Check the server API key and model access.',
        );
      throw new AppError(502, 'The AI service could not complete this request. Try again shortly.');
    }
    const envelope = z
      .object({
        status: z.literal('completed'),
        output: z.array(
          z.object({
            type: z.string(),
            content: z
              .array(z.object({ type: z.string(), text: z.string().optional() }))
              .optional(),
          }),
        ),
      })
      .parse(await response.json());
    const text = envelope.output
      .filter((item) => item.type === 'message')
      .flatMap((item) => item.content || [])
      .filter((part) => part.type === 'output_text')
      .map((part) => part.text || '')
      .join('');
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
      throw new AppError(504, 'The AI request took too long. Try again shortly.');
    throw new AppError(502, 'The AI service did not return usable details. Try again later.');
  }
}
