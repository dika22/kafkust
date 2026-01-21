import { QueryClient, QueryClientProvider, useQuery, useMutation } from '@tanstack/react-query'
import { apiBridge } from './api/bridge'
import { Database, RefreshCw, Plus, Server, Shield, HardDrive, Send, LayoutGrid, Sun, Moon, Inbox } from 'lucide-react'
import { useState, useEffect } from 'react'
import { ProducerLab } from './components/ProducerLab'
import { MessageViewer } from './components/MessageViewer'

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

interface ClusterInfo {
  brokers: { nodeId: number; host: string; port: number }[];
  controller: number | null;
  clusterId: string | null;
  totalPartitions: number;
  totalReplicas: number;
  inSyncReplicas: number;
  outOfSyncReplicas: number;
  onlineLeaders: number;
  offlinePartitions: number;
}

function Dashboard() {
  const [activeView, setActiveView] = useState<'topics' | 'producer' | 'consumer'>('topics');
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [isAddingCluster, setIsAddingCluster] = useState(false);
  const [editingCluster, setEditingCluster] = useState<Cluster | null>(null);
  const [isCreatingTopic, setIsCreatingTopic] = useState(false);
  const [newCluster, setNewCluster] = useState({ name: '', brokers: '', username: '', password: '' });
  const [newTopic, setNewTopic] = useState({ name: '', partitions: 3, replication: 1 });
  const [targetTopic, setTargetTopic] = useState<string>('');
  const [topicSearch, setTopicSearch] = useState('');
  const [selectedTopicForCount, setSelectedTopicForCount] = useState<string | null>(null);
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
    queryFn: () => apiBridge<Cluster[]>('list_clusters'),
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

      return await apiBridge('add_cluster', {
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

  // Update Cluster Mutation
  const updateClusterMutation = useMutation({
    mutationFn: async () => {
      if (!editingCluster) return;
      const cluster: Cluster = {
        id: editingCluster.id,
        name: newCluster.name,
        brokers: newCluster.brokers,
        security: newCluster.username ? {
          type: 'SaslSsl',
          config: { mechanism: 'Plain', username: newCluster.username }
        } : { type: 'Plaintext' }
      };

      return await apiBridge('update_cluster', {
        cluster,
        password: newCluster.password || null
      });
    },
    onSuccess: () => {
      refetchClusters();
      setIsAddingCluster(false);
      setEditingCluster(null);
      setNewCluster({ name: '', brokers: '', username: '', password: '' });
    },
  });

  // Create Topic Mutation
  const createTopicMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClusterId) return;
      return await apiBridge('create_topic', {
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
      return await apiBridge('delete_cluster', { clusterId: id });
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
      return await apiBridge<Topic[]>('list_topics', { clusterId: selectedClusterId });
    },
    placeholderData: (prev) => prev,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  })

  // Fetch Message Count for Selected Topic
  const { data: topicMessageCount, isLoading: isLoadingMessageCount } = useQuery<number>({
    queryKey: ['topicMessageCount', selectedClusterId, selectedTopicForCount],
    enabled: !!selectedClusterId && !!selectedTopicForCount,
    queryFn: async () => {
      if (!selectedClusterId || !selectedTopicForCount) return 0;
      return await apiBridge<number>('get_topic_message_count', {
        clusterId: selectedClusterId,
        topic: selectedTopicForCount
      });
    },
    staleTime: 30000,
    gcTime: 60000,
    refetchOnWindowFocus: false,
  })

  // Fetch Cluster Info
  const { data: clusterInfo } = useQuery<ClusterInfo>({
    queryKey: ['clusterInfo', selectedClusterId],
    enabled: !!selectedClusterId,
    queryFn: async () => {
      if (!selectedClusterId) throw new Error('No cluster');
      return await apiBridge<ClusterInfo>('get_cluster_info', { clusterId: selectedClusterId });
    },
    staleTime: 60000,
    refetchOnWindowFocus: false,
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
          <div key={cluster.id} className="relative group/btn">
            <button
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
                setEditingCluster(cluster);
                setNewCluster({
                  name: cluster.name,
                  brokers: cluster.brokers,
                  username: cluster.security.type === 'SaslSsl' ? cluster.security.config.username : '',
                  password: ''
                });
                setIsAddingCluster(true);
              }}
              className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/btn:opacity-100 transition-opacity shadow-sm z-10"
              title="Edit Cluster"
            >
              <RefreshCw size={10} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('Delete this cluster?')) deleteClusterMutation.mutate(cluster.id);
              }}
              className="absolute -bottom-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/btn:opacity-100 transition-opacity shadow-sm z-10"
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
        <button
          onClick={toggleTheme}
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-all text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-amber-500/10 dark:hover:bg-slate-800 group"
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? <Sun size={20} className="group-hover:scale-110 transition-transform" /> : <Moon size={20} className="group-hover:scale-110 transition-transform" />}
        </button>
      </div>

      {/* Workspace Sidebar */}
      <div className="w-48 md:w-60 border-r border-slate-200 dark:border-slate-900 flex flex-col bg-slate-50/50 dark:bg-slate-950/40 backdrop-blur-xl shrink-0 overflow-y-auto">
        <div className="p-4 md:p-6 pb-2">
          <h1 className="text-dynamic-lg md:text-dynamic-xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
            {clusters?.find(c => c.id === selectedClusterId)?.name || 'Local Kafka'}
          </h1>
          <div className="text-dynamic-2xs text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest font-bold">
            {clusters?.find(c => c.id === selectedClusterId)?.brokers || 'LOCALHOST:9092'}
          </div>
        </div>

        <nav className="p-2 md:p-3 space-y-0.5 md:space-y-1 border-b border-slate-200 dark:border-slate-900">
          <button
            onClick={() => setActiveView('topics')}
            className={`w-full flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-2.5 rounded-xl text-dynamic-sm font-bold transition-all ${activeView === 'topics' ? 'bg-blue-600/10 text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900'}`}
          >
            <LayoutGrid className="w-4 h-4 md:w-5 md:h-5" />
            Topics
          </button>
          <button
            onClick={() => setActiveView('producer')}
            className={`w-full flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-2.5 rounded-xl text-dynamic-sm font-bold transition-all ${activeView === 'producer' ? 'bg-blue-600/10 text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900'}`}
          >
            <Send className="w-4 h-4 md:w-5 md:h-5" />
            Producer
          </button>
          <button
            onClick={() => setActiveView('consumer')}
            className={`w-full flex items-center gap-2 md:gap-3 px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-dynamic-sm font-semibold transition-all ${activeView === 'consumer' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-900'}`}
          >
            <Inbox className="w-4 h-4 md:w-5 md:h-5" />
            Consumer
          </button>
        </nav>

        <div className="w-full h-px bg-slate-100 dark:bg-slate-800 my-2 md:my-4"></div>

        <nav className="flex-1 px-1.5 md:px-2 space-y-0.5 overflow-y-auto">
          <div className="text-dynamic-2xs text-slate-400 dark:text-slate-500 uppercase tracking-widest font-bold px-2 mb-1">Topics</div>
          {isLoadingTopics ? (
            <div className="flex items-center justify-center py-2">
              <div className="w-3 h-3 border-2 border-slate-200 dark:border-slate-700 border-t-blue-500 rounded-full animate-spin"></div>
            </div>
          ) : topics?.length === 0 ? (
            <div className="text-dynamic-2xs text-slate-400 dark:text-slate-500 px-2 py-1">No topics</div>
          ) : (
            topics?.filter((topic) => topic.name.toLowerCase().includes(topicSearch.toLowerCase())).map((topic) => (
              <button
                key={topic.name}
                onClick={() => {
                  setTargetTopic(topic.name);
                  setActiveView('consumer');
                }}
                className={`w-full flex items-center gap-1.5 md:gap-2 px-1.5 md:px-2 py-1 md:py-1.5 rounded text-dynamic-xs transition-all text-left ${targetTopic === topic.name
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
              >
                <HardDrive className="w-3 h-3 md:w-4 md:h-4 shrink-0 opacity-60" />
                <span className="truncate">{topic.name}</span>
              </button>
            ))
          )}
        </nav>

        <div className="p-2 md:p-4 border-t border-slate-200 dark:border-slate-900">
          <div className="p-2 md:p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
            <div className="text-dynamic-2xs uppercase tracking-widest font-bold text-slate-400 mb-2">Cluster Health</div>
            <div className="flex items-center gap-1.5 md:gap-2 text-dynamic-sm font-semibold text-green-500">
              <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
              Active Connection
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-slate-950 min-w-0 w-full">
        {activeView === 'topics' ? (
          <>
            <header className="border-b border-slate-100 dark:border-slate-800 px-4 md:px-8 py-3 md:py-4 sticky top-0 z-10 bg-white dark:bg-slate-950">
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <div className="flex items-center gap-2 md:gap-3">
                  <h2 className="text-dynamic-lg md:text-dynamic-xl font-bold text-slate-900 dark:text-white">Topics Explorer</h2>
                  <span className="bg-slate-100 dark:bg-slate-800 px-1.5 md:px-2 py-0.5 rounded-full text-dynamic-2xs font-bold text-slate-500 dark:text-slate-400">
                    {topics?.length || 0} TOPICS
                  </span>
                </div>
                <div className="flex gap-1.5 md:gap-2">
                  <input
                    type="text"
                    placeholder="Search..."
                    value={topicSearch}
                    onChange={(e) => setTopicSearch(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 md:px-3 py-1 md:py-1.5 text-dynamic-xs focus:outline-none focus:border-blue-500/50 w-32 md:w-48 text-slate-900 dark:text-white placeholder:text-slate-400"
                  />
                  <button
                    onClick={() => refetchTopics()}
                    className="p-1 md:p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 border border-slate-200 dark:border-slate-800"
                  >
                    <RefreshCw className={`w-3 h-3 md:w-4 md:h-4 ${isLoadingTopics ? "animate-spin" : ""}`} />
                  </button>
                  <button
                    onClick={() => setIsCreatingTopic(true)}
                    className="flex items-center gap-1 md:gap-1.5 bg-blue-600 hover:bg-blue-700 px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-dynamic-xs font-semibold text-white"
                  >
                    <Plus className="w-3 h-3 md:w-4 md:h-4" />
                    Create
                  </button>
                </div>
              </div>
              {clusterInfo && (
                <div className="flex flex-wrap items-center gap-2 md:gap-4 text-dynamic-2xs font-bold uppercase tracking-wider">
                  <div className="flex items-center gap-1 md:gap-1.5 text-slate-500 dark:text-slate-400">
                    <Server className="w-3 h-3 md:w-4 md:h-4" />
                    <span>{clusterInfo.brokers.length} Brokers</span>
                  </div>
                  <div className="flex items-center gap-1 md:gap-1.5 text-blue-500">
                    <span>{clusterInfo.totalPartitions} Partitions</span>
                  </div>
                  <div className="flex items-center gap-1 md:gap-1.5 text-green-500">
                    <span>{clusterInfo.onlineLeaders} Leaders</span>
                  </div>
                  <div className="flex items-center gap-1 md:gap-1.5 text-emerald-500">
                    <span>{clusterInfo.inSyncReplicas} ISR</span>
                  </div>
                  {clusterInfo.outOfSyncReplicas > 0 && (
                    <div className="flex items-center gap-1 md:gap-1.5 text-orange-500">
                      <span>{clusterInfo.outOfSyncReplicas} Out-of-Sync</span>
                    </div>
                  )}
                  {clusterInfo.offlinePartitions > 0 && (
                    <div className="flex items-center gap-1 md:gap-1.5 text-red-500">
                      <span>{clusterInfo.offlinePartitions} Offline</span>
                    </div>
                  )}
                </div>
              )}
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
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3">
                  {topics?.filter((topic) => topic.name.toLowerCase().includes(topicSearch.toLowerCase())).map((topic) => {
                    const isSelected = selectedTopicForCount === topic.name;
                    return (
                      <div
                        key={topic.name}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isSelected) {
                            setTargetTopic(topic.name);
                            setActiveView('consumer');
                          } else {
                            setSelectedTopicForCount(topic.name);
                          }
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setTargetTopic(topic.name);
                          setActiveView('consumer');
                        }}
                        className={`bg-white dark:bg-slate-900 border rounded-lg md:rounded-xl p-2 md:p-3 transition-all hover:shadow-md dark:hover:shadow-none group cursor-pointer flex flex-col ${isSelected
                          ? 'border-blue-500 ring-1 ring-blue-500'
                          : 'border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-slate-700'
                          }`}
                      >
                        <div className="flex items-center gap-1.5 md:gap-2 mb-1.5 md:mb-2">
                          <div className="w-5 h-5 md:w-7 md:h-7 rounded-md md:rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                            <HardDrive className="w-3 h-3 md:w-4 md:h-4" strokeWidth={1.5} />
                          </div>
                          <h3 className="text-dynamic-sm font-bold truncate text-slate-900 dark:text-white flex-1">{topic.name}</h3>
                        </div>

                        <div className="flex flex-wrap gap-1.5 md:gap-2 text-dynamic-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                          <div className="flex items-center gap-0.5 md:gap-1">
                            <div className="w-1 h-1 rounded-full bg-blue-400"></div>
                            {topic.partitions}P
                          </div>
                          <div className="flex items-center gap-0.5 md:gap-1">
                            <div className="w-1 h-1 rounded-full bg-blue-400"></div>
                            {topic.replication_factor}R
                          </div>
                          {isSelected && (
                            <div className="flex items-center gap-0.5 md:gap-1 text-green-500">
                              <div className="w-1 h-1 rounded-full bg-green-500"></div>
                              {isLoadingMessageCount ? '...' : `${topicMessageCount?.toLocaleString() ?? 0}M`}
                            </div>
                          )}
                        </div>

                        {isSelected && (
                          <div className="mt-1.5 md:mt-2 pt-1.5 md:pt-2 border-t border-slate-100 dark:border-slate-800/50">
                            <div className="text-dynamic-2xs text-blue-600 dark:text-blue-400 font-semibold">
                              Click to view messages
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </main>
          </>
        ) : activeView === 'producer' ? (
          <ProducerLab
            selectedClusterId={selectedClusterId}
            initialTopic={targetTopic}
            onTopicChange={setTargetTopic}
            theme={theme}
          />
        ) : (
          <MessageViewer
            selectedClusterId={selectedClusterId}
            topic={targetTopic}
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
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  {editingCluster ? 'Edit Kafka Connection' : 'New Kafka Connection'}
                </h3>
                <p className="text-slate-500 text-sm mt-1">
                  {editingCluster ? 'Update your cluster access profile.' : 'Configure your cluster access profile.'}
                </p>
              </div>
              <button
                onClick={() => {
                  setIsAddingCluster(false);
                  setEditingCluster(null);
                  setNewCluster({ name: '', brokers: '', username: '', password: '' });
                }}
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
                onClick={() => editingCluster ? updateClusterMutation.mutate() : addClusterMutation.mutate()}
                disabled={
                  (editingCluster ? updateClusterMutation.isPending : addClusterMutation.isPending) ||
                  !newCluster.name || !newCluster.brokers
                }
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl mt-8 transition-all shadow-xl shadow-blue-600/20 active:scale-95"
              >
                {editingCluster
                  ? (updateClusterMutation.isPending ? 'Updating...' : 'Update Connection')
                  : (addClusterMutation.isPending ? 'Connecting...' : 'Establish Connection')
                }
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
