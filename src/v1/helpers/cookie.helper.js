import config from "../configs/env.config.js";

export const REFRESH_COOKIE = "firmli_refresh";

// httpOnly: page scripts cannot read it, so an XSS cannot steal it. Sent only to /v1/auth (refresh, logout, switch back)
const refreshCookieOptions = () => ({
    httpOnly: true,
    secure: config.session.cookie.secure,
    sameSite: config.session.cookie.sameSite,
    domain: config.session.cookie.domain,
    path: "/v1/auth",
});

/**
 * The refresh token cookie of a session. The token itself is never in a response body.
 */
const cookieHelper = {
    setRefresh: (res, refreshToken, expiresAt) => res.cookie(REFRESH_COOKIE, refreshToken, {...refreshCookieOptions(), expires: expiresAt}),

    clearRefresh: (res) => res.clearCookie(REFRESH_COOKIE, refreshCookieOptions()),

    // The refresh token the browser sent, or null
    readRefresh: (req) => {
        for (const part of (req.get("Cookie") ?? "").split(";")) {
            const [name, ...value] = part.trim().split("=");
            if (name === REFRESH_COOKIE) return decodeURIComponent(value.join("=")) || null;
        }
        return null;
    },
};

export default cookieHelper;
