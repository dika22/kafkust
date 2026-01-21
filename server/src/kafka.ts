import { Kafka, Admin, Producer, Consumer, SASLOptions, logLevel } from 'kafkajs';
import { Cluster, SecurityConfig, getPassword } from './db';
import fs from 'fs';

export interface Topic {
  name: string;
  partitions: number;
  replication_factor: number;
}

export interface KafkaMessage {
  partition: number;
  offset: number;
  timestamp: number | null;
  key: string | null;
  payload: string | null;
}

export interface BrokerInfo {
  nodeId: number;
  host: string;
  port: number;
}

export interface ClusterInfo {
  brokers: BrokerInfo[];
  controller: number | null;
  clusterId: string | null;
  totalPartitions: number;
  totalReplicas: number;
  inSyncReplicas: number;
  outOfSyncReplicas: number;
  onlineLeaders: number;
  offlinePartitions: number;
}

function createKafkaClient(cluster: Cluster, password?: string | null): Kafka {
  const brokers = cluster.brokers.split(',').map((b) => b.trim());

  const config: ConstructorParameters<typeof Kafka>[0] = {
    clientId: 'kafkust-server',
    brokers,
    logLevel: logLevel.WARN,
  };

  if (cluster.security.type === 'SaslSsl') {
    const sec = cluster.security.config;
    let mechanism: SASLOptions['mechanism'];
    switch (sec.mechanism) {
      case 'Plain':
        mechanism = 'plain';
        break;
      case 'ScramSha256':
        mechanism = 'scram-sha-256';
        break;
      case 'ScramSha512':
        mechanism = 'scram-sha-512';
        break;
      default:
        mechanism = 'plain';
    }

    config.sasl = {
      mechanism,
      username: sec.username,
      password: password ?? '',
    } as SASLOptions;

    config.ssl = sec.ca_location
      ? { ca: [fs.readFileSync(sec.ca_location, 'utf-8')] }
      : true;
  } else if (cluster.security.type === 'Ssl') {
    const sec = cluster.security.config;
    config.ssl = {
      ca: sec.ca_location ? [fs.readFileSync(sec.ca_location, 'utf-8')] : undefined,
      cert: sec.certificate_location ? fs.readFileSync(sec.certificate_location, 'utf-8') : undefined,
      key: sec.key_location ? fs.readFileSync(sec.key_location, 'utf-8') : undefined,
      passphrase: sec.key_password,
    };
  }

  return new Kafka(config);
}

export async function testConnection(cluster: Cluster): Promise<void> {
  const password = getPassword(cluster.id);
  const kafka = createKafkaClient(cluster, password);
  const admin = kafka.admin();
  try {
    await admin.connect();
    await admin.listTopics();
  } finally {
    await admin.disconnect();
  }
}

export async function listTopics(cluster: Cluster): Promise<Topic[]> {
  const password = getPassword(cluster.id);
  const kafka = createKafkaClient(cluster, password);
  const admin = kafka.admin();
  try {
    await admin.connect();
    const topics = await admin.listTopics();
    const metadata = await admin.fetchTopicMetadata({ topics });

    return metadata.topics.map((t) => ({
      name: t.name,
      partitions: t.partitions.length,
      replication_factor: t.partitions[0]?.replicas?.length ?? 1,
    }));
  } finally {
    await admin.disconnect();
  }
}

export async function createTopic(
  cluster: Cluster,
  name: string,
  partitions: number,
  replicationFactor: number
): Promise<void> {
  const password = getPassword(cluster.id);
  const kafka = createKafkaClient(cluster, password);
  const admin = kafka.admin();
  try {
    await admin.connect();
    await admin.createTopics({
      topics: [{ topic: name, numPartitions: partitions, replicationFactor }],
      timeout: 30000,
    });
  } finally {
    await admin.disconnect();
  }
}

export async function publishMessage(
  cluster: Cluster,
  topic: string,
  key: string | null,
  payload: string
): Promise<void> {
  const password = getPassword(cluster.id);
  const kafka = createKafkaClient(cluster, password);
  const producer = kafka.producer();
  try {
    await producer.connect();
    await producer.send({
      topic,
      messages: [{ key: key ?? undefined, value: payload }],
    });
  } finally {
    await producer.disconnect();
  }
}

export async function consumeMessages(
  cluster: Cluster,
  topic: string,
  maxMessages: number
): Promise<KafkaMessage[]> {
  const password = getPassword(cluster.id);
  const kafka = createKafkaClient(cluster, password);
  const admin = kafka.admin();

  try {
    await admin.connect();
    const offsets = await admin.fetchTopicOffsets(topic);

    const messages: KafkaMessage[] = [];
    const groupId = `kafkust-browser-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const consumer = kafka.consumer({ groupId });

    await consumer.connect();

    // Calculate starting offsets for each partition to get recent messages
    // Use both low and high offsets to ensure we stay within valid range
    const messagesPerPartition = Math.ceil(maxMessages / offsets.length);
    const partitionStartOffsets = offsets.map((o) => {
      const lowOffset = parseInt(o.low, 10);
      const highOffset = parseInt(o.high, 10);
      const calculatedStart = highOffset - messagesPerPartition;
      // Ensure startOffset is within valid range [low, high)
      const startOffset = Math.max(lowOffset, calculatedStart);
      return {
        partition: o.partition,
        startOffset,
        lowOffset,
        highOffset,
        hasMessages: highOffset > lowOffset,
      };
    });

    // Subscribe and seek to calculated offsets
    await consumer.subscribe({ topic, fromBeginning: true });

    let resolveMessages: () => void;
    const messagesPromise = new Promise<void>((resolve) => {
      resolveMessages = resolve;
    });

    await consumer.run({
      autoCommit: false,
      eachMessage: async ({ partition, message }) => {
        if (messages.length >= maxMessages) {
          return;
        }
        messages.push({
          partition,
          offset: parseInt(message.offset, 10),
          timestamp: message.timestamp ? parseInt(message.timestamp, 10) : null,
          key: message.key?.toString() ?? null,
          payload: message.value?.toString() ?? null,
        });
        if (messages.length >= maxMessages) {
          resolveMessages();
        }
      },
    });

    // Seek to starting offsets (only for partitions that have messages)
    for (const po of partitionStartOffsets) {
      if (po.hasMessages) {
        consumer.seek({ topic, partition: po.partition, offset: po.startOffset.toString() });
      }
    }

    // Wait for messages or timeout
    const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 5000));
    await Promise.race([messagesPromise, timeoutPromise]);

    await consumer.stop();
    await consumer.disconnect();

    // Sort by timestamp descending (most recent first)
    messages.sort((a, b) => {
      if (a.timestamp && b.timestamp) return b.timestamp - a.timestamp;
      return b.offset - a.offset;
    });

    return messages.slice(0, maxMessages);
  } finally {
    await admin.disconnect();
  }
}

export async function getTopicMessageCount(cluster: Cluster, topic: string): Promise<number> {
  const password = getPassword(cluster.id);
  const kafka = createKafkaClient(cluster, password);
  const admin = kafka.admin();

  try {
    await admin.connect();
    const offsets = await admin.fetchTopicOffsets(topic);
    const earliestOffsets = await admin.fetchTopicOffsetsByTimestamp(topic, -2);

    let total = 0;
    for (const o of offsets) {
      const high = parseInt(o.high, 10);
      const earliest = earliestOffsets.find((e) => e.partition === o.partition);
      const low = earliest ? parseInt(earliest.offset, 10) : 0;
      total += high - low;
    }
    return total;
  } finally {
    await admin.disconnect();
  }
}

export async function getClusterInfo(cluster: Cluster): Promise<ClusterInfo> {
  const password = getPassword(cluster.id);
  const kafka = createKafkaClient(cluster, password);
  const admin = kafka.admin();

  try {
    await admin.connect();
    
    const clusterData = await admin.describeCluster();
    const topics = await admin.listTopics();
    const metadata = await admin.fetchTopicMetadata({ topics });
    
    let totalPartitions = 0;
    let totalReplicas = 0;
    let inSyncReplicas = 0;
    let onlineLeaders = 0;
    let offlinePartitions = 0;

    for (const topic of metadata.topics) {
      for (const partition of topic.partitions) {
        totalPartitions++;
        totalReplicas += partition.replicas.length;
        inSyncReplicas += partition.isr.length;
        
        if (partition.leader >= 0) {
          onlineLeaders++;
        } else {
          offlinePartitions++;
        }
      }
    }

    const outOfSyncReplicas = totalReplicas - inSyncReplicas;

    return {
      brokers: clusterData.brokers.map((b) => ({
        nodeId: b.nodeId,
        host: b.host,
        port: b.port,
      })),
      controller: clusterData.controller ?? null,
      clusterId: clusterData.clusterId ?? null,
      totalPartitions,
      totalReplicas,
      inSyncReplicas,
      outOfSyncReplicas,
      onlineLeaders,
      offlinePartitions,
    };
  } finally {
    await admin.disconnect();
  }
}
