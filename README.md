# Firmli AI Offer Letter - Backend

       BASE_URL: http://localhost:5000/v1/
       HEALTH:   http://localhost:5000/v1/health

#### Initialization

        Step 1: npm i
        Step 2: copy .env.example to .env.development.local and fill values
        Step 3: run database/schema.sql on an empty database (see database/README.md)
        Step 4: npm run seed:locations   -- fills countries / states / cities (safe to run again)
        Step 5: npm run staging

#### Tenants and users

        Each client company is a tenant. There is no signup: create the tenant and its first user (a Super Admin) with

            npm run create-tenant -- "Edde Global" "Admin Name" admin@yopmail.com "TempPassword123" EDDE

        The last argument is the institution code (optional, unique, read only in the app). The tenant
        also gets its default settings (Settings page).

        The Super Admin logs in and adds the company's other users (POST /v1/users).
        The npm script uses .env.development.local (local DB); for another environment run
        dotenvx run --env-file=<that env file> -- node ./scripts/create-tenant.js ...

#### Tests

        npm test                  -- quick, no database: rules, validation, login checks, PDF / email layout
        npm run test:db           -- the whole API on a real database: tenant, users, roles, programs,
                                     applications, AI assessment, review, letters, emails, settings.
                                     Each test file makes its own database firmli_test_... on the local
                                     MySQL and drops it at the end; no real email or AI call
        npm run test:db -- applications    -- only test/db/applications.flow.js
        npm run test:db -- --keep          -- keep the test databases to look at the data

        test:db once per local MySQL: let the app's user create the test databases (see database/README.md)

#### Adding a new module

        0. database/migrations/00N_xyz.sql + same change in database/schema.sql (see database/README.md)
           Tenant owned table: tenant_id INT NOT NULL + FK to tenants, and unique keys start with tenant_id
        1. models/client/xyz.model.js    -- auto-loaded on boot when FIRMLI_DB_HOST is set
        2. services/xyz.service.js       -- DB access, written as one object: const xyzService = {...};
                                            its own helpers are methods of it too (xyzService.toResponse).
                                            SELECTs are raw SQL via dbHelper.select / selectOne /
                                            selectOneOrFail (helpers/db.helper.js) with :named values;
                                            create / update / destroy use the model (databaseModel.xyz).
                                            Every query filters on tenant_id, every create sets it
        3. controllers/xyz.controller.js -- wrap handlers in asyncHandler, reply via responseHelper
        4. routes/xyz.route.js           -- express.Router() with the routes
        5. mount it in firmliOfferLetterApp.js: app.use("/v1/xyz", xyzRouter)

#### Project Structure

    /bin
        www -- starts the server
    /scripts
        create-tenant.js
        seed-locations.js
    /database      -- schema.sql + numbered migrations
    /src
        /v1
            /configs       -- env.config.js (all env vars, validated on boot)
            /constants
            /controllers
            /helpers
            /middlewares
            /models/client
            /routes
            /schemas/validations
            /services
            /utils
            firmliOfferLetterApp.js

#### Conventions

        Env:        read config from configs/env.config.js, never process.env directly.
        Validation: router.post("/", validate(xyzValidation.create), controller.create)   -- 422 on failure
                    one object per file: const xyzValidation = {create, update, list}; export default xyzValidation
                    shared pieces (idParam, createSchema, updateSchema, optionalText...) in commonValidation
        Delete:     soft only. Models are paranoid (destroy sets deleted_at), every raw SELECT filters
                    deleted_at IS NULL, and "still in use" is checked with dbHelper.assertUnused before deleting
        Helpers:    one object per file, like services: const dbHelper = {...}; export default dbHelper
        Errors:     throw ApiError.of(HTTP_RESPONSES.HTTP_NOT_FOUND, "Xyz not found")   (utils/ApiError.js)
                    field errors (422): throw ApiError.validation({cityId: "City not found"})
        Auth:       app.use("/v1/xyz", authenticate, xyzRouter) in firmliOfferLetterApp.js -- 401 without
                    a valid token. req.user is the logged in user: pass req.user.tenantId to services.
                    Permissions: app.use("/v1/xyz", authenticate, authorize(MODULES.XYZ), xyzRouter) -- the role needs
                    read / create / update / delete on the module for GET / POST / PATCH+PUT / DELETE, else 403.
                    A new module = a row in modules + role_module_permissions rows (migration) + MODULES constant
                    role_module_permissions are the defaults; a tenant's Super Admin can change them for that
                    tenant (tenant_role_permissions, PUT /v1/roles/:id/permissions). Read the effective ones with
                    roleService.permissionsOf(roleId, tenantId), never role_module_permissions directly
        Audit log:  automatic -- create / update / destroy of the models in constants/audit.constants.js
                    (AUDITED_MODELS) are logged to audit_logs by helpers/audit.helper.js (Sequelize hooks,
                    same transaction). A new tenant owned model: add it to AUDITED_MODELS, nothing else.
                    Writes must go through the models (never raw INSERT / UPDATE) or they are not logged.
        Files:      uploads go to S3 through helpers/storage.helper.js (S3_BUCKET, AWS_* in the env file;
                    S3_ENDPOINT only for MinIO / S3-compatible storage). The bucket stays private: files
                    are downloaded through short-lived signed links the API hands out after its checks.
                    Multipart uploads: middlewares/upload.middleware.js (PDF / DOCX / JPG / PNG, 10 MB)
        Email:      await emailHelper.send({to, subject, html, text, replyTo}) (helpers/email.helper.js, SMTP_* in
                    the env file; 503 when not configured, 502 when the server refuses). Put each email's content
                    in src/v1/emails/<area>.email.js as an object of builders returning {subject, html, text},
                    and pass every user / database value through emailHelper.escape before it goes into HTML
        Logging:    import logger from utils/logger.util.js (not console.*); inside a request use req.log

Happy Coding :-)
