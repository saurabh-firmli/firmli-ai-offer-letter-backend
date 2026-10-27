/**
 * Creates a tenant (client company) with default settings and its first user, a Super Admin, like "New tenant" in the
 * Platform admin panel. There is no signup: the Firmli team does this once per client, then that admin adds the
 * client's other users through /v1/users.
 *
 *   npm run create-tenant -- "Edde Global" "Admin Name" admin@yopmail.com "TempPassword123" EDDE
 *
 * The last argument is the institution code (optional, unique, A-Z 0-9 -); it is read only in the app.
 *
 * Uses the database from the env file in the npm script (.env.development.local = local DB).
 * For another environment run it with that environment's env file.
 */
import {initDatabase, closeDatabase} from "../src/v1/utils/database.util.js";
import platformService from "../src/v1/services/platform.service.js";
import platformValidation from "../src/v1/schemas/validations/platform.validation.js";

const [name, adminName, adminEmail, adminPassword, code] = process.argv.slice(2);

// The same rules as "New tenant" in the Platform admin panel
const {error, value: input} = platformValidation.create.validate(
    {name, code, admin: {name: adminName, email: adminEmail, password: adminPassword}},
    {abortEarly: false}
);

if (error) {
    console.error(`${error.message}\n\nUsage: npm run create-tenant -- "<tenant name>" "<admin name>" <admin email> "<admin password>" [CODE]`);
    process.exit(1);
}

await initDatabase();

try {
    const tenant = await platformService.create(input);
    const admin = tenant.users[0];
    console.log(`Created tenant #${tenant.id} "${tenant.name}" with admin ${admin.email} (user #${admin.id}).`);
} catch (err) {
    console.error(err.message ?? err);
    process.exitCode = 1;
} finally {
    await closeDatabase();
}
