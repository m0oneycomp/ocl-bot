import fs from 'fs';
import path from 'path';

const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
const logFile = path.join(logDir, 'error.log');

export const logger = {
    error: (context: string, error: any) => {
        const timestamp = new Date().toISOString();
        const errMsg = error instanceof Error ? error.stack || error.message : String(error);
        const logString = `[${timestamp}] [${context}] ERROR:\n${errMsg}\n\n`;
        
        // Print to SSH Terminal in Red
        console.error(`\x1b[31m[${timestamp}] [${context}] ERROR:\x1b[0m`, errMsg);
        
        // Append to file for Discord download
        fs.appendFileSync(logFile, logString);
    }
};
