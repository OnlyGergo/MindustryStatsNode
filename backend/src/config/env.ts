import {z} from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
    DB_HOST: z.string().default('localhost'),
    DB_PORT: z.string().regex(/^\d+$/).default('5432'),
    DB_NAME: z.string().default('mindustry_stats'),
    DB_USER: z.string().default('postgres'),
    DB_PASSWORD: z.string(),
    PORT: z.string().regex(/^\d+$/).default('3000'),
    NODE_ENV: z.string().default('development'),
    LOG_LEVEL: z.string().default('info'),
    LOG_DIR: z.string().default('./logs')
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
    console.error('Invalid environment variables:', parsedEnv.error.format());
    process.exit(1);
}

export const env = parsedEnv.data;