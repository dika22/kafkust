import { QueryClient, QueryClientProvider, useQuery, useMutation } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'
import { Database, Play, RefreshCw, Trash2, Plus, Server, Shield, HardDrive, Send, LayoutGrid, Sun, Moon } from 'lucide-react'
import { useState, useEffect } from 'react'
import { ProducerLab } from './components/ProducerLab'

const queryClient = new QueryClient()

interface Cluster {
  id: string;
  name: string;
  brokers: string;
  security: { type: string; config?: any };
}

interface Topic {
  name: string;
  partitions: number;
  replication_factor: number;
}

function Dashboard() {
  const [activeView, setActiveView] = useState<'topics' | 'producer'>('topics');
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [isAddingCluster, setIsAddingCluster] = useState(false);
  const [isCreatingTopic, setIsCreatingTopic] = useState(false);
  const [newCluster, setNewCluster] = useState({ name: '', brokers: '', username: '', password: '' });
  const [newTopic, setNewTopic] = useState({ name: '', partitions: 3, replication: 1 });
  const [targetTopic, setTargetTopic] = useState<string>('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'dark';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  // Fetch Clusters
  const { data: clusters, isLoading: isLoadingClusters, refetch: refetchClusters } = useQuery<Cluster[]>({
    queryKey: ['clusters'],
    queryFn: () => invoke<Cluster[]>('list_clusters'),
  })

  // Add Cluster Mutation
  const addClusterMutation = useMutation({
    mutationFn: async () => {
      const id = crypto.randomUUID();
      const cluster: Cluster = {
        id,
        name: newCluster.name,
        brokers: newCluster.brokers,
        security: newCluster.username ? {
          type: 'SaslSsl',
          config: { mechanism: 'Plain', username: newCluster.username }
        } : { type: 'Plaintext' }
      };

      return await invoke('add_cluster', {
        cluster,
        password: newCluster.password || null
      });
    },
    onSuccess: () => {
      refetchClusters();
      setIsAddingCluster(false);
      setNewCluster({ name: '', brokers: '', username: '', password: '' });
    },
  });

  // Create Topic Mutation
  const createTopicMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClusterId) return;
      return await invoke('create_topic', {
        clusterId: selectedClusterId,
        name: newTopic.name,
        partitions: Number(newTopic.partitions),
        replication: Number(newTopic.replication)
      });
    },
    onSuccess: () => {
      refetchTopics();
      setIsCreatingTopic(false);
      setNewTopic({ name: '', partitions: 3, replication: 1 });
    },
    onError: (error) => {
      console.error('Failed to create topic:', error);
    }
  });

  const deleteClusterMutation = useMutation({
    mutationFn: async (id: string) => {
      return await invoke('delete_cluster', { clusterId: id });
    },
    onSuccess: () => {
      refetchClusters();
      if (selectedClusterId) {
        setSelectedClusterId(null);
      }
    },
  });

  // Set default cluster if none selected
  useEffect(() => {
    if (clusters && clusters.length > 0) {
      if (!selectedClusterId) {
        console.log('Automatically selecting first cluster:', clusters[0].id);
        setSelectedClusterId(clusters[0].id);
      } else if (!clusters.find(c => c.id === selectedClusterId)) {
        console.log('Previous selected cluster gone, selecting first cluster:', clusters[0].id);
        setSelectedClusterId(clusters[0].id);
      }
    }
  }, [clusters, selectedClusterId]);

  // Fetch Topics for Selected Cluster
  const { data: topics, isLoading: isLoadingTopics, error: topicError, refetch: refetchTopics } = useQuery<Topic[]>({
    queryKey: ['topics', selectedClusterId],
    enabled: !!selectedClusterId,
    queryFn: async () => {
      if (!selectedClusterId) {
        console.warn('topics query ran without selectedClusterId');
        return [];
      }
      return await invoke<Topic[]>('list_topics', { clusterId: selectedClusterId });
    },
    placeholderData: (prev) => prev,
  })

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50 font-sans transition-colors duration-200">
      {/* Sidebar: Clusters */}
      <div className="w-16 border-r border-slate-200 dark:border-slate-900 bg-slate-50 dark:bg-slate-950 flex flex-col items-center py-4 gap-4 overflow-y-auto shrink-0 scrollbar-hide">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center mb-2 shadow-lg shadow-blue-500/20">
          <Database size={20} className="text-white" />
        </div>
        <div className="w-8 h-px bg-slate-200 dark:bg-slate-800 mb-2"></div>
        {isLoadingClusters ? (
          <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-800 border-t-blue-500 rounded-full animate-spin"></div>
        ) : clusters?.length === 0 ? (
          <div className="text-[10px] text-slate-500 font-bold text-center px-2">EMPTY</div>
        ) : clusters?.map(cluster => (
          <div className="relative group/btn">
            <button
              key={cluster.id}
              onClick={() => setSelectedClusterId(cluster.id)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${selectedClusterId === cluster.id
                ? 'bg-blue-600/10 dark:bg-slate-800 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900'
                }`}
              title={cluster.name}
            >
              <Server size={20} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('Delete this cluster?')) deleteClusterMutation.mutate(cluster.id);
              }}
              className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/btn:opacity-100 transition-opacity shadow-sm"
              title="Delete Cluster"
            >
              <Plus size={10} className="rotate-45" />
            </button>
          </div>
        ))}
        <div className="w-8 h-px bg-slate-200 dark:bg-slate-800 my-2"></div>
        <button
          onClick={() => setIsAddingCluster(true)}
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-all text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-600/10 dark:hover:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-800 hover:border-blue-500/30 group"
          title="Add New Cluster"
        >
          <Plus size={20} className="group-hover:scale-110 transition-transform" />
        </button>
      </div>

      {/* Workspace Sidebar */}
      <div className="w-60 border-r border-slate-200 dark:border-slate-900 flex flex-col bg-slate-50/50 dark:bg-slate-950/40 backdrop-blur-xl shrink-0 overflow-y-auto">
        <div className="p-5 border-b border-slate-200 dark:border-slate-900">
          <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
            {clusters?.find(c => c.id === selectedClusterId)?.name || 'Kafkust'}
          </h1>
          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest font-bold">
            {clusters?.find(c => c.id === selectedClusterId)?.brokers || 'No Connection'}
          </div>
        </div>

        <nav className="p-3 space-y-1 border-b border-slate-200 dark:border-slate-900">
          <button
            onClick={() => setActiveView('topics')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${activeView === 'topics' ? 'bg-blue-600/10 text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900'}`}
          >
            <LayoutGrid size={18} />
            Topics
          </button>
          <button
            onClick={() => setActiveView('producer')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${activeView === 'producer' ? 'bg-blue-600/10 text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900'}`}
          >
            <Send size={18} />
            Producer
          </button>
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
        </nav>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-900">
          <div className="bg-slate-100 dark:bg-slate-900/50 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
            <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-widest font-black">Cluster Health</div>
            {!selectedClusterId ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500 font-medium">
                <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700"></div>
                No Cluster Selected
              </div>
            ) : topicError ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm text-red-500 dark:text-red-400 font-medium">
                  <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
                  Connection Failed
                </div>
                <button
                  onClick={() => refetchTopics()}
                  className="text-[10px] text-left hover:underline text-blue-500 dark:text-blue-400 font-bold"
                >
                  Retry Connection
                </button>
              </div>
            ) : isLoadingTopics ? (
              <div className="flex items-center gap-2 text-sm text-blue-500 dark:text-blue-400 font-medium">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                Connecting...
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-green-500 dark:text-green-400 font-medium">
                <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                Active Connection
              </div>
            )}
          </div>
          {selectedClusterId && clusters && (
            <div className="mt-4 p-2 bg-slate-100 dark:bg-slate-900/30 rounded-xl border border-dotted border-slate-300 dark:border-slate-800">
              <div className="text-[9px] text-slate-400 font-bold uppercase mb-1">Raw Node ID</div>
              <div className="text-[10px] font-mono text-slate-500 truncate select-all">{selectedClusterId}</div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-slate-950 min-w-0 w-full">
        {activeView === 'topics' ? (
          <>
            <header className="h-16 border-b border-slate-200 dark:border-slate-900 flex items-center justify-between px-8 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-10 transition-colors">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Topics Explorer</h2>
                <span className="bg-slate-100 dark:bg-slate-900 h-6 px-2 flex items-center rounded-md text-[10px] font-bold text-slate-500 border border-slate-200 dark:border-slate-800 transition-colors">
                  {topics?.length || 0} TOTAL
                </span>
              </div>
              <div className="flex gap-4">
                <div className="relative group">
                  <input
                    type="text"
                    placeholder="Search topics..."
                    className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-1.5 text-sm focus:outline-none focus:border-blue-500/50 w-64 transition-all text-slate-900 dark:text-white"
                  />
                </div>
                <button
                  onClick={() => refetchTopics()}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-100 transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-800"
                >
                  <RefreshCw size={18} className={isLoadingTopics ? "animate-spin" : ""} />
                </button>
                <button
                  onClick={() => setIsCreatingTopic(true)}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-5 py-2 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-95 text-white"
                >
                  <Plus size={18} />
                  Create Topic
                </button>
              </div>
            </header>

            <main className="flex-1 overflow-auto p-8">
              {isLoadingTopics ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500">
                  <div className="relative">
                    <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                  </div>
                  <p className="font-medium animate-pulse">Syncing with Kafka cluster...</p>
                </div>
              ) : topicError ? (
                <div className="max-w-2xl mx-auto mt-12 bg-red-50 dark:bg-red-500/5 border border-red-200 dark:border-red-500/20 rounded-3xl p-8 text-center">
                  <div className="w-16 h-16 bg-red-100 dark:bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Shield className="text-red-500 dark:text-red-400" size={32} />
                  </div>
                  <h3 className="text-xl font-bold text-red-900 dark:text-red-100 mb-2">Connection Failed</h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-6 text-sm leading-relaxed">
                    Could not connect to Kafka broker at <code className="bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded text-red-700 dark:text-red-300 font-mono">{clusters?.find(c => c.id === selectedClusterId)?.brokers || 'localhost:9092'}</code>
                  </p>
                  <div className="bg-slate-50 dark:bg-slate-900/80 rounded-xl p-4 text-left font-mono text-xs text-red-600 dark:text-red-300 break-all border border-red-100 dark:border-red-500/10 mb-6 max-h-32 overflow-y-auto">
                    {topicError instanceof Error ? topicError.message : String(topicError)}
                  </div>
                  <button
                    onClick={() => refetchTopics()}
                    className="mb-8 bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-xl text-sm font-bold transition-all shadow-lg shadow-red-600/20 active:scale-95 flex items-center gap-2 mx-auto"
                  >
                    <RefreshCw size={16} className={isLoadingTopics ? "animate-spin" : ""} />
                    Retry Connection
                  </button>
                  <div className="text-sm text-slate-600 dark:text-slate-400 text-left space-y-2">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">Quick fix:</p>
                    <code className="block bg-slate-100 dark:bg-slate-900 px-3 py-2 rounded text-slate-700 dark:text-slate-300">docker run -d --name kafka -p 9092:9092 apache/kafka:latest</code>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {topics?.map((topic) => (
                    <div
                      key={topic.name}
                      onClick={() => {
                        setTargetTopic(topic.name);
                        setActiveView('producer');
                      }}
                      className="bg-white dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800/60 rounded-2xl p-5 hover:border-blue-500/30 transition-all hover:bg-slate-50 dark:hover:bg-slate-900/50 group relative overflow-hidden cursor-pointer active:scale-[0.98] shadow-sm hover:shadow-md dark:shadow-none"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none group-hover:bg-blue-500/10 transition-all"></div>

                      <div className="flex justify-between items-start mb-4 relative z-10">
                        <div className="bg-slate-100 dark:bg-slate-800/80 p-2.5 rounded-xl text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-slate-700/50 transition-colors">
                          <HardDrive size={20} />
                        </div>
                        <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all transform translate-y-1 group-hover:translate-y-0 text-slate-400">
                          <button className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg hover:text-slate-900 dark:hover:text-white transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700/50">
                            <Play size={14} />
                          </button>
                          <button className="p-2 hover:bg-red-500/10 dark:hover:bg-red-500/20 rounded-lg hover:text-red-600 dark:hover:text-red-400 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <h3 className="text-base font-bold truncate mb-2 text-slate-800 dark:text-slate-100 relative z-10 transition-colors">{topic.name}</h3>
                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-slate-400 dark:text-slate-500 font-bold uppercase relative z-10 transition-colors">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500/60"></span>
                          {topic.partitions} Partitions
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500/60"></span>
                          {topic.replication_factor} Replicas
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </main>
          </>
        ) : (
          <ProducerLab
            selectedClusterId={selectedClusterId}
            initialTopic={targetTopic}
            onTopicChange={setTargetTopic}
            theme={theme}
          />
        )}
      </div>

      {/* Add Cluster Modal */}
      {isAddingCluster && (
        <div className="fixed inset-0 bg-black/50 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-8 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">New Kafka Connection</h3>
                <p className="text-slate-500 text-sm mt-1">Configure your cluster access profile.</p>
              </div>
              <button
                onClick={() => setIsAddingCluster(false)}
                className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                <Plus className="rotate-45" size={24} />
              </button>
            </div>
            <div className="p-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Display Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Production Cluster"
                    value={newCluster.name}
                    onChange={(e) => setNewCluster({ ...newCluster, name: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 text-slate-900 dark:text-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Brokers URL</label>
                  <input
                    type="text"
                    placeholder="localhost:9092"
                    value={newCluster.brokers}
                    onChange={(e) => setNewCluster({ ...newCluster, brokers: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 text-slate-900 dark:text-white transition-colors"
                  />
                </div>
                <div className="pt-2">
                  <div className="flex items-center gap-2 mb-4">
                    <Shield size={16} className="text-slate-500" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">SASL Security (Optional)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      placeholder="Username"
                      value={newCluster.username}
                      onChange={(e) => setNewCluster({ ...newCluster, username: e.target.value })}
                      className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 text-slate-900 dark:text-white transition-colors"
                    />
                    <input
                      type="password"
                      placeholder="Password"
                      value={newCluster.password}
                      onChange={(e) => setNewCluster({ ...newCluster, password: e.target.value })}
                      className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 text-slate-900 dark:text-white transition-colors"
                    />
                  </div>
                </div>
              </div>
              <button
                onClick={() => addClusterMutation.mutate()}
                disabled={addClusterMutation.isPending || !newCluster.name || !newCluster.brokers}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl mt-8 transition-all shadow-xl shadow-blue-600/20 active:scale-95"
              >
                {addClusterMutation.isPending ? 'Connecting...' : 'Establish Connection'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Create Topic Modal */}
      {isCreatingTopic && (
        <div className="fixed inset-0 bg-black/50 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-8 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Create New Topic</h3>
                <p className="text-slate-500 text-sm mt-1">Configure topic name and partitions.</p>
              </div>
              <button
                onClick={() => setIsCreatingTopic(false)}
                className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                <Plus className="rotate-45" size={24} />
              </button>
            </div>
            <div className="p-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Topic Name</label>
                  <input
                    type="text"
                    placeholder="e.g. orders-stream"
                    value={newTopic.name}
                    onChange={(e) => setNewTopic({ ...newTopic, name: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 text-slate-900 dark:text-white transition-colors"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Partitions</label>
                    <input
                      type="number"
                      value={newTopic.partitions}
                      onChange={(e) => setNewTopic({ ...newTopic, partitions: parseInt(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 text-slate-900 dark:text-white transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Replication</label>
                    <input
                      type="number"
                      value={newTopic.replication}
                      onChange={(e) => setNewTopic({ ...newTopic, replication: parseInt(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 text-slate-900 dark:text-white transition-colors"
                    />
                  </div>
                </div>
              </div>
              {createTopicMutation.error && (
                <div className="mt-4 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl flex items-start gap-3">
                  <Shield size={16} className="text-red-500 mt-0.5" />
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium leading-relaxed">
                    {String(createTopicMutation.error)}
                  </p>
                </div>
              )}
              <button
                onClick={() => createTopicMutation.mutate()}
                disabled={createTopicMutation.isPending || !newTopic.name}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl mt-8 transition-all shadow-xl shadow-blue-600/20 active:scale-95"
              >
                {createTopicMutation.isPending ? 'Creating Topic...' : 'Create Topic'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  )
}

export default App
