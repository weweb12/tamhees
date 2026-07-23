import {
  McpLineFramer,
  McpSession,
  decodeMcpLine,
  parseErrorLine,
  type McpFrame,
} from './protocol.js';
import { createMcpTools } from './tools.js';

export async function runMcpStdio(projectDir: string): Promise<void> {
  const session = new McpSession(createMcpTools(projectDir));
  const framer = new McpLineFramer();

  const processFrames = async (frames: readonly McpFrame[]): Promise<void> => {
    for (const frame of frames) {
      if ('error' in frame) {
        process.stdout.write(`${parseErrorLine()}\n`);
        continue;
      }
      const line = decodeMcpLine(frame.line);
      if (line === null) {
        if (frame.line.length > 0) process.stdout.write(`${parseErrorLine()}\n`);
        continue;
      }
      const response = await session.receiveLine(line);
      if (response !== null) process.stdout.write(`${response}\n`);
    }
  };

  for await (const value of process.stdin) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
    await processFrames(framer.push(chunk));
  }
  await processFrames(framer.finish());
}
