import { readFile, writeFile } from "node:fs/promises";
import type { Job } from "./jobs.js";

/**
 * Persistence backend for jobs. The in-memory Map in jobs.ts stays the hot
 * read path (polling); the backend only makes a process restart survivable —
 * on Railway an OOM kill wipes memory and the ephemeral disk on redeploy, so
 * without a durable backend clients get "task lost in server" after a crash.
 */
export interface JobBackend {
  loadAll(): Promise<Job[]>;
  /** Persist the full current job set (counts are tiny, so no diffing). */
  sync(jobs: Job[]): Promise<void>;
  savePdf(id: string, data: Buffer): Promise<void>;
  loadPdf(id: string): Promise<Buffer | null>;
}

/** Local-disk fallback: metadata in a JSON file, PDFs already on disk. */
export class FileBackend implements JobBackend {
  constructor(
    private readonly storePath: string,
    private readonly pdfPath: (id: string) => string
  ) {}

  async loadAll(): Promise<Job[]> {
    try {
      return JSON.parse(await readFile(this.storePath, "utf8")) as Job[];
    } catch {
      return [];
    }
  }

  async sync(jobs: Job[]): Promise<void> {
    await writeFile(this.storePath, JSON.stringify(jobs));
  }

  // The pipeline already writes the PDF to disk at pdfPath(id); nothing to copy.
  async savePdf(): Promise<void> {}

  async loadPdf(id: string): Promise<Buffer | null> {
    return readFile(this.pdfPath(id)).catch(() => null);
  }
}

/**
 * MongoDB backend: job docs in a collection, output PDFs in GridFS so both
 * survive a restart/redeploy. Falls back to FileBackend if the connection
 * fails, so a bad URI never prevents the server from booting.
 */
export async function createBackend(
  fileBackend: FileBackend,
  opts: { uri?: string; dbName?: string }
): Promise<JobBackend> {
  const uri = opts.uri?.trim();
  if (!uri) return fileBackend;

  try {
    const { MongoClient, GridFSBucket } = await import("mongodb");
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    const db = client.db(opts.dbName?.trim() || undefined);
    const jobsCol = db.collection<Job & { _id: string }>("jobs");
    const bucket = new GridFSBucket(db, { bucketName: "jobPdfs" });
    console.log("job store: MongoDB connected");

    const streamToBuffer = async (stream: NodeJS.ReadableStream): Promise<Buffer> => {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      return Buffer.concat(chunks);
    };

    return {
      async loadAll(): Promise<Job[]> {
        const docs = await jobsCol.find().toArray();
        return docs.map(({ _id, ...job }) => job as Job);
      },

      async sync(jobs: Job[]): Promise<void> {
        const ids = jobs.map((j) => j.id);
        await jobsCol.deleteMany(ids.length ? { _id: { $nin: ids } } : {});
        if (jobs.length === 0) return;
        await jobsCol.bulkWrite(
          jobs.map((job) => ({
            replaceOne: { filter: { _id: job.id }, replacement: { _id: job.id, ...job }, upsert: true },
          }))
        );
      },

      async savePdf(id: string, data: Buffer): Promise<void> {
        // Replace any prior copy so re-runs of the same id don't accumulate.
        const existing = await bucket.find({ filename: id }).toArray();
        for (const file of existing) await bucket.delete(file._id).catch(() => {});
        await new Promise<void>((resolve, reject) => {
          const upload = bucket.openUploadStream(id);
          upload.on("error", reject).on("finish", () => resolve());
          upload.end(data);
        });
      },

      async loadPdf(id: string): Promise<Buffer | null> {
        try {
          const files = await bucket.find({ filename: id }).limit(1).toArray();
          if (files.length === 0) return null;
          return await streamToBuffer(bucket.openDownloadStreamByName(id));
        } catch {
          return null;
        }
      },
    };
  } catch (err) {
    console.error("job store: MongoDB unavailable, falling back to local file store:", err);
    return fileBackend;
  }
}
