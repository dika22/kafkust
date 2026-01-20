import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { Send, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ProducerLabProps {
    selectedClusterId: string | null;
    initialTopic?: string;
    onTopicChange?: (topic: string) => void;
    theme?: 'light' | 'dark';
}

export function ProducerLab({ selectedClusterId, initialTopic = '', onTopicChange, theme = 'dark' }: ProducerLabProps) {
    const [topic, setTopic] = useState(initialTopic);
    const [key, setKey] = useState('');
    const [payload, setPayload] = useState('{\n  "message": "Hello Kafka!"\n}');

    // Update local topic state if initialTopic prop changes
    useState(() => {
        if (initialTopic) setTopic(initialTopic);
    });

    const handleTopicChange = (newTopic: string) => {
        setTopic(newTopic);
        onTopicChange?.(newTopic);
    };

    const [status, setStatus] = useState<{ type: 'success' | 'error' | 'idle', message: string }>({ type: 'idle', message: '' });
    const [isPublishing, setIsPublishing] = useState(false);

    const handlePublish = async () => {
        if (!selectedClusterId || !topic || !payload) return;

        setIsPublishing(true);
        setStatus({ type: 'idle', message: '' });

        try {
            if (!selectedClusterId) throw new Error('No cluster selected. Please select a cluster in the sidebar.');
            await invoke('publish_message', {
                clusterId: selectedClusterId,
                topic,
                key: key || null,
                payload
            });
            setStatus({ type: 'success', message: `Message published to ${topic} successfully!` });
        } catch (error) {
            setStatus({ type: 'error', message: String(error) });
        } finally {
            setIsPublishing(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-950 overflow-hidden w-full transition-colors duration-200">
            {/* Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-900 bg-slate-50/50 dark:bg-slate-950/50 backdrop-blur-md flex justify-between items-center shrink-0">
                <div>
                    <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
                        <Send size={24} className="text-blue-500" />
                        Producer Lab
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">Compose and publish messages to your topics.</p>
                </div>
            </div>

            {/* Configuration Bar */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-900 bg-white dark:bg-slate-950 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex-1 flex items-center gap-4">
                        <div className="flex-1 max-w-xs">
                            <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
                                Target Topic
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. orders-stream"
                                value={topic}
                                onChange={(e) => handleTopicChange(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-all"
                            />
                        </div>
                        <div className="flex-1 max-w-xs">
                            <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
                                Message Key (Optional)
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. user-123"
                                value={key}
                                onChange={(e) => setKey(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-all"
                            />
                        </div>
                    </div>
                    <div className="flex items-end">
                        <button
                            onClick={handlePublish}
                            disabled={isPublishing || !selectedClusterId || !topic}
                            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-6 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                        >
                            {isPublishing ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Send size={16} />
                            )}
                            {isPublishing ? 'Publishing...' : 'Publish'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Editor - Full Width */}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0 w-full">
                <div className="flex-1 w-full bg-white dark:bg-[#1e1e1e]">
                    <Editor
                        height="100%"
                        width="100%"
                        defaultLanguage="json"
                        theme={theme === 'dark' ? 'vs-dark' : 'light'}
                        value={payload}
                        onChange={(value) => setPayload(value || '')}
                        options={{
                            minimap: { enabled: false },
                            fontSize: 14,
                            lineNumbers: 'on',
                            roundedSelection: true,
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            padding: { top: 20, bottom: 20 },
                            wordWrap: 'on',
                        }}
                    />
                </div>

                {/* Status Bar */}
                {status.type !== 'idle' && (
                    <div className={`px-6 py-3 flex items-center gap-3 border-t shrink-0 ${status.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                        }`}>
                        {status.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                        <span className="text-sm font-medium">{status.message}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
