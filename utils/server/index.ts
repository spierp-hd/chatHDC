import { Message } from '@/types/chat';
import { OpenAIModel } from '@/types/openai';

import { AZURE_DEPLOYMENT_ID, OPENAI_API_HOST, OPENAI_API_TYPE, OPENAI_API_VERSION, OPENAI_ORGANIZATION } from '../app/const';

import {
  ParsedEvent,
  ReconnectInterval,
  createParser,
} from 'eventsource-parser';

export class OpenAIError extends Error {
  type: string;
  param: string;
  code: string;

  constructor(message: string, type: string, param: string, code: string) {
    super(message);
    this.name = 'OpenAIError';
    this.type = type;
    this.param = param;
    this.code = code;
  }
}

export const OpenAIStream = async (
  model: OpenAIModel,
  systemPrompt: string,
  temperature: number,
  key: string,
  messages: Message[],
) => {
  let url = `${OPENAI_API_HOST}/v1/chat/completions`;
  if (OPENAI_API_TYPE === 'azure') {
    url = `${OPENAI_API_HOST}/openai/deployments/${AZURE_DEPLOYMENT_ID}/chat/completions?api-version=${OPENAI_API_VERSION}`;
  }

  // Logging the API Endpoint
  console.log(`[OpenAIStream] API Endpoint: ${url}`);

  const headers = {
    'Content-Type': 'application/json',
    ...(OPENAI_API_TYPE === 'openai' && {
      Authorization: `Bearer ${key ? key : process.env.AZURE_OPENAI_API_KEY}`
    }),
    ...(OPENAI_API_TYPE === 'azure' && {
      'api-key': `${key ? key : process.env.AZURE_OPENAI_API_KEY}`
    }),
    ...((OPENAI_API_TYPE === 'openai' && OPENAI_ORGANIZATION) && {
      'OpenAI-Organization': OPENAI_ORGANIZATION,
    }),
  };

  // Logging Request Headers
  console.log(`[OpenAIStream] Request Headers:`, headers);

  const body = {
    ...(OPENAI_API_TYPE === 'openai' && { model: model.id }),
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...messages,
    ],
    max_tokens: 1000,
    temperature: temperature,
    stream: true,
  };

  // Logging Request Body
  console.log(`[OpenAIStream] Request Body:`, body);

  const res = await fetch(url, {
    headers: headers,
    method: 'POST',
    body: JSON.stringify(body),
  });

  // Logging Response Status
  console.log(`[OpenAIStream] Response Status: ${res.status}`);

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  if (res.status !== 200) {
    const result = await res.json();
    // Logging Response Body in case of an error
    console.error(`[OpenAIStream] API Error Response:`, result);

    if (result.error) {
      throw new OpenAIError(
        result.error.message,
        result.error.type,
        result.error.param,
        result.error.code,
      );
    } else {
      throw new Error(
        `OpenAI API returned an error: ${
          decoder.decode(result?.value) || result.statusText
        }`,
      );
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const onParse = (event: ParsedEvent | ReconnectInterval) => {
        if (event.type === 'event') {
          const data = event.data;

          try {
            const json = JSON.parse(data);
            if (json.choices[0].finish_reason != null) {
              controller.close();
              return;
            }
            const text = json.choices[0].delta.content;
            const queue = encoder.encode(text);
            controller.enqueue(queue);
          } catch (e) {
            controller.error(e);
          }
        }
      };

      const parser = createParser(onParse);

      for await (const chunk of res.body as any) {
        parser.feed(decoder.decode(chunk));
      }
    },
  });

  return stream;
};
