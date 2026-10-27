import config from "../configs/env.config.js";

const RESPONSES_URL = `${config.openaiBaseUrl}/responses`;
// Reading a long PDF can take a while; a stuck call must still end
const TIMEOUT_MS = 180_000;

/**
 * Calls OpenAI with the client's own API key and gets back JSON that follows `schema` (Structured
 * Outputs, strict). Every result and every error carries the token usage, duration and request id,
 * so the caller can log the cost (aiUsageService.record) whether the call worked or not.
 */
const openaiHelper = {
    /**
     * @example openaiHelper.respond({apiKey, model: "gpt-5.6-terra", instructions, content: [openaiHelper.text("...")], schemaName: "result", schema})
     */
    respond: async ({apiKey, model, instructions, content, schemaName, schema}) => {
        const startedAt = Date.now();
        let response;
        let body = {};
        try {
            response = await fetch(RESPONSES_URL, {
                method: "POST",
                headers: {Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json"},
                body: JSON.stringify({
                    model,
                    instructions,
                    input: [{role: "user", content}],
                    text: {format: {type: "json_schema", name: schemaName, schema, strict: true}},
                }),
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            body = await response.json().catch(() => ({}));
        } catch (error) {
            throw openaiHelper.failure(error.name === "TimeoutError" ? "The AI took too long to answer" : `Could not reach the AI: ${error.message}`, {startedAt, retryable: true});
        }

        const meta = {
            usage: {
                inputTokens: body.usage?.input_tokens ?? 0,
                cachedInputTokens: body.usage?.input_tokens_details?.cached_tokens ?? 0,
                outputTokens: body.usage?.output_tokens ?? 0,
            },
            durationMs: Date.now() - startedAt,
            providerRequestId: response.headers.get("x-request-id") ?? body.id ?? null,
        };
        // Busy (429), timed out (408) or broken for now (5xx): worth trying again later; a wrong key or request is not
        const retryable = [408, 429].includes(response.status) || response.status >= 500;
        if (!response.ok) throw openaiHelper.failure(body.error?.message ?? `The AI answered ${response.status}`, {...meta, retryable});

        const text = (body.output ?? []).flatMap((item) => item.content ?? []).find((part) => part.type === "output_text")?.text;
        if (!text) {
            const reason = body.status === "incomplete" ? `The AI answer was cut off (${body.incomplete_details?.reason})` : "The AI gave no answer";
            throw openaiHelper.failure(reason, meta);
        }
        return {data: JSON.parse(text), ...meta};
    },

    // Content parts for `content`
    text: (text) => ({type: "input_text", text}),
    pdf: (buffer, fileName) => ({type: "input_file", filename: fileName, file_data: `data:application/pdf;base64,${buffer.toString("base64")}`}),
    image: (buffer, mimeType) => ({type: "input_image", image_url: `data:${mimeType};base64,${buffer.toString("base64")}`}),

    // An Error with the usage so far, and whether trying again later may work; an API key in the message is masked
    failure: (message, meta) =>
        Object.assign(new Error(String(message).replace(/sk-[A-Za-z0-9_-]+/g, "sk-***")), {
            retryable: Boolean(meta.retryable),
            usage: meta.usage ?? {inputTokens: 0, cachedInputTokens: 0, outputTokens: 0},
            durationMs: meta.durationMs ?? Date.now() - meta.startedAt,
            providerRequestId: meta.providerRequestId ?? null,
        }),
};

export default openaiHelper;
