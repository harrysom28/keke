/**
 * Production-ready logger utility for mobile app
 * Only logs in development mode, silent in production
 */

const isDev = __DEV__;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogData {
  [key: string]: any;
}

class Logger {
  private shouldLog(level: LogLevel): boolean {
    // In production, only log errors
    if (!isDev && level !== 'error') {
      return false;
    }
    return true;
  }

  private formatMessage(level: LogLevel, message: string, data?: LogData): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    if (data && Object.keys(data).length > 0) {
      try {
        return `${prefix} ${message} ${JSON.stringify(data, null, 2)}`;
      } catch {
        return `${prefix} ${message} [Data not serializable]`;
      }
    }
    return `${prefix} ${message}`;
  }

  debug(message: string, data?: LogData): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, data));
    }
  }

  info(message: string, data?: LogData): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, data));
    }
  }

  warn(message: string, data?: LogData): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, data));
    }
  }

  error(message: string, error?: Error | any, data?: LogData): void {
    // Always log errors, even in production (but can be sent to crash reporting service)
    const errorData = {
      ...data,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : error,
    };
    
    console.error(this.formatMessage('error', message, errorData));
    
    // In production, send to crash reporting service (Sentry, etc.)
    // TODO: Integrate with Sentry or similar
    // if (!isDev && error) {
    //   Sentry.captureException(error, { extra: data });
    // }
  }
}

export const logger = new Logger();
export default logger;
