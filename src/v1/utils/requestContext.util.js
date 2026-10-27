import {AsyncLocalStorage} from "node:async_hooks";

const storage = new AsyncLocalStorage();

/**
 * Who is making the current request, available anywhere in the code that handles it (e.g. the
 * audit log hooks) without passing it through every function. Set by the authenticate middleware.
 */
const requestContext = {
    // Runs fn, and everything it awaits, with this context
    run: (context, fn) => storage.run(context, fn),

    // {user, requestId, ipAddress}, or {} outside a request (scripts, seeds)
    get: () => storage.getStore() ?? {},
};

export default requestContext;
