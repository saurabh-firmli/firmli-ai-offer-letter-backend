import net from "node:net";
import http from "node:http";

/**
 * A fake SMTP server: takes every email and keeps it in `messages` (to, subject, html, text,
 * attachments), so a flow can check what was sent. `reject = true` answers every email with 550.
 */
export const fakeMailServer = async () => {
    const sockets = new Set();
    const mail = {
        messages: [],
        reject: false,
        to: (email) => mail.messages.filter((message) => message.to.includes(email)),
        // The first email that matches, waiting for it up to `ms` (emails go out after the response)
        waitFor: (match, ms = 5000) => waitUntil(() => mail.messages.find(match), ms, "the email"),
    };

    const server = net.createServer((socket) => {
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
        socket.on("error", () => {});
        socket.setEncoding("latin1");

        let buffer = "";
        let inData = false;
        let envelope = {from: null, to: []};
        const reply = (line) => socket.write(`${line}\r\n`);
        reply("220 fake-smtp ready");

        socket.on("data", (chunk) => {
            buffer += chunk;
            for (;;) {
                if (inData) {
                    const end = buffer.indexOf("\r\n.\r\n");
                    if (end === -1) return;
                    const raw = buffer.slice(0, end).replace(/^\.\./gm, ".");
                    buffer = buffer.slice(end + 5);
                    inData = false;
                    if (mail.reject) reply("550 Rejected by the test");
                    else {
                        mail.messages.push({...parseEmail(raw), from: envelope.from, to: envelope.to});
                        reply("250 Queued");
                    }
                    envelope = {from: null, to: []};
                    continue;
                }
                const lineEnd = buffer.indexOf("\r\n");
                if (lineEnd === -1) return;
                const line = buffer.slice(0, lineEnd);
                buffer = buffer.slice(lineEnd + 2);
                const command = line.slice(0, 4).toUpperCase();
                const address = () => line.match(/<([^>]*)>/)?.[1].toLowerCase();

                if (command === "MAIL") envelope.from = address();
                if (command === "RCPT") envelope.to.push(address());
                if (command === "DATA") {
                    inData = true;
                    reply("354 End with <CRLF>.<CRLF>");
                } else if (command === "QUIT") {
                    reply("221 Bye");
                    socket.end();
                    return;
                } else {
                    reply(command === "EHLO" || command === "HELO" ? "250 fake-smtp" : "250 OK");
                }
            }
        });
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    mail.port = server.address().port;
    mail.close = () => {
        sockets.forEach((socket) => socket.destroy());
        return new Promise((resolve) => server.close(resolve));
    };
    return mail;
};

/**
 * A fake OpenAI Responses API. Document readings say "this is the declared type, sure of it"; the
 * eligibility answer gives each criterion the value in `values` (by criterion name), or null.
 * `fail = {status, message}` makes every call fail; `requests` keeps what the app sent.
 */
export const fakeAiServer = async () => {
    const ai = {requests: [], values: {}, confidence: 0.95, fail: null};

    const answer = (schemaName, body) => {
        const text = body.input[0].content.filter((part) => part.type === "input_text").map((part) => part.text).join("\n");
        if (schemaName === "document_extraction") {
            const declared = text.match(/Declared document type: (.*)/)?.[1] ?? "Document";
            return {detected_type: declared, type_matches: true, confidence: ai.confidence, fields: []};
        }
        const input = JSON.parse(text);
        const documentId = input.documents[0]?.document_id ?? null;
        return {
            criteria: input.criteria.map((criterion) => {
                const value = ai.values[criterion.name] ?? null;
                return {
                    criterion_id: criterion.criterion_id,
                    value: value === null ? null : String(value),
                    source_document_id: value === null ? null : documentId,
                    evidence: value === null ? null : `${criterion.name}: ${value}`,
                    confidence: ai.confidence,
                    reasoning: value === null ? "Not found in the documents" : "Read from the document",
                };
            }),
        };
    };

    const server = http.createServer(async (req, res) => {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw || "{}");
        ai.requests.push({path: req.url, authorization: req.headers.authorization, model: body.model, schemaName: body.text?.format?.name, body});

        const send = (status, json) => res.writeHead(status, {"Content-Type": "application/json", "x-request-id": `req_test_${ai.requests.length}`}).end(JSON.stringify(json));
        if (req.url !== "/v1/responses") return send(404, {error: {message: `Unknown path ${req.url}`}});
        if (ai.fail) return send(ai.fail.status, {error: {message: ai.fail.message}});

        const usage = {input_tokens: 1000, input_tokens_details: {cached_tokens: 200}, output_tokens: 300};
        send(200, {id: `resp_test_${ai.requests.length}`, status: "completed", usage, output: [{type: "message", content: [{type: "output_text", text: JSON.stringify(answer(body.text.format.name, body))}]}]});
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    ai.port = server.address().port;
    ai.close = () => {
        server.closeAllConnections();
        return new Promise((resolve) => server.close(resolve));
    };
    return ai;
};

// Calls check() every 50 ms until it gives something, for at most `ms`
export const waitUntil = async (check, ms = 5000, what = "the condition") => {
    const until = Date.now() + ms;
    for (;;) {
        const result = await check();
        if (result) return result;
        if (Date.now() > until) throw new Error(`Timed out after ${ms} ms waiting for ${what}`);
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
};

// ---- Reading an email: headers, the HTML / text parts and the attachments' names

const decodeQuotedPrintable = (text) =>
    Buffer.from(text.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16))), "latin1").toString("utf8");

const decodeWords = (value = "") =>
    value.replace(/=\?[^?]+\?([BQ])\?([^?]*)\?=\s*/gi, (match, encoding, text) =>
        encoding.toUpperCase() === "B" ? Buffer.from(text, "base64").toString("utf8") : decodeQuotedPrintable(text.replace(/_/g, " "))
    );

const splitPart = (raw) => {
    const split = raw.indexOf("\r\n\r\n");
    const head = split === -1 ? raw : raw.slice(0, split);
    const headers = {};
    for (const line of head.replace(/\r\n[ \t]+/g, " ").split("\r\n")) {
        const colon = line.indexOf(":");
        if (colon > 0) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    }
    return {headers, body: split === -1 ? "" : raw.slice(split + 4)};
};

const parseEmail = (raw) => {
    const email = {subject: "", html: "", text: "", attachments: [], headers: {}};
    const walk = (part) => {
        const {headers, body} = splitPart(part);
        const type = headers["content-type"] ?? "text/plain";
        const boundary = type.match(/boundary="?([^";]+)"?/i)?.[1];
        if (boundary) {
            body.split(`--${boundary}`).slice(1, -1).forEach((child) => walk(child.replace(/^\r\n/, "")));
            return;
        }
        const encoding = (headers["content-transfer-encoding"] ?? "").toLowerCase();
        const bytes = encoding === "base64" ? Buffer.from(body.replace(/\s+/g, ""), "base64") : null;
        const fileName = decodeWords((headers["content-disposition"] ?? "").match(/filename="?([^";]+)"?/i)?.[1] ?? "");
        if (fileName || headers["content-id"]) {
            email.attachments.push({fileName, contentType: type.split(";")[0], contentId: headers["content-id"]?.replace(/[<>]/g, "") ?? null, size: bytes?.length ?? body.length});
            return;
        }
        const content = bytes ? bytes.toString("utf8") : encoding === "quoted-printable" ? decodeQuotedPrintable(body) : body;
        if (type.startsWith("text/html")) email.html += content;
        else if (type.startsWith("text/plain")) email.text += content;
    };
    const {headers} = splitPart(raw);
    email.headers = headers;
    email.subject = decodeWords(headers.subject);
    walk(raw);
    return email;
};
