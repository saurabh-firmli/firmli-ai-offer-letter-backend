-- 034: AI providers and real model prices.
--
-- ai_providers: who serves a model (OpenAI / ChatGPT, Anthropic / Claude). is_available = the app can
-- call that provider today; models of other providers are listed with their prices but cannot be
-- picked in Settings yet (only OpenAI is called for now).
--
-- ai_models gets its provider and the official prices in USD per 1 million tokens (OpenAI and
-- Anthropic pricing pages, 2026-10-26), plus the current Claude models.
--
-- AI usage logs made while prices were missing get their cost now, from these prices.

CREATE TABLE ai_providers (
    id           INT          NOT NULL AUTO_INCREMENT,
    code         VARCHAR(50)  NOT NULL,
    name         VARCHAR(100) NOT NULL,
    is_available TINYINT(1)   NOT NULL DEFAULT 0,
    sort_order   INT          NOT NULL DEFAULT 0,
    deleted_at   DATETIME     NULL,
    not_deleted  TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_ai_providers_code (code, not_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO ai_providers (code, name, is_available, sort_order) VALUES
    ('openai',    'OpenAI (ChatGPT)',   1, 10),
    ('anthropic', 'Anthropic (Claude)', 0, 20);

ALTER TABLE ai_models
    ADD COLUMN provider_id INT NULL AFTER id;

UPDATE ai_models SET provider_id = (SELECT id FROM ai_providers WHERE code = 'openai');

ALTER TABLE ai_models
    MODIFY COLUMN provider_id INT NOT NULL,
    ADD KEY idx_ai_models_provider (provider_id),
    ADD CONSTRAINT fk_ai_models_provider FOREIGN KEY (provider_id) REFERENCES ai_providers (id);

UPDATE ai_models SET input_price_per_1m = 0.2000, cached_input_price_per_1m = 0.0200, output_price_per_1m = 1.2000 WHERE code = 'gpt-5.6-luna';
UPDATE ai_models SET input_price_per_1m = 2.0000, cached_input_price_per_1m = 0.2000, output_price_per_1m = 12.0000 WHERE code = 'gpt-5.6-terra';
UPDATE ai_models SET input_price_per_1m = 4.0000, cached_input_price_per_1m = 0.4000, output_price_per_1m = 20.0000 WHERE code = 'gpt-5.6-sol';

INSERT INTO ai_models (provider_id, code, name, description, input_price_per_1m, cached_input_price_per_1m, output_price_per_1m, sort_order)
SELECT p.id, m.code, m.name, m.description, m.input_price, m.cached_price, m.output_price, m.sort_order
FROM ai_providers p
JOIN (
    SELECT 'claude-haiku-5-5' AS code, 'Claude Haiku 5.5' AS name, 'Fast, cost-effective' AS description, 0.1000 AS input_price, 0.0100 AS cached_price, 0.5000 AS output_price, 110 AS sort_order
    UNION ALL SELECT 'claude-sonnet-5-5', 'Claude Sonnet 5.5', 'Balanced, recommended', 2.0000, 0.1000, 10.0000, 120
    UNION ALL SELECT 'claude-opus-5-5', 'Claude Opus 5.5', 'Flagship, complex cases', 4.0000, 0.2000, 20.0000, 130
) m
WHERE p.code = 'anthropic';

UPDATE ai_usage_logs l
JOIN ai_models m ON m.id = l.model_id
SET l.cost_usd = ROUND(
    ((l.input_tokens - l.cached_input_tokens) * m.input_price_per_1m
     + l.cached_input_tokens * COALESCE(m.cached_input_price_per_1m, m.input_price_per_1m)
     + l.output_tokens * m.output_price_per_1m) / 1000000, 6)
WHERE l.cost_usd IS NULL
  AND m.input_price_per_1m IS NOT NULL
  AND m.output_price_per_1m IS NOT NULL;
