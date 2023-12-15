import {IconClearAll, IconSettings} from '@tabler/icons-react';
import {memo, MutableRefObject, useCallback, useContext, useEffect, useRef, useState,} from 'react';
import toast from 'react-hot-toast';
import Image from 'next/image';
import logoImage from "/public/DS_WISER_Logo_RZ-RGB-1-Colors.png"; // Update the path accordingly
import logoImage2 from "/public/HSG_logo.png"; // Update the path accordingly

import {useTranslation} from 'next-i18next';

import {getEndpoint} from '@/utils/app/api';
import {saveConversation, saveConversations, updateConversation,} from '@/utils/app/conversation';
import {throttle} from '@/utils/data/throttle';

import {ChatBody, Conversation, Message} from '@/types/chat';

import HomeContext from '@/pages/api/home/home.context';
import {ChatInput} from './ChatInput';
import {ChatLoader} from './ChatLoader';
import {MemoizedChatMessage} from './MemoizedChatMessage';

interface Props {
    stopConversationRef: MutableRefObject<boolean>;
}

export const Chat = memo(({stopConversationRef}: Props) => {
    const {t} = useTranslation('chat');

    const {
        state: {
            selectedConversation,
            conversations,
            loading
        },
        handleUpdateConversation,
        dispatch: homeDispatch,
    } = useContext(HomeContext);

    const [currentMessage, setCurrentMessage] = useState<Message>();
    const [autoScrollEnabled, setAutoScrollEnabled] = useState<boolean>(true);
    const [showSettings, setShowSettings] = useState<boolean>(false);
    const [showScrollDownButton, setShowScrollDownButton] =
        useState<boolean>(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSend = useCallback(
        async (message: Message, deleteCount = 0) => {
            if (selectedConversation) {
                let updatedConversation: Conversation;
                if (deleteCount) {
                    const updatedMessages = [...selectedConversation.messages];
                    for (let i = 0; i < deleteCount; i++) {
                        updatedMessages.pop();
                    }
                    updatedConversation = {
                        ...selectedConversation,
                        messages: [...updatedMessages, message],
                    };
                } else {
                    updatedConversation = {
                        ...selectedConversation,
                        messages: [...selectedConversation.messages, message],
                    };
                }
                homeDispatch({
                    field: 'selectedConversation',
                    value: updatedConversation,
                });
                homeDispatch({field: 'loading', value: true});
                homeDispatch({field: 'messageIsStreaming', value: true});
                let toSend: Message[] = []
                if (updatedConversation.messages.length > 0) {
                    const last = updatedConversation.messages.pop() as Message
                    toSend.push(last)
                }
                const chatBody: ChatBody = {
                    messages: toSend,
                };
                const endpoint = getEndpoint();
                let body;
                body = JSON.stringify(chatBody);
                const controller = new AbortController();
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    signal: controller.signal,
                    body,
                });
                if (!response.ok) {
                    homeDispatch({field: 'loading', value: false});
                    homeDispatch({field: 'messageIsStreaming', value: false});
                    toast.error(response.statusText);
                    return;
                }
                console.log(response)
                const data = response.body;
                console.log(data)
                if (!data) {
                    homeDispatch({field: 'loading', value: false});
                    homeDispatch({field: 'messageIsStreaming', value: false});
                    return;
                }
                if (updatedConversation.messages.length === 1) {
                    const {content} = message;
                    const customName =
                        content.length > 30 ? content.substring(0, 30) + '...' : content;
                    updatedConversation = {
                        ...updatedConversation,
                        name: customName,
                    };
                }
                homeDispatch({field: 'loading', value: false});
                const reader = data.getReader();
                const decoder = new TextDecoder();
                let done = false;
                let isFirst = true;
                let text = '';
                while (!done) {
                    if (stopConversationRef.current === true) {
                        controller.abort();
                        done = true;
                        break;
                    }
                    const {value, done: doneReading} = await reader.read();
                    done = doneReading;
                    const chunkValue = decoder.decode(value);
                    console.log(chunkValue.toString())
                    text += chunkValue;
                    if (isFirst) {
                        isFirst = false;
                        const updatedMessages: Message[] = [
                            ...updatedConversation.messages,
                            {role: 'assistant', content: chunkValue},
                        ];
                        updatedConversation = {
                            ...updatedConversation,
                            messages: updatedMessages,
                        };
                        homeDispatch({
                            field: 'selectedConversation',
                            value: updatedConversation,
                        });
                    } else {
                        const updatedMessages: Message[] =
                            updatedConversation.messages.map((message, index) => {
                                if (index === updatedConversation.messages.length - 1) {
                                    return {
                                        ...message,
                                        content: text,
                                    };
                                }
                                return message;
                            });
                        updatedConversation = {
                            ...updatedConversation,
                            messages: updatedMessages,
                        };
                        homeDispatch({
                            field: 'selectedConversation',
                            value: updatedConversation,
                        });
                    }
                }
                saveConversation(updatedConversation);
                const updatedConversations: Conversation[] = conversations.map(
                    (conversation) => {
                        if (conversation.id === selectedConversation.id) {
                            return updatedConversation;
                        }
                        return conversation;
                    },
                );
                if (updatedConversations.length === 0) {
                    updatedConversations.push(updatedConversation);
                }
                homeDispatch({field: 'conversations', value: updatedConversations});
                saveConversations(updatedConversations);
                homeDispatch({field: 'messageIsStreaming', value: false});
            }
        },
        [
            conversations,
            selectedConversation,
            stopConversationRef,
        ],
    );

    const scrollToBottom = useCallback(() => {
        if (autoScrollEnabled) {
            messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
            textareaRef.current?.focus();
        }
    }, [autoScrollEnabled]);

    const handleScroll = () => {
        if (chatContainerRef.current) {
            const {scrollTop, scrollHeight, clientHeight} =
                chatContainerRef.current;
            const bottomTolerance = 30;

            if (scrollTop + clientHeight < scrollHeight - bottomTolerance) {
                setAutoScrollEnabled(false);
                setShowScrollDownButton(true);
            } else {
                setAutoScrollEnabled(true);
                setShowScrollDownButton(false);
            }
        }
    };

    const handleScrollDown = () => {
        chatContainerRef.current?.scrollTo({
            top: chatContainerRef.current.scrollHeight,
            behavior: 'smooth',
        });
    };

    const handleSettings = () => {
        setShowSettings(!showSettings);
    };

    const onClearAll = () => {
        if (
            confirm(t<string>('Are you sure you want to clear all messages?')) &&
            selectedConversation
        ) {
            handleUpdateConversation(selectedConversation, {
                key: 'messages',
                value: [],
            });
        }
    };

    const scrollDown = () => {
        if (autoScrollEnabled) {
            messagesEndRef.current?.scrollIntoView(true);
        }
    };
    const throttledScrollDown = throttle(scrollDown, 250);

    useEffect(() => {
        throttledScrollDown();
        selectedConversation &&
        setCurrentMessage(
            selectedConversation.messages[selectedConversation.messages.length - 2],
        );
    }, [selectedConversation, throttledScrollDown]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                setAutoScrollEnabled(entry.isIntersecting);
                if (entry.isIntersecting) {
                    textareaRef.current?.focus();
                }
            },
            {
                root: null,
                threshold: 0.5,
            },
        );
        const messagesEndElement = messagesEndRef.current;
        if (messagesEndElement) {
            observer.observe(messagesEndElement);
        }
        return () => {
            if (messagesEndElement) {
                observer.unobserve(messagesEndElement);
            }
        };
    }, [messagesEndRef]);

    return (
        <div className="relative flex-1 overflow-hidden bg-white dark:bg-[#343541]">
            <>
                <div
                    className="max-h-full overflow-x-hidden"
                    ref={chatContainerRef}
                    onScroll={handleScroll}
                >
                    {selectedConversation?.messages.length === 0 ? (
                        <>
                            <div
                                className="mx-auto flex flex-col space-y-5 md:space-y-10 px-3 pt-5 md:pt-12 sm:max-w-[600px]">
                                <div className="text-center text-3xl font-semibold text-gray-800 dark:text-gray-100">
                                    {'EcoBot UI'}
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div
                                className="sticky top-0 z-10 flex justify-center border border-b-neutral-300 bg-neutral-100 py-2 text-sm text-neutral-500 dark:border-none dark:bg-[#444654] dark:text-neutral-200">
                                <button
                                    className="ml-2 cursor-pointer hover:opacity-50"
                                    onClick={handleSettings}
                                >
                                    <IconSettings size={18}/>
                                </button>
                                <button
                                    className="ml-2 cursor-pointer hover:opacity-50"
                                    onClick={onClearAll}
                                >
                                    <IconClearAll size={18}/>
                                </button>
                            </div>

                            {selectedConversation?.messages.map((message, index) => (
                                <MemoizedChatMessage
                                    key={index}
                                    message={message}
                                    messageIndex={index}
                                    onEdit={(editedMessage) => {
                                        setCurrentMessage(editedMessage);
                                        // discard edited message and the ones that come after then resend
                                        handleSend(
                                            editedMessage,
                                            selectedConversation?.messages.length - index,
                                        );
                                        console.log("4", selectedConversation)
                                    }}
                                />
                            ))}

                            {loading && <ChatLoader/>}

                            <div
                                className="h-[162px] bg-white dark:bg-[#343541]"
                                ref={messagesEndRef}
                            />
                        </>
                    )}
                </div>

                <ChatInput
                    stopConversationRef={stopConversationRef}
                    textareaRef={textareaRef}
                    onSend={(message) => {
                        setCurrentMessage(message);
                        handleSend(message, 0);
                    }}
                    onScrollDownClick={handleScrollDown}
                    onRegenerate={() => {
                        if (currentMessage) {
                            handleSend(currentMessage, 2);
                        }
                    }}
                    showScrollDownButton={showScrollDownButton}
                />
            </>
            {/* Logos at the bottom left */}
            <div className="absolute bottom-0 left-0 p-4 flex flex-col items-start" style={{ paddingBottom: '20px' }}>
                <Image src={logoImage2} alt="Logo" width={100} height={100} />
            </div>
            <div className="absolute bottom-0 right-0 p-4 flex flex-col items-start" style={{ paddingBottom: '30px' }}>
                <Image src={logoImage} alt="Logo" width={200} height={200} />
            </div>
        </div>
    );
});
Chat.displayName = 'Chat';
