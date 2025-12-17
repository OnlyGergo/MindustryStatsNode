import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';
import {env} from './config/env.js';

// Create the logger instance
export const createLogger = (moduleName?: string) => winston.createLogger({
    level: env.LOG_LEVEL,
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.colorize(),
        winston.format.printf(info => {
            const base = `${info.timestamp} ${info.level}: ${moduleName ? `[${moduleName}] ` : ''}${info.message}`;
            return info.stack ? `${base}\n${info.stack}` : base;
        }),
        winston.format.errors({ stack: true }),
        winston.format.splat()
    ),
    transports: [
        // Console transport
        new winston.transports.Console(),

        // Rotating error log file
        new winston.transports.DailyRotateFile({
            filename: path.join(env.LOG_DIR, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            maxFiles: '30d', // Keep logs for 14 days
            maxSize: '20m',  // Rotate when file reaches 20MB
            format: winston.format.combine(
                winston.format.uncolorize()
            )
        }),

        // Rotating combined log file
        new winston.transports.DailyRotateFile({
            filename: path.join(env.LOG_DIR, '%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxFiles: '14d', // Keep logs for 14 days
            maxSize: '20m',  // Rotate when file reaches 20MB
            format: winston.format.combine(
                winston.format.uncolorize()
            )
        })
    ]
});
