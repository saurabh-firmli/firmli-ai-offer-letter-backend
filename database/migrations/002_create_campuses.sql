-- 002: campuses table; programs.campus (free text) is replaced by programs.campus_id

CREATE TABLE campuses (
    id          INT          NOT NULL AUTO_INCREMENT,
    name        VARCHAR(150) NOT NULL,
    address     VARCHAR(255) NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_campuses_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Campus names already typed on programs become campus rows
INSERT INTO campuses (name)
SELECT DISTINCT TRIM(campus) FROM programs WHERE campus IS NOT NULL AND TRIM(campus) <> '';

-- A campus used by a program cannot be deleted
ALTER TABLE programs
    ADD COLUMN campus_id INT NULL AFTER award_level,
    ADD CONSTRAINT fk_programs_campus FOREIGN KEY (campus_id) REFERENCES campuses (id);

UPDATE programs p
JOIN campuses c ON c.name = TRIM(p.campus)
SET p.campus_id = c.id;

ALTER TABLE programs DROP COLUMN campus;
