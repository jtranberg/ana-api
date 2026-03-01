// src/webflow/client.ts
// Webflow Data API v2 client (read + write)

export type WebflowV2Item = {
  id: string;
  fieldData?: Record<string, any>;
  isArchived?: boolean;
  isDraft?: boolean;
  lastUpdated?: string;
  createdOn?: string;
  lastPublished?: string;
  cmsLocaleId?: string;
};

export type WebflowItemsResponse = {
  items: WebflowV2Item[];
  pagination?: {
    limit: number;
    offset: number;
    total: number;
  };
};

type WebflowRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
};

export class WebflowClient {
  private token: string;
  private apiBase = "https://api.webflow.com/v2";

  constructor(token: string) {
    if (!token) throw new Error("WEBFLOW_API_TOKEN is missing");
    this.token = token;
  }

  private async request<T>(path: string, opts: WebflowRequestOptions = {}): Promise<T> {
    const url = path.startsWith("http") ? path : `${this.apiBase}${path}`;

    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "accept-version": "2.0.0",
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    // simple 429 backoff + one retry
    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      const waitMs = retryAfter ? Number(retryAfter) * 1000 : 1000;
      await new Promise((r) => setTimeout(r, Number.isFinite(waitMs) ? waitMs : 1000));
      return this.request<T>(path, opts);
    }

    const data = (await res.json().catch(() => ({}))) as any;

    if (!res.ok) {
      const msg = data?.message || data?.error || data?.msg || res.statusText;
      throw new Error(`Webflow API error ${res.status} ${res.statusText}: ${msg}`);
    }

    return data as T;
  }

  // -------- READ --------
  async fetchItemsPage(collectionId: string, limit = 100, offset = 0): Promise<WebflowItemsResponse> {
    return this.request<WebflowItemsResponse>(
      `/collections/${collectionId}/items?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`
    );
  }

  async fetchAllItems(
    collectionId: string,
    opts: { limit?: number; includeDrafts?: boolean; includeArchived?: boolean } = {}
  ): Promise<WebflowV2Item[]> {
    const limit = opts.limit ?? 100;
    const includeDrafts = opts.includeDrafts ?? false;
    const includeArchived = opts.includeArchived ?? false;

    let offset = 0;
    const all: WebflowV2Item[] = [];

    while (true) {
      const page = await this.fetchItemsPage(collectionId, limit, offset);
      const items = page.items ?? [];
      all.push(...items);

      const total = page.pagination?.total;
      if (typeof total === "number") {
        offset += items.length;
        if (offset >= total) break;
      } else {
        if (items.length < limit) break;
        offset += limit;
      }
    }

    return all.filter((it) => {
      if (!includeDrafts && it.isDraft) return false;
      if (!includeArchived && it.isArchived) return false;
      return true;
    });
  }

  // -------- WRITE --------
  async createItem(collectionId: string, body: { fieldData: Record<string, unknown> }) {
    return this.request<WebflowV2Item>(`/collections/${collectionId}/items`, {
      method: "POST",
      body,
    });
  }

  async updateItem(collectionId: string, itemId: string, body: { fieldData: Record<string, unknown> }) {
    return this.request<WebflowV2Item>(`/collections/${collectionId}/items/${itemId}`, {
      method: "PATCH",
      body,
    });
  }
}