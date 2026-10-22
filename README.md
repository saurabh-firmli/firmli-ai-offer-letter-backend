# Firmli AI Offer Letter - Backend

       BASE_URL: http://localhost:3000/v1/
       HEALTH:   http://localhost:3000/v1/health

#### Initialization

        Step 1: npm i
        Step 2: copy .env.example to .env.development.local and fill values
        Step 3: npm run staging

#### Adding a new module

        1. models/client/xyz.model.js    -- auto-loaded on boot when FIRMLI_DB_HOST is set
        2. services/xyz.service.js       -- DB access (import databaseModel from utils/database.util.js)
        3. controllers/xyz.controller.js -- wrap handlers in asyncHandler, reply via responseHelper
        4. routes/xyz.route.js           -- express.Router() with the routes
        5. mount it in firmliOfferLetterApp.js: app.use("/v1/xyz", xyzRouter)

#### Project Structure

    /bin
        www -- starts the server
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
    /test

#### Conventions

        Env:        read config from configs/env.config.js, never process.env directly.
        Validation: router.post("/", validate(schema), controller.create)   -- 422 on failure
        Logging:    import logger from utils/logger.util.js (not console.*); inside a request use req.log
        Tests:      npm test   (node:test + supertest, files in test/*.test.js)

Happy Coding :-)
