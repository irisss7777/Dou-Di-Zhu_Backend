import fs from 'fs';
import path from 'path';

const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const getLogFileName = (): string => {
    const now = new Date();
    const dateString = now.toISOString().split('T')[0]; // YYYY-MM-DD
    return `debug-${dateString}.log`;
};

const getCurrentTime = (): string => {
    return new Date().toISOString();
};

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

class Logger {
    private logFile: string;

    constructor() 
    {
        this.logFile = path.join(logsDir, getLogFileName());
    }
    
    private writeToLog(level: LogLevel, message: string, data?: any): void 
    {
        const timestamp = getCurrentTime();
        let logMessage = `[${timestamp}] ${level}: ${message}`;
        
        if (data) 
        {
            logMessage += ` | Data: ${JSON.stringify(data, null, 2)}`;
        }

        logMessage += '\n'; // Перенос строки
        
        fs.appendFile(this.logFile, logMessage, (err) => {
            if (err) {
                console.error('Log writing error:', err);
            }
        });
        
        console.log(logMessage);
    }
    
    public debug(message: string, data?: any): void 
    {
        this.writeToLog('DEBUG', message, data);
    }

    public info(message: string, data?: any): void 
    {
        this.writeToLog('INFO', message, data);
    }

    public warn(message: string, data?: any): void 
    {
        this.writeToLog('WARN', message, data);
    }

    public error(message: string, data?: any): void 
    {
        this.writeToLog('ERROR', message, data);
    }
    
    public getTodayLogs(): Promise<string> 
    {
        return new Promise((resolve, reject) => 
        {
            fs.readFile(this.logFile, 'utf8', (err, data) => 
            {
                if (err) 
                {
                    reject(err);
                } else 
                {
                    resolve(data);
                }
            });
        });
    }
}

export const logger = new Logger();