import { createLocalAiService, AiInputError } from './local-ai-tools.js';
import {
  TravelInputError,
  normalizeTravelMessage,
  needsTravelRoute,
} from './travel-input.js';
const service = createLocalAiService();
export function askLocalAi(message, area, base, choice) {
  // Compatibility helper has no conversation token; only the HTTP service can reuse context.
  if (needsTravelRoute(normalizeTravelMessage(message)))
    return Promise.resolve({
      answer: 'Skriv hela resan med från, till, datum och klockslag.',
      needsClarification: true,
    });
  const network = /^Sverige:/i.test(message)
    ? 'Hela Sverige'
    : /^SL:/i.test(message)
      ? 'SL'
      : 'Västtrafik';
  return service.ask(
    {
      message,
      area: area && Object.keys(area).length ? area : undefined,
      choice,
      network,
    },
    base,
  );
}
export function localAiPlugin() {
  const install = (server) => {
    server.middlewares.use('/api/local-ai', async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end('{}');
        return;
      }
      if (
        !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')
      ) {
        res.statusCode = 415;
        res.end(JSON.stringify({ error: 'Använd application/json.' }));
        return;
      }
      try {
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 16000)
            throw new AiInputError('För långt meddelande', 413);
        }
        const { message, area, choice, network, conversationId } =
          JSON.parse(raw);
        if (
          typeof message !== 'string' ||
          !message.trim() ||
          message.length > 2000
        )
          throw new AiInputError('Skriv ett kort meddelande');
        res.end(
          JSON.stringify(
            await service.ask(
              { message, area, choice, network, conversationId },
              `http://127.0.0.1:${server.config.server.port || 4173}`,
            ),
          ),
        );
      } catch (e) {
        if (e instanceof TravelInputError) {
          res.statusCode = 200;
          res.end(
            JSON.stringify({ answer: e.message, needsClarification: true }),
          );
          return;
        }
        res.statusCode =
          e instanceof AiInputError
            ? e.status
            : e instanceof SyntaxError
              ? 400
              : 502;
        res.end(
          JSON.stringify({
            error:
              e instanceof AiInputError
                ? e.message
                : 'Begäran kunde inte behandlas.',
          }),
        );
      }
    });
  };
  return {
    name: 'bionic-local-ai',
    configureServer: install,
    configurePreviewServer: install,
  };
}
