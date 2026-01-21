import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import {
  listClusters,
  getCluster,
  saveCluster,
  updateCluster,
  deleteCluster,
  seedDefaultCluster,
  Cluster,
} from './db';
import {
  testConnection,
  listTopics,
  createTopic,
  publishMessage,
  consumeMessages,
  getTopicMessageCount,
} from './kafka';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

seedDefaultCluster();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

app.get(
  '/api/clusters',
  asyncHandler(async (_req, res) => {
    const clusters = listClusters();
    res.json(clusters);
  })
);

app.post(
  '/api/clusters',
  asyncHandler(async (req, res) => {
    const { cluster, password } = req.body as { cluster: Cluster; password?: string };
    if (!cluster.id) {
      cluster.id = uuidv4();
    }
    saveCluster(cluster, password);
    res.status(201).json({ success: true, id: cluster.id });
  })
);

app.put(
  '/api/clusters',
  asyncHandler(async (req, res) => {
    const { cluster, password } = req.body as { cluster: Cluster; password?: string };
    const existing = getCluster(cluster.id);
    if (!existing) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }
    updateCluster(cluster, password);
    res.json({ success: true });
  })
);

app.delete(
  '/api/clusters/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const existing = getCluster(id);
    if (!existing) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }
    deleteCluster(id);
    res.json({ success: true });
  })
);

app.get(
  '/api/clusters/:id/topics',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const cluster = getCluster(id);
    if (!cluster) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }
    const topics = await listTopics(cluster);
    res.json(topics);
  })
);

app.post(
  '/api/clusters/:id/topics',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const { name, partitions, replication } = req.body as {
      name: string;
      partitions: number;
      replication: number;
    };
    const cluster = getCluster(id);
    if (!cluster) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }
    await createTopic(cluster, name, partitions, replication);
    res.status(201).json({ success: true });
  })
);

app.post(
  '/api/clusters/:id/test-connection',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const cluster = getCluster(id);
    if (!cluster) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }
    await testConnection(cluster);
    res.json({ success: true });
  })
);

app.post(
  '/api/clusters/:id/publish',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const { topic, key, payload } = req.body as {
      topic: string;
      key?: string;
      payload: string;
    };
    const cluster = getCluster(id);
    if (!cluster) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }
    await publishMessage(cluster, topic, key ?? null, payload);
    res.json({ success: true });
  })
);

app.post(
  '/api/clusters/:id/consume',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const { topic, max_messages } = req.body as {
      topic: string;
      max_messages: number;
    };
    const cluster = getCluster(id);
    if (!cluster) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }
    const messages = await consumeMessages(cluster, topic, max_messages);
    res.json(messages);
  })
);

app.get(
  '/api/clusters/:id/topics/:topic/count',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const topic = req.params.topic as string;
    const cluster = getCluster(id);
    if (!cluster) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }
    const count = await getTopicMessageCount(cluster, topic);
    res.json(count);
  })
);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Kafkust server running on http://localhost:${PORT}`);
});
