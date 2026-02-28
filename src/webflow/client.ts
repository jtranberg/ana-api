// src/webflow/client.ts
// Webflow Data API v2 client (read-only, CMS items + pagination)
// Render Node 22 supports global fetch.

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

export class WebflowClient {
  private token: string;
  private apiBase = "https://api.webflow.com/v2";

  constructor(token: string) {
    if (!token) throw new Error("WEBFLOW_API_TOKEN is missing");
    this.token = token;
  }

  private async request<T>(url: string): Promise<T> {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
    });

    // simple 429 backoff + one retry
    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      const waitMs = retryAfter ? Number(retryAfter) * 1000 : 1000;
      await new Promise((r) => setTimeout(r, Number.isFinite(waitMs) ? waitMs : 1000));
      return this.request<T>(url);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Webflow API error ${res.status} ${res.statusText}: ${text}`);
    }

    return (await res.json()) as T;
  }

  /**
   * Fetch one page of items for a collection (v2).
   * limit max is 100. :contentReference[oaicite:2]{index=2}
   */
  async fetchItemsPage(collectionId: string, limit = 100, offset = 0): Promise<WebflowItemsResponse> {
    const url =
      `${this.apiBase}/collections/${collectionId}/items` +
      `?limit=${encodeURIComponent(limit)}` +
      `&offset=${encodeURIComponent(offset)}`;

    return this.request<WebflowItemsResponse>(url);
  }

  /**
   * Fetch ALL items in a collection (handles pagination).
   * Filters out draft/archived by default (safer for syndication).
   */
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

      // v2 returns pagination.total when available; otherwise fallback to page size rule
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
}
