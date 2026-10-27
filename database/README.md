# Database SQL

    schema.sql        -- the full current schema (all migrations combined)
    migrations/
        001_create_programs.sql
        002_...sql

#### Rules

        Every DB change (new table, ALTER, index) = a new migration file with the next number:
                    migrations/002_add_intake_to_programs.sql
        Never edit a migration that has already been run anywhere; fix it with a new one.
        Soft delete: every table has deleted_at DATETIME NULL; rows are never removed. A table with a
                    unique key also gets
                        not_deleted TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL
                    as the last column of each unique key, so deleted rows never block a new one.
        Apply the same change to schema.sql (no comments in it: CREATE TABLE statements, plus the INSERTs
                    of small shared lists such as letter_variables).
        Shared lists: letter_variables, document_types and eligibility_categories rows are added by
                    migration (INSERT); countries / states / cities
                    come from npm run seed:locations.
        Update the Sequelize model in src/v1/models/client to match.

#### Running

        Fresh database:      run schema.sql only
        Existing database:   run the migrations it does not have yet, in order

        Local (Docker container firmli-mysql):
        docker exec -i firmli-mysql mysql -ufirmli -pfirmli_local firmli_offer_letter < database/migrations/001_create_programs.sql

#### Test databases (npm run test:db)

        Each test file makes its own database firmli_test_<run>_<pid> and drops it at the end. Once per
        local MySQL, let the app's user create and drop those (and nothing else):

        docker exec -i firmli-mysql mysql -uroot -proot -e "GRANT ALL PRIVILEGES ON \`firmli\_test\_%\`.* TO 'firmli'@'%';"
