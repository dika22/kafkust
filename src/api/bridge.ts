// Detect if running in Tauri
const isTauri = () => {
  return typeof window !== 'undefined' && '__TAURI__' in window;
};

// API base URL for web mode
const API_BASE = 'http://localhost:3001/api';

// Helper to convert camelCase to snake_case for HTTP API
const toSnakeCase = (str: string): string => {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
};

// Convert object keys from camelCase to snake_case
const convertKeysToSnakeCase = (obj: Record<string, any>): Record<string, any> => {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[toSnakeCase(key)] = value;
  }
  return result;
};

// HTTP request helper
async function httpRequest<T>(method: string, path: string, body?: any): Promise<T> {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(`${API_BASE}${path}`, options);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `HTTP ${response.status}`);
  }
  
  return response.json();
}

// Command to HTTP endpoint mapping
type CommandMapper = (args?: Record<string, any>) => Promise<any>;

const commandMappings: Record<string, CommandMapper> = {
  // Cluster commands
  list_clusters: () => httpRequest('GET', '/clusters'),
  
  add_cluster: (args) => httpRequest('POST', '/clusters', convertKeysToSnakeCase(args || {})),
  
  update_cluster: (args) => httpRequest('PUT', '/clusters', convertKeysToSnakeCase(args || {})),
  
  delete_cluster: (args) => httpRequest('DELETE', `/clusters/${args?.clusterId}`),
  
  test_connection: (args) => httpRequest('POST', `/clusters/${args?.clusterId}/test-connection`),
  
  // Topic commands
  list_topics: (args) => httpRequest('GET', `/clusters/${args?.clusterId}/topics`),
  
  create_topic: (args) => {
    const { clusterId, ...rest } = args || {};
    return httpRequest('POST', `/clusters/${clusterId}/topics`, convertKeysToSnakeCase(rest));
  },
  
  get_topic_message_count: (args) => 
    httpRequest('GET', `/clusters/${args?.clusterId}/topics/${encodeURIComponent(args?.topic)}/count`),
  
  // Message commands
  publish_message: (args) => {
    const { clusterId, ...rest } = args || {};
    return httpRequest('POST', `/clusters/${clusterId}/publish`, convertKeysToSnakeCase(rest));
  },
  
  consume_messages: (args) => {
    const { clusterId, ...rest } = args || {};
    return httpRequest('POST', `/clusters/${clusterId}/consume`, convertKeysToSnakeCase(rest));
  },
};

// Bridge function that calls Tauri invoke or HTTP API
export async function apiBridge<T>(command: string, args?: Record<string, any>): Promise<T> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(command, args);
  }
  
  // Use HTTP API mapping
  const mapper = commandMappings[command];
  if (!mapper) {
    throw new Error(`Unknown command: ${command}`);
  }
  
  return mapper(args) as Promise<T>;
}

// Export for testing/debugging
export { isTauri, API_BASE };
