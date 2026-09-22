import {z} from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Random per-boot fallback so a dev box without COOKIE_SECRET set still gets a
// usable (if session-losing-on-restart) secret instead of a hard failure.
// superRefine below turns the same absence into a fatal error in production.
const randomCookieSecret = () => crypto.randomUUID() + crypto.randomUUID();

const envSchema = z.object({
    DB_HOST: z.string().default('localhost'),
    DB_PORT: z.string().regex(/^\d+$/).default('5432'),
    DB_NAME: z.string().default('mindustry_stats'),
    DB_USER: z.string().default('postgres'),
    DB_PASSWORD: z.string(),
    PORT: z.string().regex(/^\d+$/).default('3000'),
    NODE_ENV: z.string().default('development'),
    LOG_LEVEL: z.string().default('info'),
    LOG_DIR: z.string().default('./logs'),

    // Discord OAuth + sessions (F0/F1). Login stays disabled (F1 answers 503)
    // until DISCORD_CLIENT_ID/SECRET are both set.
    SITE_ORIGIN: z.string().url().default('http://localhost:3000')
        .transform((origin) => origin.replace(/\/+$/, '')),
    DISCORD_CLIENT_ID: z.string().optional(),
    DISCORD_CLIENT_SECRET: z.string().optional(),
    COOKIE_SECRET: z.string().min(32).optional(),
    ADMIN_DISCORD_IDS: z.string().default('')
        .transform((raw) => raw.split(',').map((id) => id.trim()).filter((id) => id.length > 0))
        .pipe(z.array(z.string().regex(/^\d{1,32}$/))),

    // Second (user-content) DB connection. Falls back to DB_USER/DB_PASSWORD
    // when unset -- see userDatabase.ts, which warns that the role split is
    // then not enforced.
    USERDB_USER: z.string().optional(),
    USERDB_PASSWORD: z.string().optional(),

    UPLOAD_DIR: z.string().default('./uploads')
}).superRefine((data, ctx) => {
    if (!data.COOKIE_SECRET && data.NODE_ENV === 'production') {
        ctx.addIssue({
            code: 'custom',
            path: ['COOKIE_SECRET'],
            message: 'COOKIE_SECRET is required in production (32+ chars)'
        });
    }
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
    console.error('Invalid environment variables:', parsedEnv.error.format());
    process.exit(1);
}

const data = parsedEnv.data;

if (!data.COOKIE_SECRET) {
    console.warn('[env] COOKIE_SECRET is not set; using a random per-boot value. Sessions will not survive a restart.');
}

export const env = {
    ...data,
    COOKIE_SECRET: data.COOKIE_SECRET ?? randomCookieSecret()
};