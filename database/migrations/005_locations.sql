-- 005: countries / states / cities master data, and campuses point at a city instead of a free-text
-- address. The tables are shared by all tenants and filled by `npm run seed:locations`.

CREATE TABLE countries (
    id              INT          NOT NULL AUTO_INCREMENT,
    name            VARCHAR(100) NOT NULL,
    iso2            CHAR(2)      NOT NULL,
    phone_code      VARCHAR(20)  NULL,
    currency_code   CHAR(3)      NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_countries_iso2 (iso2)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE states (
    id          INT          NOT NULL AUTO_INCREMENT,
    country_id  INT          NOT NULL,
    name        VARCHAR(100) NOT NULL,
    -- ISO 3166-2 subdivision code inside the country, e.g. PB for Punjab
    code        VARCHAR(10)  NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_states_country_code (country_id, code),
    CONSTRAINT fk_states_country FOREIGN KEY (country_id) REFERENCES countries (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cities (
    id          INT          NOT NULL AUTO_INCREMENT,
    state_id    INT          NOT NULL,
    name        VARCHAR(150) NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_cities_state_name (state_id, name),
    CONSTRAINT fk_cities_state FOREIGN KEY (state_id) REFERENCES states (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The same campus name may exist in another city, but not twice in one city of one tenant.
-- city_id stays NULL for campuses created before this migration until they are edited
-- (the address text cannot be turned into a city automatically); the API requires it from now on.
ALTER TABLE campuses
    ADD COLUMN city_id INT NULL AFTER name,
    ADD CONSTRAINT fk_campuses_city FOREIGN KEY (city_id) REFERENCES cities (id),
    DROP INDEX uq_campuses_tenant_name,
    ADD UNIQUE KEY uq_campuses_tenant_name_city (tenant_id, name, city_id),
    DROP COLUMN address;
