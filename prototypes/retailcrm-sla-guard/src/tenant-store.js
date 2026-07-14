import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const EMPTY_STORE = Object.freeze({ version: 1, tenants: {} });

export class TenantStore {
  #queue = Promise.resolve();

  constructor(filePath) {
    this.filePath = filePath;
  }

  #runExclusive(operation) {
    const result = this.#queue.then(operation, operation);
    this.#queue = result.catch(() => {});
    return result;
  }

  async #readUnlocked() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      if (!parsed || parsed.version !== 1 || typeof parsed.tenants !== "object") {
        throw new Error("Unsupported tenant store format");
      }
      return parsed;
    } catch (error) {
      if (error.code === "ENOENT") return structuredClone(EMPTY_STORE);
      throw error;
    }
  }

  async #writeUnlocked(store) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempFile = `${this.filePath}.tmp`;
    await writeFile(tempFile, `${JSON.stringify(store, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(tempFile, this.filePath);
  }

  async get(clientId) {
    return this.#runExclusive(async () => {
      const store = await this.#readUnlocked();
      const tenant = store.tenants[clientId];
      return tenant ? structuredClone(tenant) : null;
    });
  }

  async list() {
    return this.#runExclusive(async () => {
      const store = await this.#readUnlocked();
      return Object.values(store.tenants).map((tenant) => structuredClone(tenant));
    });
  }

  async upsert(clientId, changes) {
    return this.#runExclusive(async () => {
      const store = await this.#readUnlocked();
      const current = store.tenants[clientId] || { clientId };
      const next = {
        ...current,
        ...structuredClone(changes),
        clientId,
        updatedAt: new Date().toISOString(),
      };
      store.tenants[clientId] = next;
      await this.#writeUnlocked(store);
      return structuredClone(next);
    });
  }

  async remove(clientId) {
    return this.#runExclusive(async () => {
      const store = await this.#readUnlocked();
      const existed = Boolean(store.tenants[clientId]);
      delete store.tenants[clientId];
      if (existed) await this.#writeUnlocked(store);
      return existed;
    });
  }
}
