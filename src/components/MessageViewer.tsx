import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiBridge } from '../api/bridge';
import { Inbox, RefreshCw, Clock, Key, FileText, Hash } from 'lucide-react';

interface KafkaMessage {
    partition: number;
    offset: number;
    timestamp: number | null;
    key: string | null;
    payload: string | null;
}

interface MessageViewerProps {
    selectedClusterId: string | null;
    topic: string;
    theme?: 'light' | 'dark';
}

export function MessageViewer({ selectedClusterId, topic, theme: _theme = 'dark' }: MessageViewerProps) {
    const [maxMessages, setMaxMessages] = useState(50);
    const [selectedMessage, setSelectedMessage] = useState<KafkaMessage | null>(null);

    const { data: messages, isLoading, error, refetch } = useQuery<KafkaMessage[]>({
        queryKey: ['messages', selectedClusterId, topic, maxMessages],
        queryFn: async () => {
            if (!selectedClusterId || !topic) return [];
            return await apiBridge<KafkaMessage[]>('consume_messages', {
                clusterId: selectedClusterId,
                topic,
                maxMessages,
            });
        },
        enabled: !!selectedClusterId && !!topic,
        refetchOnWindowFocus: false,
    });

    const formatTimestamp = (ts: number | null) => {
        if (!ts) return 'N/A';
        return new Date(ts).toLocaleString();
    };

    const formatPayload = (payload: string | null) => {
        if (!payload) return '';
        try {
            return JSON.stringify(JSON.parse(payload), null, 2);
        } catch {
            return payload;
        }
    };

    if (!topic) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500">
                <Inbox size={48} className="mb-4 opacity-50" />
                <p className="text-lg font-medium">Select a topic to view messages</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-950 overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-900 bg-slate-50/50 dark:bg-slate-950/50 backdrop-blur-md flex justify-between items-center shrink-0">
                <div>
                    <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
                        <Inbox size={24} className="text-emerald-500" />
                        Message Viewer
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">
                        Viewing messages from <code className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-blue-600 dark:text-blue-400">{topic}</code>
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <select
                        value={maxMessages}
                        onChange={(e) => setMaxMessages(Number(e.target.value))}
                        className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
                    >
                        <option value={10}>10 messages</option>
                        <option value={25}>25 messages</option>
                        <option value={50}>50 messages</option>
                        <option value={100}>100 messages</option>
                    </select>
                    <button
                        onClick={() => refetch()}
                        disabled={isLoading}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-all"
                    >
                        <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Message List */}
                <div className="w-1/2 border-r border-slate-200 dark:border-slate-800 overflow-y-auto">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="w-8 h-8 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                        </div>
                    ) : error ? (
                        <div className="p-6 text-red-500 dark:text-red-400">
                            Error: {String(error)}
                        </div>
                    ) : messages?.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500">
                            <Inbox size={48} className="mb-4 opacity-50" />
                            <p>No messages found</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {messages?.map((msg) => (
                                <div
                                    key={`${msg.partition}-${msg.offset}`}
                                    onClick={() => setSelectedMessage(msg)}
                                    className={`p-4 cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-900 ${
                                        selectedMessage?.offset === msg.offset && selectedMessage?.partition === msg.partition
                                            ? 'bg-emerald-50 dark:bg-emerald-500/10 border-l-2 border-emerald-500'
                                            : ''
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs px-2 py-0.5 rounded font-mono">
                                                P{msg.partition}
                                            </span>
                                            <span className="text-slate-400 dark:text-slate-500 text-xs font-mono">
                                                #{msg.offset}
                                            </span>
                                        </div>
                                        <span className="text-slate-400 dark:text-slate-500 text-xs flex items-center gap-1">
                                            <Clock size={12} />
                                            {formatTimestamp(msg.timestamp)}
                                        </span>
                                    </div>
                                    {msg.key && (
                                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                                            <Key size={10} />
                                            {msg.key}
                                        </div>
                                    )}
                                    <p className="text-sm text-slate-700 dark:text-slate-300 truncate font-mono">
                                        {msg.payload?.slice(0, 100) || '<empty>'}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Message Detail */}
                <div className="w-1/2 overflow-y-auto bg-slate-50 dark:bg-slate-900/50">
                    {selectedMessage ? (
                        <div className="p-6">
                            <div className="mb-6">
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Message Details</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                                        <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                                            <Hash size={10} /> Partition
                                        </div>
                                        <div className="font-mono text-slate-900 dark:text-white">{selectedMessage.partition}</div>
                                    </div>
                                    <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                                        <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                                            <Hash size={10} /> Offset
                                        </div>
                                        <div className="font-mono text-slate-900 dark:text-white">{selectedMessage.offset}</div>
                                    </div>
                                    <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                                        <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                                            <Clock size={10} /> Timestamp
                                        </div>
                                        <div className="font-mono text-slate-900 dark:text-white text-sm">{formatTimestamp(selectedMessage.timestamp)}</div>
                                    </div>
                                    <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                                        <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                                            <Key size={10} /> Key
                                        </div>
                                        <div className="font-mono text-slate-900 dark:text-white text-sm">{selectedMessage.key || '<null>'}</div>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                                    <FileText size={14} /> Payload
                                </h4>
                                <pre className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700 overflow-x-auto text-sm font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-all">
                                    {formatPayload(selectedMessage.payload)}
                                </pre>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500">
                            <FileText size={48} className="mb-4 opacity-50" />
                            <p>Select a message to view details</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
