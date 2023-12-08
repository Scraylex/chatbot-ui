import {Message} from '@/types/chat';

import {QUERY_HOST} from '../app/const';

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
  messages: Message[],
) => {
  let url = `${QUERY_HOST}/api/query`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'POST',
    body: JSON.stringify({
      query: messages.map(elem => elem.content).join("\n"),
    }),
  });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const result = await res.json();
  if (res.status !== 200) {
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
  return result;
};
