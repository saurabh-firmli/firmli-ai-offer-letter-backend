import {describe, it} from "node:test";
import assert from "node:assert/strict";
import express from "express";
import Joi from "joi";
import request from "supertest";

import firmliOfferLetterApp from "../src/v1/firmliOfferLetterApp.js";
import validate from "../src/v1/middlewares/validate.middleware.js";

describe("app", () => {
    it("GET /v1/health answers 200 with the service status", async () => {
        const res = await request(firmliOfferLetterApp).get("/v1/health");

        assert.equal(res.status, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.data.service, "firmli-ai-offer-letter-backend");
        assert.equal(res.body.data.database, "not_configured");
    });

    it("answers 404 in the ApiError shape for an unknown route", async () => {
        const res = await request(firmliOfferLetterApp).get("/v1/does-not-exist");

        assert.equal(res.status, 404);
        assert.equal(res.body.success, false);
        assert.equal(res.body.message, "Not Found");
        assert.deepEqual(res.body.errors, [{message: "/v1/does-not-exist endpoint is not found."}]);
    });

    it("answers 400 for invalid JSON", async () => {
        const res = await request(firmliOfferLetterApp)
            .post("/v1/health")
            .set("Content-Type", "application/json")
            .send("{bad json");

        assert.equal(res.status, 400);
        assert.equal(res.body.success, false);
    });

    it("sets security headers and a request id", async () => {
        const res = await request(firmliOfferLetterApp).get("/v1/health");

        assert.equal(res.headers["x-content-type-options"], "nosniff");
        assert.equal(res.headers["x-powered-by"], undefined);
        assert.match(res.headers["x-request-id"], /^[0-9a-f-]{36}$/);
    });
});

describe("validate middleware", () => {
    const app = express();
    app.use(express.json());
    app.post(
        "/items",
        validate(Joi.object({name: Joi.string().required(), qty: Joi.number().integer().min(1).required()})),
        (req, res) => res.json(req.body)
    );

    it("answers 422 with every field error", async () => {
        const res = await request(app).post("/items").send({qty: 0});

        assert.equal(res.status, 422);
        assert.ok(res.body.errors.name);
        assert.ok(res.body.errors.qty);
    });

    it("passes converted values to the handler", async () => {
        const res = await request(app).post("/items").send({name: "pen", qty: "3"});

        assert.equal(res.status, 200);
        assert.deepEqual(res.body, {name: "pen", qty: 3});
    });
});
