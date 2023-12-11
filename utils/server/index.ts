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

const appendMessagesUntilLimit = (messages: Message[], byteLimit=3500): string => {
    let accumulated = "";
    for (let i = messages.length - 1; i >= 0; i--) {
        const newMessage = messages[i].content;
        const testAccumulated = accumulated + (accumulated.length == 0 ? "" : "\n")  + newMessage;
        const byteLength = new TextEncoder().encode(testAccumulated).length;
        if (byteLength > byteLimit) {
            break;
        }
        accumulated = testAccumulated;
    }
    return accumulated;
}

export const OpenAIStream = async (
    messages: Message[],
) => {
    const url = `${QUERY_HOST}/api/query`;

    const messageBodies = appendMessagesUntilLimit(messages);
    const res = await fetch(url, {
        headers: {
            'Content-Type': 'application/json'
        },
        method: 'POST',
        body: JSON.stringify({
            query: messageBodies,
        }),
    });

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
    return new ReadableStream({
        start(controller) {
            try {
                const encoder = new TextEncoder();
                const queue = encoder.encode(result.answer);
                controller.enqueue(queue);
                controller.close();
            } catch (e) {
                controller.error(e);
            }
        }
    });
};
