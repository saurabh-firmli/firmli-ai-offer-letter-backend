/**
 * Marks Firmli's own tenant as the platform tenant: its users (Firmli staff) may switch to any client's user
 * from the app header. Run once per database, with the tenant's id or code:
 *
 *   npm run platform-tenant -- 1
 *   npm run platform-tenant -- FIRMLI
 *
 * Uses the database from the env file in the npm script (.env.development.local = local DB).
 * For another environment run it with that environment's env file.
 */
import {initDatabase, closeDatabase} from "../src/v1/utils/database.util.js";
import databaseModel from "../src/v1/utils/database.util.js";
import dbHelper from "../src/v1/helpers/db.helper.js";

const [idOrCode] = process.argv.slice(2);
if (!idOrCode) {
    console.error("Usage: npm run platform-tenant -- <tenant id or code>");
    process.exit(1);
}

await initDatabase();

try {
    const tenant = await dbHelper.selectOne(
        "SELECT id, name FROM tenants WHERE (id = :id OR code = :code) AND deleted_at IS NULL",
        {id: Number(idOrCode) || 0, code: idOrCode.toUpperCase()}
    );
    if (!tenant) {
        console.error(`No tenant with id or code ${idOrCode}.`);
        process.exitCode = 1;
    } else {
        await databaseModel.tenant.update({isPlatform: true}, {where: {id: tenant.id}});
        const platform = await dbHelper.select("SELECT id, name FROM tenants WHERE is_platform = 1 AND deleted_at IS NULL ORDER BY id");
        console.log(`Tenant #${tenant.id} "${tenant.name}" is a platform tenant. Platform tenants now: ${platform.map((t) => `#${t.id} ${t.name}`).join(", ")}.`);
    }
} finally {
    await closeDatabase();
}
